import { type Connection, type ConnectionContext, callable } from "agents";
import {
  AIChatAgent,
  type OnChatMessageOptions,
} from "@cloudflare/ai-chat";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { PlanAgent } from "@voltagent/core";
import type { worker } from "../../alchemy.run";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import {
  ConvexAdapter,
  createConvexAdapter,
} from "@just-use-convex/backend/convex/lib/convexAdapter";
import { env as agentDefaults } from "@just-use-convex/env/agent";
import { createAiClient } from "../agent/client";
import { normalizeDuration } from "../tools/utils/duration";
import { parseStreamToUI } from "../utils/fullStreamParser";
import {
  BackgroundTaskStore,
  TruncatedOutputStore,
  cancelBackgroundTask,
  getBackgroundTask,
  listBackgroundTasks,
  patchToolWithBackgroundSupport,
} from "../tools/utils/wrapper";
import type { BackgroundTaskFilterStatus, GetBackgroundTaskInput } from "../tools/utils/wrapper";
import { generateTitle } from "../agent/chat-meta";
import {
  extractMessageText,
  processMessagesForAgent,
} from "../agent/messages";
import {
  type AgentArgs,
  type ChatRuntimeDoc,
  type CallableFunctionInstance,
  type CallableServiceMethod,
  type CallableServiceMethodsMap,
  type WorkflowRuntimeDoc,
} from "../agent/types";
import {
  buildRetrievalMessage,
  deleteMessageVectors,
  indexMessagesInVectorStore,
} from "../agent/vectorize";
import {
  createSandboxFsFunctions,
  createSandboxPtyFunctions,
} from "../tools/sandbox";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import {
  ensureSandboxReady,
  ensureSandboxStarted,
  downloadFileUrlsInSandbox,
} from "../tools/utils/sandbox";
import {
  buildInitArgsFromUrl,
} from "./helpers";
import { createWorkerPlanAgent } from "../agent/agent";

export class AgentWorker extends AIChatAgent<typeof worker.Env, AgentArgs> {
  private convexAdapter: ConvexAdapter | null = null;
  private planAgent: PlanAgent | null = null;
  private backgroundTaskStore = new BackgroundTaskStore(this.ctx.waitUntil.bind(this.ctx));
  private truncatedOutputStore = new TruncatedOutputStore();
  private readonly maxToolDurationMs = normalizeDuration(
    agentDefaults.MAX_TOOL_DURATION_MS,
    600_000,
  );
  private readonly maxBackgroundDurationMs = normalizeDuration(
    agentDefaults.MAX_BACKGROUND_DURATION_MS,
    3_600_000,
  );
  private readonly backgroundTaskPollIntervalMs = normalizeDuration(
    agentDefaults.BACKGROUND_TASK_POLL_INTERVAL_MS,
    3_000,
  );
  private chatDoc: ChatRuntimeDoc | null = null;
  private workflowDoc: WorkflowRuntimeDoc | null = null;
  private callableFunctions: CallableFunctionInstance[] = [];
  private didRegisterCallableFunctions = false;
  private daytona: Daytona | null = null;
  private sandbox: Sandbox | null = null;

  private async _init(args?: AgentArgs): Promise<void> {
    if (args) {
      await this.ctx.storage.put("state", args);
    }
    const stored = await this.ctx.storage.get<AgentArgs>("state");
    if (!stored || !stored.tokenConfig) {
      throw new Error("Agent not initialized: missing state");
    }
    this.setState(stored);

    this.convexAdapter = await createConvexAdapter(this.env.CONVEX_URL, stored.tokenConfig);
    this.chatDoc = null;
    this.workflowDoc = null;

    let sandboxId: string | undefined;
    if (this.state.modeConfig.mode === "workflow" && this.state.tokenConfig.type === "ext") {
      const workflow = await this.convexAdapter.query(
        api.workflows.index.getForExecutionExt,
        { _id: this.state.modeConfig.workflow },
      );
      if (!workflow) {
        throw new Error("Workflow not found");
      }
      this.workflowDoc = workflow;
      sandboxId = workflow.sandboxId;
    } else if (this.state.modeConfig.mode === "chat" && this.state.tokenConfig.type === "jwt") {
      const chat = await this.convexAdapter.query(api.chats.index.get, { _id: this.state.modeConfig.chat });
      if (!chat) {
        throw new Error("Unauthorized: No chat found");
      }
      this.chatDoc = chat;
      sandboxId = chat.sandboxId;
    }

    this.daytona = new Daytona({
      apiKey: agentDefaults.DAYTONA_API_KEY,
      apiUrl: agentDefaults.DAYTONA_API_URL,
      target: agentDefaults.DAYTONA_TARGET,
    });
    if (sandboxId) {
      if (!this.sandbox || this.sandbox.id !== sandboxId) {
        this.sandbox = await ensureSandboxReady(this.daytona, sandboxId);
      }
    } else {
      this.sandbox = null;
    }

    this.callableFunctions = [
      ...(this.sandbox ? [createSandboxFsFunctions(this.sandbox), createSandboxPtyFunctions(this.sandbox)] : []),
    ];
    await this._registerCallableFunctions();
  }

