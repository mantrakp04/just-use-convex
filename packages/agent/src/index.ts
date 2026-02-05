import { routeAgentRequest, type Connection, type ConnectionContext, callable } from "agents";
export { Sandbox } from "@cloudflare/sandbox";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { generateText, type StreamTextOnFinishCallback, type ToolSet, Output, type UIMessage, isFileUIPart, createUIMessageStreamResponse, createUIMessageStream } from "ai";
import { PlanAgent, setWaitUntil, AgentRegistry, createVoltOpsClient, createVoltAgentObservability, createPlanningToolkit } from "@voltagent/core";
import { createAiClient, embedTexts } from "./client";
import { SYSTEM_PROMPT, TASK_PROMPT } from "./prompt";
import { SandboxFilesystemBackend, createSandboxToolkit } from "./tools/sandbox";
import { createWebSearchToolkit } from "./tools/websearch";
import { createAskUserToolkit } from "./tools/ask-user";
import { BackgroundTaskStore, withBackgroundTaskTools } from "./utils/toolWBackground";
import { patchToolWithBackgroundSupport } from "./utils/toolWTimeout";
import type { worker } from "../alchemy.run";
import {
  createConvexAdapter,
  parseTokenFromUrl,
  ConvexAdapter,
} from "@just-use-convex/backend/convex/lib/convexAdapter";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { z } from "zod";
import { parseStreamToUI } from "./utils/fullStreamParser";
import type { FunctionReturnType } from "convex/server";

function extractMessageText(message: UIMessage): string {
  if (message.role !== "user" && message.role !== "assistant") return "";
  return message.parts
    .map((part) => part.type === "text" ? part.text : "")
    .filter(Boolean)
    .join("\n");
}

// State type for chat settings synced from frontend
type ChatState = {
  model: string;
  reasoningEffort?: "low" | "medium" | "high";
  inputModalities?: string[];
};

// Map MIME type prefixes to OpenRouter modality names
function getMimeModality(mimeType: string): string | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("application/pdf")) return "file"; // PDFs often treated as "file" modality
  if (mimeType.startsWith("text/")) return "text";
  return null;
}

// Check if a MIME type is supported by the model's input modalities
function isMimeTypeSupported(mimeType: string, inputModalities?: string[]): boolean {
  // Default to supporting everything if no modalities specified
  if (!inputModalities || inputModalities.length === 0) return true;

  const modality = getMimeModality(mimeType);
  if (!modality) return false;

  // Most models that support "image" also handle PDFs through vision
  if (modality === "file" && inputModalities.includes("image")) return true;

  return inputModalities.includes(modality);
}

