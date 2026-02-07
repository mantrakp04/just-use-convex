import { type Connection, type ConnectionContext, callable } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isFileUIPart,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import {
  AgentRegistry,
  PlanAgent,
  createPlanningToolkit,
  createVoltAgentObservability,
  createVoltOpsClient,
  setWaitUntil,
} from "@voltagent/core";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import {
  ConvexAdapter,
  createConvexAdapter,
  parseTokenFromUrl,
} from "@just-use-convex/backend/convex/lib/convexAdapter";
import type { FunctionReturnType } from "convex/server";
import type { worker } from "../../alchemy.run";
import { createAiClient } from "../client";
import { SYSTEM_PROMPT, TASK_PROMPT } from "../prompt";
import { createAskUserToolkit } from "../tools/ask-user";
import { SandboxFilesystemBackend, createSandboxToolkit } from "../tools/sandbox";
import { createWebSearchToolkit } from "../tools/websearch";
import { parseStreamToUI } from "../utils/fullStreamParser";
import {
  BackgroundTaskStore,
  patchToolWithBackgroundSupport,
  withBackgroundTaskTools,
} from "../tools/utils/wrapper";
import { generateTitle } from "./chat-meta";
import { extractMessageText, filterMessageParts, sanitizeFilename } from "./messages";
import type { ChatState, InitArgs } from "./types";
import {
  buildRetrievalMessage,
  deleteMessageVectors,
  indexMessagesInVectorStore,
} from "./vectorize";

export class AgentWorker extends AIChatAgent<typeof worker.Env, ChatState> {
  private convexAdapter: ConvexAdapter | null = null;
  private planAgent: PlanAgent | null = null;
  private sandboxId: string | null = null;
  private sandboxBackend: SandboxFilesystemBackend | null = null;
  private backgroundTaskStore = new BackgroundTaskStore();
  private chatDoc: FunctionReturnType<typeof api.chats.index.get> | null = null;

  private async saveFilesToSandbox(messages: UIMessage[]): Promise<void> {
    if (!this.sandboxBackend) return;

    const uploadDir = "/workspace/uploads";
    const escapeShellArg = (arg: string): string =>
      `'${arg.replace(/'/g, "'\\''")}'`;
    await this.sandboxBackend.exec(`mkdir -p ${escapeShellArg(uploadDir)}`);

    for (const msg of messages) {
      for (const part of msg.parts) {
        if (!isFileUIPart(part)) continue;

        const { url, filename } = part;
        if (!filename) continue;
        const safeFilename = sanitizeFilename(filename);
        const filePath = `${uploadDir}/${safeFilename}`;

        try {
          if (url.startsWith("data:")) {
            const base64Match = url.match(/^data:[^;]+;base64,(.+)$/);
            if (base64Match?.[1]) {
              const binaryContent = atob(base64Match[1]);
              await this.sandboxBackend.write(filePath, binaryContent, "binary");
              continue;
            }
          }
          if (url.startsWith("http://") || url.startsWith("https://")) {
            if (!url.startsWith("https://")) {
              throw new Error("Only https URLs are allowed for sandbox downloads");
            }
            const result = await this.sandboxBackend.exec(
              `curl -L --fail --silent --show-error --connect-timeout 5 --max-time 20 --max-filesize 52428800 ${escapeShellArg(url)} -o ${escapeShellArg(filePath)}`
            );
            if (!result.success) {
              throw new Error(`Failed to curl ${url}: ${result.stderr}`);
            }
          }
        } catch {
          // silently ignore sandbox file save failures
        }
      }
    }
  }

  private async _init(args?: InitArgs): Promise<void> {
    if (args) {
      await this.ctx.storage.put("initArgs", args);
    }
    const initArgs = (args ?? (await this.ctx.storage.get("initArgs"))) as InitArgs | null;
    if (!initArgs) {
      throw new Error("Agent not initialized: missing initArgs");
    }
    const { model, reasoningEffort, inputModalities, tokenConfig } = initArgs;
    const state = this.state ?? {};
    if (
      (!state.model && model) ||
      (!state.reasoningEffort && reasoningEffort) ||
      (!state.inputModalities && inputModalities)
    ) {
      this.setState({
        ...state,
        ...(model && { model }),
        ...(reasoningEffort && { reasoningEffort }),
        ...(inputModalities && { inputModalities }),
      });
    }

    if (!this.convexAdapter) {
      if (!tokenConfig) {
        throw new Error("Unauthorized: No token provided");
      }
      this.convexAdapter = await createConvexAdapter(this.env.CONVEX_URL, tokenConfig);

      const getFn = this.convexAdapter.getTokenType() === "ext"
        ? api.chats.index.getExt
        : api.chats.index.get;
      const chat = await this.convexAdapter.query(getFn, {
        _id: this.name as Id<"chats">,
      });
      if (!chat) {
        throw new Error("Unauthorized: No chat found");
      }
      this.chatDoc = chat;
      if (chat.sandbox) {
        this.sandboxId = chat.sandbox._id;
      }
    }

    if (model || reasoningEffort || inputModalities) {
      await this.ctx.storage.put("chatState", {
        model: model ?? this.state?.model,
        reasoningEffort: reasoningEffort ?? this.state?.reasoningEffort,
        inputModalities: inputModalities ?? this.state?.inputModalities,
      } satisfies ChatState);
    }
  }