  private async _prepAgent(): Promise<PlanAgent> {
    const agent = await createWorkerPlanAgent({
      env: this.env,
      state: this.state,
      modeConfig: this.state.modeConfig,
      chatDoc: this.chatDoc,
      workflowDoc: this.workflowDoc,
      convexAdapter: this.convexAdapter,
      sandbox: this.sandbox,
      backgroundTaskStore: this.backgroundTaskStore,
      truncatedOutputStore: this.truncatedOutputStore,
      waitUntil: this.ctx.waitUntil.bind(this.ctx),
    });

    this.planAgent = agent;
    await this._patchAgent();

    return agent;
  }

  private async _patchAgent(): Promise<void> {
    const agent = this.planAgent;
    if (!agent) return;

    const tasks = agent.getTools().find((t) => t.name === "task");
    if (tasks) {
      patchToolWithBackgroundSupport(tasks, this.backgroundTaskStore, this.truncatedOutputStore, {
        maxDuration: this.maxToolDurationMs,
        maxBackgroundDuration: this.maxBackgroundDurationMs,
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

  private async _registerCallableFunctions() {
    if (this.didRegisterCallableFunctions || !this.callableFunctions.length) {
      return;
    }
    const streamingMethods = new Set(["streamPtyTerminal"]);

    await Promise.all(this.callableFunctions.map(async (fn) => {
      const proto = Object.getPrototypeOf(fn);
      const callableMap = fn as unknown as CallableServiceMethodsMap;
      const names = Object.getOwnPropertyNames(proto).filter(
        (name): name is CallableServiceMethod =>
          name !== "constructor" && typeof callableMap[name] === "function"
      );
      const workerProto = Object.getPrototypeOf(this);
      const register = (name: CallableServiceMethod) =>
        callable(streamingMethods.has(name) ? { streaming: true } : undefined);

      for (const name of names) {
        if (name in workerProto) {
          continue;
        }

        const method = async function (this: AgentWorker, ...args: unknown[]) {
          const methodFn = (fn as unknown as CallableServiceMethodsMap)[name];
          if (!methodFn) {
            throw new Error(`Callable method "${name}" is not available`);
          }
          return methodFn.bind(fn)(...args);
        };

        register(name)(method, { name } as unknown as ClassMethodDecoratorContext);
        Object.defineProperty(workerProto, name, {
          value: method,
          writable: false,
          configurable: true,
        });
      }
    }));

    this.didRegisterCallableFunctions = true;
  }

  private async _markWorkflowExecutionFailed(error: unknown, executionId: Id<"workflowExecutions"> | null): Promise<void> {
    if (!executionId || !this.convexAdapter) {
      return;
    }

    await this.convexAdapter.mutation(
      api.workflows.index.finalizeWorkflowStepsExt,
      { executionId },
    ).catch(() => {});

    await this.convexAdapter.mutation(
      api.workflows.index.updateExecutionStatusExt,
      {
        executionId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: Date.now(),
      },
    ).catch(() => {});
  }

  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const isExecuteWorkflow = url.pathname.endsWith("/executeWorkflow") && request.method === "POST";
    
    const args = buildInitArgsFromUrl(url);
    await this._init(args);

    if (isExecuteWorkflow) {
      try {
        if (args.modeConfig.mode !== "workflow") {
          return new Response(JSON.stringify({ error: "Invalid mode for workflow execution" }), { status: 400 });
        }
        const executionId = args.modeConfig.executionId;
        if (!this.convexAdapter) {
          throw new Error("No convex adapter");
        }

        this.persistMessages([{
          id: `user-${crypto.randomUUID()}`,
          role: "user",
          parts: [{ type: "text", text: "Execute this workflow now." }],
        }]).catch(() => {});

        await this.convexAdapter.mutation(api.workflows.index.updateExecutionStatusExt, {
          executionId,
          status: "running",
        });
        return await this._onChatMessage(() => {});
      } catch (error) {
        await this._markWorkflowExecutionFailed(
          error,
          this.state?.modeConfig?.mode === "workflow" ? this.state.modeConfig.executionId : null,
        );
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }), { status: 500 });
      }
    }

    return await super.onRequest(request);
  }