// Filter message parts to only include supported file types
function filterMessageParts(messages: UIMessage[], inputModalities?: string[]): UIMessage[] {
  return messages.map((msg) => ({
    ...msg,
    parts: msg.parts.filter((part) => {
      if (!isFileUIPart(part)) return true;
      return isMimeTypeSupported(part.mediaType, inputModalities);
    }),
  }));
}

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
  private convexAdapter: ConvexAdapter | null = null;
  private planAgent: PlanAgent | null = null;
  private sandboxId: string | null = null;
  private sandboxBackend: SandboxFilesystemBackend | null = null;
  private backgroundTaskStore = new BackgroundTaskStore();
  private chatDoc: FunctionReturnType<typeof api.chats.index.get> | null = null;

  private async buildVectorId(messageId: string): Promise<string> {
    const baseId = `${this.name}:${messageId}`;
    const baseBytes = new TextEncoder().encode(baseId);
    if (baseBytes.length <= 64) return baseId;

    const digest = await crypto.subtle.digest("SHA-256", baseBytes);
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    return `m_${hash}`;
  }

  private async saveFilesToSandbox(messages: UIMessage[]): Promise<void> {
    if (!this.sandboxBackend) return;

    const uploadDir = "/workspace/uploads";

    for (const msg of messages) {
      for (const part of msg.parts) {
        if (!isFileUIPart(part)) continue;

        const { url, filename } = part;
        if (!filename) continue;

        try {
          // Handle data URLs (base64 encoded)
          if (url.startsWith("data:")) {
            const base64Match = url.match(/^data:[^;]+;base64,(.+)$/);
            if (base64Match?.[1]) {
              const binaryContent = atob(base64Match[1]);
              const filePath = `${uploadDir}/${filename}`;
              await this.sandboxBackend.write(filePath, binaryContent);
            }
          }
          // Handle blob URLs or external URLs - skip for now as they require fetch
          // In the future, we could fetch these and save them
        } catch (error) {
          console.error(`Failed to save file ${filename} to sandbox:`, error);
        }
      }
    }
  }

  private async indexMessages(messages: UIMessage[]): Promise<void> {
    const vectorize = this.env.VECTORIZE_CHAT_MESSAGES;
    if (!vectorize) return;

    const texts: string[] = [];
    const metadata: Array<{ role: string; chatId: string; messageId: string; text: string }> = [];

    for (const message of messages) {
      if (message.role !== "user" && message.role !== "assistant") continue;
      const text = extractMessageText(message);
      if (!text) continue;
      texts.push(text);
      metadata.push({
        role: message.role,
        chatId: this.chatDoc?._id as Id<"chats">,
        messageId: message.id,
        text,
      });
    }

    if (texts.length === 0) return;

    const embeddings = await embedTexts(texts);
    const vectorIds = await Promise.all(
      metadata.map((meta) => this.buildVectorId(meta.messageId))
    );

    const vectors = [];
    for (let index = 0; index < embeddings.length; index += 1) {
      const values = embeddings[index];
      const meta = metadata[index];
      const id = vectorIds[index];
      if (!values || !meta || !id) continue;
      vectors.push({
        id,
        values,
        metadata: meta,
      });
    }

    if (vectors.length > 0) {
      await vectorize.upsert(vectors);
    }
  }

  private async deleteMessageVectors(messageIds: string[]): Promise<void> {
    const vectorize = this.env.VECTORIZE_CHAT_MESSAGES;
    if (!vectorize || messageIds.length === 0) return;

    const ids = await Promise.all(
      messageIds.map((messageId) => this.buildVectorId(messageId))
    );
    await vectorize.deleteByIds(ids);
  }

  private async buildRetrievalMessage(
    queryText: string
  ): Promise<UIMessage | null> {
    const vectorize = this.env.VECTORIZE_CHAT_MESSAGES;
    if (!vectorize) return null;

    const [embedding] = await embedTexts([queryText]);
    if (!embedding) return null;
    const results = await vectorize.query(embedding, {
      topK: 6,
      namespace: this.chatDoc?.memberId,
      returnMetadata: "all"
    });

    if (!results.matches.length) return null;

    const contextLines = results.matches.map((match, index) => {
      const role = typeof match.metadata?.role === "string" ? match.metadata.role : "unknown";
      const text = typeof match.metadata?.text === "string" ? match.metadata.text : "";
      const score = Number.isFinite(match.score) ? match.score.toFixed(4) : "n/a";
      return `#${index + 1} (${role}, score ${score})\\n${text}`;
    });

    return {
      id: `vectorize-${crypto.randomUUID()}`,
      role: "system",
      parts: [
        {
          type: "text",
          text: `Relevant past messages:\n\n${contextLines.join("\n\n")}`,
        },
      ],
    };
  }

  private async generateTitle(userMessage: string): Promise<void> {
    if (!this.convexAdapter) return;

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
        // Use the correct function based on token type
        const updateFn = this.convexAdapter.getTokenType() === "ext"
          ? api.chats.index.updateExt
          : api.chats.index.update;
        await this.convexAdapter.mutation(updateFn, {
        _id: this.chatDoc?._id,
          patch: { title },
        });
      }
    } catch (error) {
      console.error("Failed to generate title:", error);
    }
  }
  
  private async _init(request: Request): Promise<void> {
    const url = new URL(request.url);
    const model = url.searchParams.get('model');
    const reasoningEffort = url.searchParams.get('reasoningEffort') as "low" | "medium" | "high" | undefined;
    // Only update state if we have new values and state doesn't exist yet
    const state = this.state ?? {};
    if (
      (!state.model && model) ||
      (!state.reasoningEffort && reasoningEffort)
    ) {
      this.setState({
        ...state,
        ...(model && { model }),
        ...(reasoningEffort && { reasoningEffort }),
      });
    }

    // Only require token on first connection
    if (!this.convexAdapter) {
      const tokenConfig = parseTokenFromUrl(url);
      if (!tokenConfig) {
        throw new Error("Unauthorized: No token provided");
      }
      this.convexAdapter = await createConvexAdapter(this.env.CONVEX_URL, tokenConfig);

      // Use the correct function based on token type
      const getFn = this.convexAdapter.getTokenType() === "ext"
        ? api.chats.index.getExt
        : api.chats.index.get;
      const chat = await this.convexAdapter.query(getFn, {
        _id: this.name as Id<"chats">
      });
      if (!chat) {
        throw new Error("Unauthorized: No chat found");
      }
      this.chatDoc = chat;
      // Derive sandboxId from chat data
      if (chat.sandbox) {
        this.sandboxId = chat.sandbox._id;
      }

    }

    if (model || reasoningEffort) {
      await this.ctx.storage.put("chatState", {
        model: model ?? this.state?.model,
        reasoningEffort: reasoningEffort ?? this.state?.reasoningEffort,
      } satisfies ChatState);
    }
  }

  private async _prepAgent(): Promise<PlanAgent> {
    setWaitUntil(this.ctx.waitUntil.bind(this.ctx));
    const registry = AgentRegistry.getInstance();
    if (this.env.VOLTAGENT_PUBLIC_KEY && this.env.VOLTAGENT_SECRET_KEY) {
      registry.setGlobalVoltOpsClient(
        createVoltOpsClient({
          publicKey: this.env.VOLTAGENT_PUBLIC_KEY as string,
          secretKey: this.env.VOLTAGENT_SECRET_KEY as string,
        })
      );
    }

    const filesystemBackend = this.sandboxId ? new SandboxFilesystemBackend(this.env, this.sandboxId) : undefined;
    this.sandboxBackend = filesystemBackend ?? null;
    if (filesystemBackend) {
      console.log("[sandbox] backend ready", {
        sandboxId: this.sandboxId,
        rootDir: filesystemBackend.rootDir,
      });
    } else {
      console.log("[sandbox] backend disabled (no sandboxId)");
    }

    const agent = new PlanAgent({
      name: "Assistant",
      systemPrompt: SYSTEM_PROMPT,
      model: createAiClient(this.state.model, this.state.reasoningEffort),
      tools: withBackgroundTaskTools([
        ...(filesystemBackend ? [createSandboxToolkit(filesystemBackend, { store: this.backgroundTaskStore })] : []),
        createWebSearchToolkit(),
        createAskUserToolkit(),
      ], this.backgroundTaskStore),
      planning: false,
      toolResultEviction: {
        enabled: true,
        tokenLimit: 20000,
      },
      task: {
        taskDescription: TASK_PROMPT,
        supervisorConfig: {
          fullStreamEventForwarding: {
            types: [
              'tool-input-start',
              'tool-input-delta',
              'tool-input-end',
              'tool-call',
              'tool-result',
              'tool-error',
              'text-delta',
              'reasoning-delta',
              'source',
              'error',
              'finish',
            ],
          },
        },
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

    agent.addTools([
      createPlanningToolkit(agent, {
        systemPrompt: [
          'Use write_todos when a task is multi-step or when a plan improves clarity.',
          'If the request is simple and direct, you may skip write_todos.',
          'When you do use write_todos, keep 3-8 concise steps and exactly one in_progress.',
        ].join('\n'),
      }),
    ]);

    this.planAgent = agent;
    await this._patchAgent();
    return agent;
  }

  private async _patchAgent(): Promise<void> {
    const agent = this.planAgent;
    if (!agent) return;

    const tasks = agent.getTools().find(t => t.name === "task");
    if (tasks) {
      patchToolWithBackgroundSupport(tasks, this.backgroundTaskStore, {
        maxDuration: 30 * 60 * 1000, // 30 minutes
        allowAgentSetDuration: true,
        allowBackground: true,
      });
    }

    // Patch task subagent models to match the main agent's model
    const subagents = agent.getSubAgents();
    for (const subagent of subagents) {
      if (subagent && typeof subagent === 'object' && 'model' in subagent) {
        Object.defineProperty(subagent, 'model', {
          value: createAiClient(this.state.model, this.state.reasoningEffort),
          writable: true,
          configurable: true,
        });
      }
    }

    const model = this.state.model;
    const reasoningEffort = this.state.reasoningEffort;

    Object.defineProperty(agent, 'model', {
      value: createAiClient(model, reasoningEffort),
      writable: true,
      configurable: true,
    });
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
    await this.ctx.storage.put("chatState", state);
    await super.onStateUpdate(state, source);
  }

  override async persistMessages(messages: UIMessage[]): Promise<void> {
    await super.persistMessages(messages);
    try {
      await this.indexMessages(messages);
    } catch (error) {
      console.error("Failed to index messages in Vectorize:", error);
    }
  }

  @callable()
  async updateMessages(messages: Parameters<typeof this.persistMessages>[0]) {
    // Get the IDs of messages to keep
    const keepIds = new Set(messages.map(m => m.id));
    
    // Delete messages that are no longer in the list
    const existingMessages = this.messages;
    const deletedMessageIds: string[] = [];
    await Promise.all(
      existingMessages.map(async (msg) => {
        if (!keepIds.has(msg.id)) {
          await this.sql`DELETE FROM cf_ai_chat_agent_messages WHERE id = ${msg.id}`;
          deletedMessageIds.push(msg.id);
        }
      })
    );

    if (deletedMessageIds.length > 0) {
      this.deleteMessageVectors(deletedMessageIds).catch((error) => {
        console.error("Failed to delete vectorized messages:", error);
      });
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
      // Update chat timestamp (fire and forget)
      if (this.convexAdapter) {
        const updateFn = this.convexAdapter.getTokenType() === "ext"
          ? api.chats.index.updateExt
          : api.chats.index.update;
        this.convexAdapter.mutation(updateFn, {
          _id: this.chatDoc?._id,
          patch: {},
        });
      }

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

      // Save uploaded files to sandbox (fire and forget)
      this.saveFilesToSandbox(this.messages);

      // Filter file parts based on model's supported input modalities
      const filteredMessages = filterMessageParts(
        this.messages,
        this.state.inputModalities
      );

      let lastUserMessageIndex = -1;
      for (let index = filteredMessages.length - 1; index >= 0; index -= 1) {
        if (filteredMessages[index]?.role === "user") {
          lastUserMessageIndex = index;
          break;
        }
      }
      const retrievalMessage =
        lastUserMessageIndex >= 0
          ? await this.buildRetrievalMessage(
              extractMessageText(filteredMessages[lastUserMessageIndex]!)
            )
          : null;
      const modelMessages = retrievalMessage
        ? [
            ...filteredMessages.slice(0, lastUserMessageIndex),
            retrievalMessage,
            ...filteredMessages.slice(lastUserMessageIndex),
          ]
        : filteredMessages;

      const agent = this.planAgent || (await this._prepAgent());
      const stream = await agent?.streamText(modelMessages, {
        abortSignal: options?.abortSignal
      })

      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: ({ writer }) => parseStreamToUI(stream.fullStream, writer),
        }),
      });
    } catch (error) {
      console.error("Error in onChatMessage:", error);
      return new Response("Internal Server Error: " + JSON.stringify(error, null, 2), { status: 500 });
    }
  }
}