  private async _prepAgent(): Promise<PlanAgent> {
    const boundWaitUntil = this.ctx.waitUntil.bind(this.ctx);
    setWaitUntil(boundWaitUntil);
    this.backgroundTaskStore.setWaitUntil(boundWaitUntil);
    const registry = AgentRegistry.getInstance();
    if (this.env.VOLTAGENT_PUBLIC_KEY && this.env.VOLTAGENT_SECRET_KEY) {
      registry.setGlobalVoltOpsClient(
        createVoltOpsClient({
          publicKey: this.env.VOLTAGENT_PUBLIC_KEY as string,
          secretKey: this.env.VOLTAGENT_SECRET_KEY as string,
        })
      );
    }

    const filesystemBackend = this.sandboxId && this.env.DAYTONA_API_KEY
      ? new SandboxFilesystemBackend(this.env, this.sandboxId)
      : undefined;
    this.sandboxBackend = filesystemBackend ?? null;

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
              "tool-input-start",
              "tool-input-delta",
              "tool-input-end",
              "tool-call",
              "tool-result",
              "tool-error",
              "text-delta",
              "reasoning-delta",
              "source",
              "error",
              "finish",
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
              strategy: "always",
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
          "Use write_todos when a task is multi-step or when a plan improves clarity.",
          "If the request is simple and direct, you may skip write_todos.",
          "When you do use write_todos, keep 3-8 concise steps and exactly one in_progress.",
        ].join("\n"),
      }),
    ]);

    this.planAgent = agent;
    await this._patchAgent();

    return agent;
  }

  private async _patchAgent(): Promise<void> {
    const agent = this.planAgent;
    if (!agent) return;

    const tasks = agent.getTools().find((t) => t.name === "task");
    if (tasks) {
      patchToolWithBackgroundSupport(tasks, this.backgroundTaskStore, {
        maxDuration: 30 * 60 * 1000,
        allowAgentSetDuration: true,
        allowBackground: true,
      });
    }

    const subagents = agent.getSubAgents();
    for (const subagent of subagents) {
      if (subagent && typeof subagent === "object" && "model" in subagent) {
        Object.defineProperty(subagent, "model", {
          value: createAiClient(this.state.model, this.state.reasoningEffort),
          writable: true,
          configurable: true,
        });
      }
    }

    const model = this.state.model;
    const reasoningEffort = this.state.reasoningEffort;

    Object.defineProperty(agent, "model", {
      value: createAiClient(model, reasoningEffort),
      writable: true,
      configurable: true,
    });
  }

  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const inputModalitiesRaw = url.searchParams.get("inputModalities");
    await this._init({
      model: url.searchParams.get("model") ?? undefined,
      reasoningEffort: url.searchParams.get("reasoningEffort") as "low" | "medium" | "high" | undefined,
      inputModalities: inputModalitiesRaw ? inputModalitiesRaw.split(",") : undefined,
      tokenConfig: parseTokenFromUrl(url) ?? undefined,
    });
    return await super.onRequest(request);
  }

  override async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const inputModalitiesRaw = url.searchParams.get("inputModalities");
    await this._init({
      model: url.searchParams.get("model") ?? undefined,
      reasoningEffort: url.searchParams.get("reasoningEffort") as "low" | "medium" | "high" | undefined,
      inputModalities: inputModalitiesRaw ? inputModalitiesRaw.split(",") : undefined,
      tokenConfig: parseTokenFromUrl(url) ?? undefined,
    });
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
      await indexMessagesInVectorStore({
        env: this.env,
        agentName: this.name,
        chatId: this.chatDoc?._id as Id<"chats"> | undefined,
        messages,
      });
    } catch {
      // silently ignore vectorize indexing failures
    }
  }

  @callable()
  async updateMessages(messages: Parameters<typeof this.persistMessages>[0]) {
    const keepIds = new Set(messages.map((m) => m.id));

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
      deleteMessageVectors({
        env: this.env,
        agentName: this.name,
        messageIds: deletedMessageIds,
      }).catch(() => {});
    }

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
      if (!this.convexAdapter) {
        await this._init();
        if (!this.convexAdapter) {
          throw new Error("No convex adapter");
        }
      }

      const updateFn = this.convexAdapter.getTokenType() === "ext"
        ? api.chats.index.updateExt
        : api.chats.index.update;
      this.convexAdapter.mutation(updateFn, {
        _id: this.chatDoc?._id,
        patch: {},
      });

      if (this.messages.length === 1 && this.messages[0]) {
        const textContent = extractMessageText(this.messages[0]);
        if (textContent) {
          generateTitle({
            convexAdapter: this.convexAdapter,
            chatId: this.chatDoc?._id,
            userMessage: textContent,
          });
        }
      }

      const messagesForSandbox = this.messages;
      const messagesForAgent = filterMessageParts(
        this.messages,
        this.state.inputModalities
      );

      this.saveFilesToSandbox(messagesForSandbox);

      const lastUserIdx = messagesForAgent.findLastIndex((m) => m.role === "user");
      const retrievalMessage = lastUserIdx !== -1
        ? await buildRetrievalMessage({
          env: this.env,
          memberId: this.chatDoc?.memberId,
          queryText: extractMessageText(messagesForAgent[lastUserIdx]!),
        })
        : null;

      const modelMessages = retrievalMessage
        ? messagesForAgent.toSpliced(lastUserIdx, 0, retrievalMessage)
        : messagesForAgent;

      const agent = this.planAgent || (await this._prepAgent());
      const stream = await agent?.streamText(modelMessages, {
        abortSignal: options?.abortSignal,
      });

      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: ({ writer }) => parseStreamToUI(stream.fullStream, writer),
        }),
      });
    } catch (error) {
      return new Response("Internal Server Error: " + JSON.stringify(error, null, 2), { status: 500 });
    }
  }
}
