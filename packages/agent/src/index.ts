import { routeAgentRequest, type Connection, type ConnectionContext, callable } from "agents";
export { Sandbox } from "@cloudflare/sandbox";
import { AIChatAgent, type OnChatMessageOptions } from "agents/ai-chat-agent";
import { generateText, type StreamTextOnFinishCallback, type ToolSet, Output } from "ai";
import type { PlanAgent } from "@voltagent/core";
import { createAiClient } from "./client";
import { SYSTEM_PROMPT } from "./prompt";
import { SandboxFilesystemBackend, createSandboxToolkit } from "./tools/sandbox";
import { createWebSearchTool } from "./tools/websearch";
import type { worker } from "../alchemy.run";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { z } from "zod";

// State type for chat settings synced from frontend
type ChatState = {
  model: string;
  reasoningEffort?: "low" | "medium" | "high";
  yolo?: boolean;
};

export default {
  async fetch(request: Request, env: typeof worker.Env): Promise<Response> {
    // Get origin for CORS (credentials require specific origin, not *)
    const origin = env.SITE_URL;

    return (
      (await routeAgentRequest(request, env, {
        prefix: 'agents',
        cors: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Extensions, Sec-WebSocket-Protocol',
          'Access-Control-Max-Age': '86400',
        },
      })) || new Response('Not found', { status: 404 })
    );
  },
};

export class AgentWorker extends AIChatAgent<typeof worker.Env, ChatState> {
  private convexClient: ConvexHttpClient | null = null;
  private planAgent: PlanAgent | null = null;
  private sandboxId: string | null = null;

  private async generateTitle(userMessage: string): Promise<void> {
    if (!this.convexClient) return;

    try {
      const { output } = await generateText({
        model: createAiClient("openai/gpt-oss-20b"),
        output: Output.object({
          schema: z.object({
            title: z.string().describe("A short, concise title (max 6 words) for a chat conversation based on the user's first message.").max(64).min(1),
          }),
        }),
        prompt: userMessage,
      });

      const title = output.title;
      if (title) {
        await this.convexClient.mutation(api.chats.index.update, {
          _id: this.name as Id<"chats">,
          patch: { title },
        });
      }
    } catch (error) {
      console.error("Failed to generate title:", error);
    }
  }
  
  private async _init(request: Request): Promise<void> {
    const token = (new URL(request.url)).searchParams.get('token');
    const sandboxId = (new URL(request.url)).searchParams.get('sandboxId');
    const model = (new URL(request.url)).searchParams.get('model');
    const reasoningEffort = (new URL(request.url)).searchParams.get('reasoningEffort') as "low" | "medium" | "high" | undefined;
    const yolo = (new URL(request.url)).searchParams.get('yolo') === 'true';
    this.sandboxId = sandboxId;
    if (!model) {
      throw new Error("Model not provided");
    }
    this.setState({ ...this.state, model, reasoningEffort, yolo });

    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    if (!this.convexClient) {
      this.convexClient = new ConvexHttpClient(this.env.CONVEX_URL);
      this.convexClient.setAuth(token);

      // get the chat
      const chat = await this.convexClient.query(api.chats.index.get, {
        _id: this.name as Id<"chats">
      });
      if (!chat) {
        throw new Error("Unauthorized: No chat found");
      }
    }
  }

  private async _prepAgent(): Promise<PlanAgent> {
    const { PlanAgent, createVoltAgentObservability } = await import("@voltagent/core");

    const filesystemBackend = this.sandboxId ? new SandboxFilesystemBackend(this.env, this.sandboxId) : undefined;

    const agent = new PlanAgent({
      name: "Assistant",
      systemPrompt: SYSTEM_PROMPT,
      model: createAiClient(this.state.model, this.state.reasoningEffort),
      tools: [
        ...(filesystemBackend ? [createSandboxToolkit(filesystemBackend)] : []),
        createWebSearchTool()
      ],
      toolResultEviction: {
        enabled: true,
        tokenLimit: 20000,
      },
      maxSteps: 100,
      ...(this.env.VOLTAGENT_OBSERVABILITY_ENABLED === 'true' ? {
        observability: createVoltAgentObservability({
          serviceName: "just-use-convex-agent",
          serviceVersion: "1.0.0",
          voltOpsSync: {
            sampling: {
              strategy: "always"
            },
            maxQueueSize: 2048,
            maxExportBatchSize: 512,
            scheduledDelayMillis: 5000,
            exportTimeoutMillis: 30000,
          },
        }),
      } : {}),
    });
    await this._patchAgent();
    this.planAgent = agent;
    return agent;
  }

  private async _patchAgent(): Promise<void> {
    const agent = this.planAgent;
    if (!agent) return;

    const writeTodos = agent.getTools().find(t => t.name === "write_todos");
    if (writeTodos && !this.state?.yolo) {
      Object.defineProperty(writeTodos, 'needsApproval', {
        value: async ({ todos }: { todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'done'; id?: string }> }) => {
          if (todos.every(t => t.status === "pending")) {
            return true;
          }
          return false;
        },
        writable: true,
        configurable: true,
      });
    }

    const model = this.state.model
    const reasoningEffort = this.state.reasoningEffort;
    if (model) {
      Object.defineProperty(agent, 'model', {
        value: createAiClient(model, reasoningEffort),
        writable: true,
        configurable: true,
      });
    }
  }

  override async onStart(props?: Record<string, unknown> | undefined): Promise<void> {
    await this._prepAgent();
    return await super.onStart(props);
  }

  override async onRequest(request: Request): Promise<Response> {
    await this._init(request);
    return await super.onRequest(request);
  }

  override async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    await this._init(ctx.request);
    return await super.onConnect(connection, ctx);
  }

  override async onStateUpdate(state: ChatState, source: Connection | "server"): Promise<void> {
    await this._patchAgent();
    await super.onStateUpdate(state, source);
  }

  @callable()
  async updateMessages(messages: Parameters<typeof this.persistMessages>[0]) {
    // Get the IDs of messages to keep
    const keepIds = new Set(messages.map(m => m.id));
    
    // Delete messages that are no longer in the list
    const existingMessages = this.messages;
    for (const msg of existingMessages) {
      if (!keepIds.has(msg.id)) {
        this.sql`DELETE FROM cf_ai_chat_agent_messages WHERE id = ${msg.id}`;
      }
    }
    
    // Persist the new message set
    await this.persistMessages(messages);
  }

  override async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions
  ): Promise<Response> {
    try {
      // Generate title for first message (fire and forget)
      if (this.messages.length === 1) {
        const firstMessage = this.messages[0];
        const textContent = firstMessage?.parts
          ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" ");
        if (textContent) {
          this.generateTitle(textContent);
        }
      }

      const agent = this.planAgent || (await this._prepAgent());
      const stream = await agent?.streamText(this.messages, {
        abortSignal: options?.abortSignal
      })

      return stream.toUIMessageStreamResponse();
    } catch (error) {
      console.error("Error in onChatMessage:", error);
      return new Response("Internal Server Error: " + JSON.stringify(error, null, 2), { status: 500 });
    }
  }
}