  override async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    await this._init(buildInitArgsFromUrl(url));
    return await super.onConnect(connection, ctx);
  }

  override async onStateChanged(state: AgentArgs, source: Connection | "server"): Promise<void> {
    const stored = await this.ctx.storage.get<AgentArgs>("state");
    await this.ctx.storage.put("state", {
      ...state,
      tokenConfig: stored?.tokenConfig ?? state.tokenConfig,
    });
    await this._patchAgent();
    await super.onStateChanged(state, source);
  }

  override async persistMessages(messages: UIMessage[]): Promise<void> {
    await super.persistMessages(messages);
    void indexMessagesInVectorStore({
      env: this.env,
      memberId: this.chatDoc?.memberId ?? "",
      agentName: this.name,
      chatId: this.chatDoc?._id as Id<"chats"> | undefined,
      messages,
    });
  }

  @callable()
  async updateMessages(messages: Parameters<typeof this.persistMessages>[0]) {
    const keepIds = new Set(messages.map((message) => message.id));

    const existingMessages = this.messages;
    const deletedMessageIds: string[] = [];
    await Promise.all(
      existingMessages.map(async (message: UIMessage) => {
        if (!keepIds.has(message.id)) {
          await this.sql`DELETE FROM cf_ai_chat_agent_messages WHERE id = ${message.id}`;
          deletedMessageIds.push(message.id);
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
  async listBackgroundTasks(input?: { status?: BackgroundTaskFilterStatus }) {
    return listBackgroundTasks(this.backgroundTaskStore, input?.status ?? "all");
  }

  @callable()
  async getBackgroundTask(input: GetBackgroundTaskInput) {
    if (!input?.taskId || input.taskId.trim().length === 0) {
      throw new Error("taskId is required");
    }

    return getBackgroundTask(
      this.backgroundTaskStore,
      {
        taskId: input.taskId,
        waitForCompletion: input.waitForCompletion,
        timeoutMs: input.timeoutMs,
      },
      {
        pollIntervalMs: this.backgroundTaskPollIntervalMs,
        defaultTimeoutMs: this.maxToolDurationMs,
      },
    );
  }

  @callable()
  async cancelBackgroundTask(input: { taskId: string }) {
    if (!input?.taskId || input.taskId.trim().length === 0) {
      throw new Error("taskId is required");
    }

    return cancelBackgroundTask(this.backgroundTaskStore, input.taskId);
  }

  private async _onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions
  ): Promise<Response> {
    try {
      if (!this.convexAdapter) {
        await this._init();
        if (!this.convexAdapter) {
          throw new Error("No convex adapter");
        }
      }

      if (this.sandbox) {
        await ensureSandboxStarted(this.sandbox, false);
      }

      const modeConfig = this.state.modeConfig;
      const isChat = modeConfig?.mode === "chat";
      const isWorkflow = modeConfig?.mode === "workflow";

      if (isChat && this.chatDoc) {
        const updateFn = this.convexAdapter.getTokenType() === "ext"
          ? api.chats.index.updateExt
          : api.chats.index.update;
        void this.convexAdapter.mutation(updateFn, {
          _id: this.chatDoc._id,
          patch: {},
        }).catch(() => {});

        if (this.messages.length === 1 && this.messages[0]) {
          const textContent = extractMessageText(this.messages[0]);
          if (textContent) {
            void generateTitle({
              convexAdapter: this.convexAdapter,
              chatId: this.chatDoc._id,
              userMessage: textContent,
            }).catch(() => {});
          }
        }
      }

      const agent = this.planAgent || (await this._prepAgent());

      // Chat: streaming with retrieval + file downloads
      const { messages: messagesForAgent, lastUserIdx, lastUserQueryText, lastUserFilePartUrls } =
        processMessagesForAgent(this.messages, this.state.inputModalities);

      const [retrievalMessage, downloadedPaths] = await Promise.all([
        buildRetrievalMessage({
          env: this.env,
          memberId: this.chatDoc?.memberId,
          queryText: lastUserQueryText,
        }),
        this.sandbox && lastUserFilePartUrls.length > 0
          ? downloadFileUrlsInSandbox(this.sandbox, lastUserFilePartUrls)
          : null,
      ]);
      
      const immediateSystemMessage: UIMessage = {
        id: `immediate-system-${crypto.randomUUID()}`,
        role: "system",
        parts: [
          { type: "text" as const, text: `Relevant past messages:\n\n${retrievalMessage?.join("\n\n") ?? ""}` },
          ...(downloadedPaths ? [{ type: "text" as const, text: `Attached files downloaded to sandbox at: ${downloadedPaths.map((p) => `- ${p}`).join("\n")}` }] : []),
        ],
      };

      const modelMessages = messagesForAgent.toSpliced(lastUserIdx, 0, immediateSystemMessage);

      if (!isWorkflow) {
        const stream = await agent.streamText(modelMessages, {
          abortSignal: options?.abortSignal,
        });

        return createUIMessageStreamResponse({
          stream: createUIMessageStream({
            execute: ({ writer }) => parseStreamToUI(stream.fullStream, writer),
          }),
        });
      } else {
        const text = await agent.generateText(modelMessages, {
          abortSignal: options?.abortSignal,
        });
        
        this.persistMessages([{
          id: `assistant-${crypto.randomUUID()}`,
          role: "assistant",
          parts: [{ type: "text", text: text.text }],
        }]).catch(() => {});

        return new Response(JSON.stringify({ text }), { status: 200 });
      }
    } catch (error) {
      throw error;
    }
  }

  override async onChatMessage(onFinish: StreamTextOnFinishCallback<ToolSet>, options?: OnChatMessageOptions): Promise<Response> {
    try {
      return await this._onChatMessage(onFinish, options);
    } catch (error) {
      console.error("onChatMessage failed", error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
        { status: 500 },
      );
    }
  }
}
