import { type Connection, type ConnectionContext, callable } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import {
  AgentRegistry,
  Agent,
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
import {
  closeSshTerminal as closeSshTerminalSession,
  createSshTerminalSessions,
  openSshTerminal as openSshTerminalSession,
  readSshTerminal as readSshTerminalSession,
  resizeSshTerminal as resizeSshTerminalSession,
  writeSshTerminal as writeSshTerminalSession,
} from "../tools/sandbox/backend/terminal";
import { SandboxFilesystemBackend, createSandboxToolkit } from "../tools/sandbox";
import { createWebSearchToolkit } from "../tools/websearch";
import { parseStreamToUI } from "../utils/fullStreamParser";
import {
  BackgroundTaskStore,
  patchToolWithBackgroundSupport,
  withBackgroundTaskTools,
} from "../tools/utils/wrapper";
import { generateTitle } from "./chat-meta";
import { extractMessageText, filterMessageParts } from "./messages";
import type { AgentArgs } from "./types";
import {
  buildRetrievalMessage,
  deleteMessageVectors,
  indexMessagesInVectorStore,
} from "./vectorize";
import { createVectorizeToolkit } from "../tools/vectorize";

export class AgentWorker extends AIChatAgent<typeof worker.Env, AgentArgs> {
  private convexAdapter: ConvexAdapter | null = null;
  private planAgent: PlanAgent | null = null;
  private sandboxId: string | null = null;
  private sandboxBackend: SandboxFilesystemBackend | null = null;
  private backgroundTaskStore = new BackgroundTaskStore();
  private chatDoc: FunctionReturnType<typeof api.chats.index.get> | null = null;
  private sshTerminalSessions = createSshTerminalSessions();

  private async _init(args?: AgentArgs): Promise<void> {
    if (args) {
      await this.ctx.storage.put("initArgs", args);
    }
    const initArgs = (args ?? (await this.ctx.storage.get("initArgs"))) as AgentArgs | null;
    if (!initArgs) {
      throw new Error("Agent not initialized: missing initArgs");
    }
    const { model, reasoningEffort, inputModalities, tokenConfig } = initArgs;
    const state = this.state ?? {};
    const shouldSyncState = Boolean(
      (model && state.model !== model) ||
      (reasoningEffort && state.reasoningEffort !== reasoningEffort) ||
      (inputModalities &&
        JSON.stringify(state.inputModalities) !== JSON.stringify(inputModalities)) ||
      (tokenConfig &&
        JSON.stringify(state.tokenConfig) !== JSON.stringify(tokenConfig))
    );
    if (shouldSyncState) {
      this.setState({
        ...state,
        ...(model && { model }),
        ...(reasoningEffort && { reasoningEffort }),
        ...(inputModalities && { inputModalities }),
        ...(tokenConfig && { tokenConfig }),
      });
    }

    if (!this.convexAdapter) {
      const activeTokenConfig = tokenConfig ?? this.state?.tokenConfig;
      if (!activeTokenConfig) {
        throw new Error("Unauthorized: No token provided");
      }
      this.convexAdapter = await createConvexAdapter(this.env.CONVEX_URL, activeTokenConfig);

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

    if (model || reasoningEffort || inputModalities || tokenConfig) {
      await this.ctx.storage.put("chatState", {
        model: model ?? this.state?.model,
        reasoningEffort: reasoningEffort ?? this.state?.reasoningEffort,
        inputModalities: inputModalities ?? this.state?.inputModalities,
        tokenConfig: tokenConfig ?? this.state?.tokenConfig,
      } satisfies AgentArgs);
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

    const subagents = [
      ...(filesystemBackend ? [
        createSandboxToolkit(filesystemBackend, {
          store: this.backgroundTaskStore,
        }),
        createVectorizeToolkit(this.env, this.chatDoc?.memberId),
      ].map((toolkit) =>
        new Agent({
          name: toolkit.name,
          purpose: toolkit.description,
          model: createAiClient(this.state.model!, this.state.reasoningEffort),
          instructions: toolkit.instructions ?? '',
          tools: toolkit.tools,
        })
      ) : []),
    ];

    const agent = new PlanAgent({
      name: "Assistant",
      systemPrompt: SYSTEM_PROMPT,
      model: createAiClient(this.state.model!, this.state.reasoningEffort),
      tools: withBackgroundTaskTools([
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
      subagents,
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
          "When you do use write_todos, keep 3-8 concise steps.",
          "When creating a plan, all steps must start with 'pending' status.",
          "When all steps are executed, all the todos must end with 'done' status.",
          "Regularly check and update the status of the todos to ensure they are accurate and up to date.",
        ].join("\n"),
      }),
    ]);

    for (const subagent of subagents) {
      agent.addSubAgent(subagent);
    }

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
          value: createAiClient(this.state.model!, this.state.reasoningEffort),
          writable: true,
          configurable: true,
        });
      }
    }

    const model = this.state.model;
    const reasoningEffort = this.state.reasoningEffort;

    Object.defineProperty(agent, "model", {
      value: createAiClient(model!, reasoningEffort),
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

  override async onStateUpdate(state: AgentArgs, source: Connection | "server"): Promise<void> {
    await this._patchAgent();
    await this.ctx.storage.put("chatState", state);
    await super.onStateUpdate(state, source);
  }

  override async persistMessages(messages: UIMessage[]): Promise<void> {
    await super.persistMessages(messages);
    await indexMessagesInVectorStore({
      env: this.env,
      agentName: this.name,
      chatId: this.chatDoc?._id as Id<"chats"> | undefined,
      messages,
    });
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

  @callable()
  async openSshTerminal(params?: {
    cols?: number;
    rows?: number;
  }) {
    await this._init();
    if (!this.sandboxId) {
      throw new Error("This chat does not have a sandbox attached");
    }
    return openSshTerminalSession({
      env: this.env,
      sandboxName: this.sandboxId,
      sessions: this.sshTerminalSessions,
      waitUntil: this.ctx.waitUntil.bind(this.ctx),
      cols: params?.cols,
      rows: params?.rows,
    });
  }

  @callable()
  async readSshTerminal(params: { terminalId: string; offset?: number }) {
    return readSshTerminalSession({
      sessions: this.sshTerminalSessions,
      terminalId: params.terminalId,
      offset: params.offset,
    });
  }

  @callable()
  async writeSshTerminal(params: { terminalId: string; data: string }) {
    return writeSshTerminalSession({
      sessions: this.sshTerminalSessions,
      terminalId: params.terminalId,
      data: params.data,
    });
  }

  @callable()
  async resizeSshTerminal(params: { terminalId: string; cols: number; rows: number }) {
    return resizeSshTerminalSession({
      sessions: this.sshTerminalSessions,
      terminalId: params.terminalId,
      cols: params.cols,
      rows: params.rows,
    });
  }

  @callable()
  async closeSshTerminal(params: { terminalId: string }) {
    return closeSshTerminalSession({
      sessions: this.sshTerminalSessions,
      terminalId: params.terminalId,
    });
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
      void this.convexAdapter.mutation(updateFn, {
        _id: this.chatDoc?._id,
        patch: {},
      }).catch(() => {});

      if (this.messages.length === 1 && this.messages[0]) {
        const textContent = extractMessageText(this.messages[0]);
        if (textContent) {
          void generateTitle({
            convexAdapter: this.convexAdapter,
            chatId: this.chatDoc?._id,
            userMessage: textContent,
          }).catch(() => {});
        }
      }

      const messagesForSandbox = this.messages;
      const messagesForAgent = filterMessageParts(
        this.messages,
        this.state.inputModalities
      );

      if (this.sandboxBackend) {
        void this.sandboxBackend.saveFilesToSandbox(messagesForSandbox).catch(() => {});
      }

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
      const stream = await agent.streamText(modelMessages, {
        abortSignal: options?.abortSignal,
      });

      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: ({ writer }) => parseStreamToUI(stream.fullStream, writer),
        }),
      });
    } catch (error) {
      console.error("onChatMessage failed", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
}
