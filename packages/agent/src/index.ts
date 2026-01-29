import { routeAgentRequest, type Connection, type ConnectionContext, callable } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "agents/ai-chat-agent";
import { generateText, type StreamTextOnFinishCallback, type ToolSet, Output } from "ai";
import { type PlanAgent, NodeFilesystemBackend } from "@voltagent/core";
import { createAiClient } from "./client";
import type { worker } from "../alchemy.run";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { z } from "zod";

// State type for chat settings synced from frontend
type ChatState = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
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

  private async generateTitle(userMessage: string): Promise<void> {
    if (!this.convexClient) return;

    try {
      const { output } = await generateText({
        model: createAiClient("openai/gpt-oss-20b"),
        output: Output.object({
          schema: z.object({
            title: z.string().describe("A short, concise title (max 6 words) for a chat conversation based on the user's first message."),
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
    const { PlanAgent } = await import("@voltagent/core");
    
    const filesystemBackend = new NodeFilesystemBackend({
      rootDir: "/tmp/voltagent",
      virtualMode: true,
    });

    const agent = new PlanAgent({
      name: "Assistant",
      systemPrompt: "You are a helpful assistant.",
      model: createAiClient(this.state?.model || this.env.OPENROUTER_MODEL, this.state?.reasoningEffort),
      filesystem: {
        backend: filesystemBackend,
      },
      toolResultEviction: {
        enabled: true,
        tokenLimit: 20000,
      },
      maxSteps: 100
    });
    const writeTodos = agent.getTools().find(t => t.name === "write_todos");
    if (writeTodos) {
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
    this.planAgent = agent;
    return agent;
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
    await this._prepAgent();
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
        abortSignal: options?.abortSignal,
      })

      return stream.toUIMessageStreamResponse();
    } catch (error) {
      console.error("Error in onChatMessage:", error);
      return new Response("Internal Server Error: " + JSON.stringify(error, null, 2), { status: 500 });
    }
  }
}
