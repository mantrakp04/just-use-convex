import { routeAgentRequest, type Connection, type ConnectionContext } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import { toBaseMessages, toUIMessageStream } from "@ai-sdk/langchain";
import { createUIMessageStreamResponse, type StreamTextOnFinishCallback, type ToolSet } from "ai";
import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { CloudflareDOCheckpointer, type CloudflareSqlStorage } from "./checkpointer";
import type { worker } from "../alchemy.run";

export default {
  async fetch(request: Request, env: typeof worker.Env): Promise<Response> {
    // Get origin for CORS (credentials require specific origin, not *)
    const origin = request.headers.get('origin') || '*';

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

export class Agent extends AIChatAgent<typeof worker.Env> {
  private _checkpointer: CloudflareDOCheckpointer | null = null;

  private getCheckpointer(): CloudflareDOCheckpointer {
    if (!this._checkpointer) {
      this._checkpointer = new CloudflareDOCheckpointer(
        this.ctx.storage.sql as CloudflareSqlStorage
      );
    }
    return this._checkpointer;
  }

  private getTokenFromRequest(request: Request): string | undefined {
    const headers = request.headers;
    return headers.get('cookie')?.split(';').find(cookie =>
      cookie.trim().startsWith('better-auth.session_token=')
    )?.split('=')[1];
  }

  override async onRequest(request: Request): Promise<Response> {
    // Check auth for /get-messages endpoint
    if (new URL(request.url).pathname.endsWith('/get-messages')) {
      const token = this.getTokenFromRequest(request);
      if (!token) {
        return new Response('Unauthorized: No token provided', { status: 401 });
      }
    }
    return await super.onRequest(request);
  }

  override async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const request = ctx.request;
    if (request) {
      const token = this.getTokenFromRequest(request);
      if (!token) {
        throw new Error("Unauthorized: No token provided");
      }
    }
    return await super.onConnect(connection, ctx);
  }

  override async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>
  ): Promise<Response> {
    try {
      const model = new ChatOpenAI({
        model: this.env.OPENROUTER_MODEL,
        temperature: 0,
        configuration: {
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: this.env.OPENROUTER_API_KEY,
        },
      });

      const checkpointer = this.getCheckpointer();

      const agent = createDeepAgent({
        model,
        systemPrompt: "You are a helpful assistant.",
        checkpointer,
      });

      // Get the last user message from this.messages
      const lastMessage = this.messages[this.messages.length - 1]!;
      const lastMessageContent = (await toBaseMessages([lastMessage]))[0]?.content;
      const humanMessage = new HumanMessage(lastMessageContent ?? "");

      // Use the DO's name as the thread ID for consistent state
      const threadId = this.name;

      const streamEvents = agent.streamEvents(
        { messages: [humanMessage] },
        {
          version: "v2",
          configurable: {
            thread_id: threadId,
          },
        },
      );

      return createUIMessageStreamResponse({
        stream: toUIMessageStream(streamEvents),
      });
    } catch (error) {
      console.error("Error in onChatMessage:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
}