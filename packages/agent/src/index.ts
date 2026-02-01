import { routeAgentRequest, type Connection, type ConnectionContext, callable } from "agents";
export { Sandbox } from "@cloudflare/sandbox";
import { AIChatAgent, type OnChatMessageOptions } from "agents/ai-chat-agent";
import { generateText, type StreamTextOnFinishCallback, type ToolSet, Output } from "ai";
import type { PlanAgent } from "@voltagent/core";
import { createAiClient } from "./client";
import { SYSTEM_PROMPT, TASK_PROMPT } from "./prompt";
import { SandboxFilesystemBackend, createSandboxToolkit } from "./tools/sandbox";
import { createWebSearchToolkit } from "./tools/websearch";
import { withBackgroundTaskTools, patchToolWithBackgroundSupport } from "./tools/utils";
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
  private lastAppliedModel: string | null = null;
  private lastAppliedReasoningEffort: "low" | "medium" | "high" | undefined = undefined;

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
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const model = url.searchParams.get('model');
    const reasoningEffort = url.searchParams.get('reasoningEffort') as "low" | "medium" | "high" | undefined;
    const yolo = url.searchParams.get('yolo') === 'true';

    // Only update state if we have new values and state doesn't exist yet
    const state = this.state ?? {};
    if (
      (!state.model && model) ||
      (!state.reasoningEffort && reasoningEffort) ||
      (!state.yolo && yolo)
    ) {
      this.setState({
        ...state,
        ...(model && { model }),
        ...(reasoningEffort && { reasoningEffort }),
        ...(yolo && { yolo }),
      });
    }

    // Only require token on first connection
    if (!this.convexClient) {
      if (!token) {
        throw new Error("Unauthorized: No token provided");
      }
      this.convexClient = new ConvexHttpClient(this.env.CONVEX_URL);
      this.convexClient.setAuth(token);

      const chat = await this.convexClient.query(api.chats.index.get, {
        _id: this.name as Id<"chats">
      });
      if (!chat) {
        throw new Error("Unauthorized: No chat found");
      }
      // Derive sandboxId from chat data
      if (chat.sandbox) {
        this.sandboxId = chat.sandbox._id;
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
      tools: withBackgroundTaskTools([
        ...(filesystemBackend ? [createSandboxToolkit(filesystemBackend)] : []),
        createWebSearchToolkit(),
      ]),
      toolResultEviction: {
        enabled: true,
        tokenLimit: 20000,
      },
      task: {
        taskDescription: TASK_PROMPT,
      },
      filesystem: false,
      maxSteps: 100,
      ...(this.env.VOLTAGENT_PUBLIC_KEY && this.env.VOLTAGENT_SECRET_KEY ? {
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

    // Track the initial model settings
    this.lastAppliedModel = this.state.model;
    this.lastAppliedReasoningEffort = this.state.reasoningEffort;

    this.planAgent = agent;
    await this._patchAgent();
    return agent;
  }

  private async _patchAgent(): Promise<void> {
    const agent = this.planAgent;
    if (!agent) return;

    const writeTodos = agent.getTools().find(t => t.name === "write_todos");
    if (writeTodos) {
      // Wrap with background task support (30 second timeout, 30 minute max duration)
      patchToolWithBackgroundSupport(writeTodos, {
        duration: 30000,
        allowAgentSetDuration: true,
        maxAllowedAgentDuration: 1800000, // 30 minutes
        allowBackground: true,
      });

      // Add approval requirement when not in yolo mode
      if (!this.state?.yolo) {
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
    }

    const model = this.state.model;
    const reasoningEffort = this.state.reasoningEffort;

    // Only recreate model if settings actually changed
    const modelChanged = model !== this.lastAppliedModel || reasoningEffort !== this.lastAppliedReasoningEffort;
    if (model && modelChanged) {
      Object.defineProperty(agent, 'model', {
        value: createAiClient(model, reasoningEffort),
        writable: true,
        configurable: true,
      });
      this.lastAppliedModel = model;
      this.lastAppliedReasoningEffort = reasoningEffort;
    }
  }

  override async onRequest(request: Request): Promise<Response> {
    await this._init(request);
    return await super.onRequest(request);
  }

  override async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    await this._init(ctx.request);
    await this._prepAgent();
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
    if (!this.state?.model) {
      return new Response("Model not configured. Use the model selector in the chat header or pass 'model' as a query parameter when connecting.", { status: 400 });
    }

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
