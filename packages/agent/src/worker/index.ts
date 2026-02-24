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
  type UIMessageStreamWriter,
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
  type SteerQueueInput,
  type SteerQueueItem,
  type SteerQueueState,
  type SteerQueueTarget,
  type WorkflowRuntimeDoc,
  steerQueueInputSchema,
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
import { ensureSandboxStarted, downloadFileUrlsInSandbox } from "../tools/utils/sandbox";
import {
  buildInitArgsFromUrl,
  buildWorkflowExecutionMessages,
} from "./helpers";
import { createWorkerPlanAgent } from "../agent/agent";
import {
  createInitialSteerQueueState,
  enqueueSteerItems,
  getNextQueuedPostFinishItem,
  listQueuedLiveItems,
  markSteerItemStatus,
  readSteerQueueState,
  recoverInterruptedSteerQueueState,
  removeSteerItem,
  writeSteerQueueState,
  setRunFlags,
} from "./queue-state";

const STEER_MEMORY_STORAGE_KEY = "steerMemoryHistory";
const STEER_MEMORY_MAX_ITEMS = 12;
const STEER_MEMORY_MAX_CHARS = 4_500;

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
  private steerQueueState: SteerQueueState = createInitialSteerQueueState();
  private activeRunWriter: UIMessageStreamWriter | null = null;
  private isRunActive = false;
  private isDrainingPostFinishQueue = false;
  private pendingSteerEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
  private steerQueueMutationChain: Promise<unknown> = Promise.resolve();
  private pendingPrepareMessageDirectives: SteerQueueItem[] = [];

  private async _init(args?: AgentArgs): Promise<void> {
    const existingState = await this.ctx.storage.get<AgentArgs>("state");
    if (args) {
      await this.ctx.storage.put("state", {
        ...args,
        steerQueueState: args.steerQueueState ?? existingState?.steerQueueState,
      });
    }
    const stored = await this.ctx.storage.get<AgentArgs>("state");
    if (!stored || !stored.tokenConfig) {
      throw new Error("Agent not initialized: missing state");
    }
    const recoveredQueueState = await readSteerQueueState(this.ctx.storage, stored.steerQueueState ?? null);
    const steerQueueState = recoverInterruptedSteerQueueState(recoveredQueueState);
    this.steerQueueState = steerQueueState;
    this.setState({
      ...stored,
      steerQueueState,
    });
    await this.ctx.storage.put("state", {
      ...stored,
      steerQueueState,
    });
    await writeSteerQueueState(this.ctx.storage, steerQueueState);

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
        this.sandbox = await this.daytona.get(sandboxId);
      }
      await ensureSandboxStarted(this.sandbox);
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
      getSteerQueueItemsForPrepareMessages: this._consumeSteerQueueItemsForPrepareMessages.bind(this),
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
        await this.convexAdapter.mutation(api.workflows.index.updateExecutionStatusExt, {
          executionId,
          status: "running",
        });
        return await this._onChatMessage(() => {});
      } catch (error) {
        console.error("onRequest failed", error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }), { status: 500 });
      }
    }

    return await super.onRequest(request);
  }

  override async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    await this._init(buildInitArgsFromUrl(url));
    await this._prepAgent();
    return await super.onConnect(connection, ctx);
  }

  override async onStateChanged(state: AgentArgs, source: Connection | "server"): Promise<void> {
    const stored = await this.ctx.storage.get<AgentArgs>("state");
    const steerQueueState = await readSteerQueueState(this.ctx.storage, stored?.steerQueueState ?? null);
    this.steerQueueState = steerQueueState;
    const nextState = {
      ...(stored ?? this.state),
      ...state,
      tokenConfig: stored?.tokenConfig ?? state.tokenConfig,
      modeConfig: stored?.modeConfig ?? state.modeConfig,
      steerQueueState,
    };
    await this.ctx.storage.put("state", nextState);
    this.setState(nextState);
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

  @callable()
  async steerQueue(input?: SteerQueueInput) {
    const parsed = steerQueueInputSchema.safeParse(input ?? {});
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }

    const directives = collectSteeringDirectives(parsed.data);
    if (directives.length === 0) {
      throw new Error("At least one steering directive is required");
    }

    const requestedMode = parsed.data.mode ?? "auto";
    const targetQueue: SteerQueueTarget =
      parsed.data.queue ??
      (requestedMode === "live"
        ? "live"
        : requestedMode === "post_finish"
          ? "post_finish"
          : this._isChatRunActive()
            ? "live"
            : "post_finish");

    const result = await this._withSteerQueueLock(async () => {
      const { state, items } = enqueueSteerItems(this.steerQueueState, {
        target: targetQueue,
        texts: directives,
      });

      await this._setSteerQueueState(state);
      this._emitSteerQueueEvent("enqueue", {
        queue: targetQueue,
        items,
        ...(items.length === 1 ? { item: items[0] } : {}),
      });

      if (targetQueue === "live" && this._isChatRunActive()) {
        await this._flushLiveSteerQueue();
      } else if (targetQueue === "post_finish" && !this._isChatRunActive()) {
        await this._flushPostFinishQueueWithoutActiveRun();
      }

      return {
        items,
        state: this.steerQueueState,
      };
    });

    return result;
  }

  @callable()
  async getSteerQueueState() {
    this.steerQueueState = await readSteerQueueState(this.ctx.storage, this.steerQueueState);
    return this.steerQueueState;
  }

  @callable()
  async removeSteerQueueItem(input: { itemId: string; queue?: SteerQueueTarget }) {
    if (!input?.itemId || input.itemId.trim().length === 0) {
      throw new Error("itemId is required");
    }

    return await this._withSteerQueueLock(async () => {
      const { state, removedFrom } = removeSteerItem(
        this.steerQueueState,
        input.itemId,
        input.queue,
      );

      if (removedFrom.length > 0) {
        await this._setSteerQueueState(state);
        this._emitSteerQueueEvent("removed", {
          itemId: input.itemId,
          removedFrom,
        });
      }

      return {
        itemId: input.itemId,
        removedFrom,
        state: this.steerQueueState,
      };
    });
  }

  private async _beginChatRun(runId: string): Promise<void> {
    if (this.state.modeConfig.mode !== "chat") {
      return;
    }
    this.activeRunWriter = null;
    this.isRunActive = true;
    this.pendingSteerEvents = [];
    this.pendingPrepareMessageDirectives = [];
    await this._setSteerQueueState(setRunFlags(this.steerQueueState, {
      isRunActive: true,
      activeRunId: runId,
    }));
  }

  private _attachChatRunWriter(writer: UIMessageStreamWriter): void {
    if (this.state.modeConfig.mode !== "chat") {
      return;
    }
    this.activeRunWriter = writer;
    const eventsToFlush = this.pendingSteerEvents;
    this.pendingSteerEvents = [];
    this._writeSteerQueueEvent("snapshot", {});
    for (const event of eventsToFlush) {
      this._writeSteerQueueEvent(event.event, event.payload);
    }
  }

  private async _endChatRun(): Promise<void> {
    this.activeRunWriter = null;
    this.isRunActive = false;
    this.pendingSteerEvents = [];
    this.pendingPrepareMessageDirectives = [];
    await this._setSteerQueueState(setRunFlags(this.steerQueueState, {
      isRunActive: false,
      isLiveFlushing: false,
      isPostFlushing: false,
      activeRunId: null,
    }));
  }

  private _isChatRunActive(): boolean {
    return this.isRunActive && this.state.modeConfig.mode === "chat";
  }

  private _emitSteerQueueEvent(event: string, payload: Record<string, unknown>): void {
    if (!this.activeRunWriter) {
      if (this._isChatRunActive()) {
        this.pendingSteerEvents.push({ event, payload });
      }
      return;
    }

    this._writeSteerQueueEvent(event, payload);
  }

  private _writeSteerQueueEvent(event: string, payload: Record<string, unknown>): void {
    if (!this.activeRunWriter) {
      return;
    }

    try {
      this.activeRunWriter.write({
        type: "data-steer-queue",
        id: this.steerQueueState.activeRunId ?? "steer-queue",
        data: {
          event,
          runId: this.steerQueueState.activeRunId,
          ...payload,
          snapshot: this.steerQueueState,
          state: this.steerQueueState,
          timestamp: Date.now(),
        },
      } as never);
    } catch {
      // Writer may already be closed by client disconnect.
    }
  }

  private async _setSteerQueueState(nextState: SteerQueueState): Promise<void> {
    this.steerQueueState = nextState;
    const nextAgentState: AgentArgs = {
      ...this.state,
      steerQueueState: nextState,
    };
    this.setState(nextAgentState);
    await Promise.all([
      this.ctx.storage.put("state", nextAgentState),
      writeSteerQueueState(this.ctx.storage, nextState),
    ]);
  }

  private async _withSteerQueueLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.steerQueueMutationChain.then(fn, fn);
    this.steerQueueMutationChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async _flushLiveSteerQueue(): Promise<SteerQueueItem[]> {
    const queuedItems = listQueuedLiveItems(this.steerQueueState);
    if (queuedItems.length === 0) {
      return [];
    }

    await this._setSteerQueueState(setRunFlags(this.steerQueueState, { isLiveFlushing: true }));
    const flushed: SteerQueueItem[] = [];

    try {
      for (const item of queuedItems) {
        await this._setSteerQueueState(markSteerItemStatus(this.steerQueueState, item.id, "injecting"));
        const injectingItem = this.steerQueueState.liveSteerQueue.find((current) => current.id === item.id) ?? item;
        this._emitSteerQueueEvent("injecting", { item: injectingItem });

        try {
          await this._persistSteeringMemory(injectingItem);
          if (this._isChatRunActive()) {
            this.pendingPrepareMessageDirectives.push(injectingItem);
          }
          await this._setSteerQueueState(markSteerItemStatus(this.steerQueueState, item.id, "done"));
          const doneItem = this.steerQueueState.liveSteerQueue.find((current) => current.id === item.id);
          if (doneItem) {
            flushed.push(doneItem);
            this._emitSteerQueueEvent("done", { item: doneItem });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this._setSteerQueueState(markSteerItemStatus(this.steerQueueState, item.id, "failed", { error: message }));
          const failedItem = this.steerQueueState.liveSteerQueue.find((current) => current.id === item.id) ?? injectingItem;
          this._emitSteerQueueEvent("failed", { item: failedItem });
        }
      }
    } finally {
      await this._setSteerQueueState(setRunFlags(this.steerQueueState, { isLiveFlushing: false }));
    }

    return flushed;
  }

  private async _consumeSteerQueueItemsForPrepareMessages(): Promise<SteerQueueItem[]> {
    if (!this._isChatRunActive()) {
      return [];
    }
    const pendingItems = await this._withSteerQueueLock(async () => {
      const items = this.pendingPrepareMessageDirectives;
      this.pendingPrepareMessageDirectives = [];
      return items;
    });
    const history = await this._readSteeringHistory();
    return mergeSteeringItemsForPrepareMessages(pendingItems, history);
  }

  private async _flushPostFinishQueueWithoutActiveRun(): Promise<void> {
    if (this._isChatRunActive()) {
      return;
    }

    await this._setSteerQueueState(setRunFlags(this.steerQueueState, { isPostFlushing: true }));
    try {
      while (true) {
        const item = getNextQueuedPostFinishItem(this.steerQueueState);
        if (!item) {
          return;
        }

        await this._setSteerQueueState(markSteerItemStatus(this.steerQueueState, item.id, "injecting"));
        const injectingItem = this.steerQueueState.postFinishQueue.find((current) => current.id === item.id) ?? item;
        this._emitSteerQueueEvent("injecting", { item: injectingItem });

        try {
          await this._persistSteeringMemory(injectingItem);
          await this._setSteerQueueState(markSteerItemStatus(this.steerQueueState, item.id, "done"));
          const doneItem = this.steerQueueState.postFinishQueue.find((current) => current.id === item.id) ?? injectingItem;
          this._emitSteerQueueEvent("done", { item: doneItem });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this._setSteerQueueState(markSteerItemStatus(this.steerQueueState, item.id, "failed", { error: message }));
          const failedItem = this.steerQueueState.postFinishQueue.find((current) => current.id === item.id) ?? injectingItem;
          this._emitSteerQueueEvent("failed", { item: failedItem });
        }
      }
    } finally {
      await this._setSteerQueueState(setRunFlags(this.steerQueueState, { isPostFlushing: false }));
    }
  }

  private async _drainPostFinishSteerQueue({
    agent,
    modelMessages,
    abortSignal,
    writer,
  }: {
    agent: PlanAgent;
    modelMessages: UIMessage[];
    abortSignal?: AbortSignal;
    writer: UIMessageStreamWriter;
  }): Promise<void> {
    if (this.isDrainingPostFinishQueue || this.state.modeConfig.mode !== "chat") {
      return;
    }

    this.isDrainingPostFinishQueue = true;
    await this._setSteerQueueState(setRunFlags(this.steerQueueState, { isPostFlushing: true }));
    try {
      while (!abortSignal?.aborted) {
        await this._withSteerQueueLock(() => this._flushLiveSteerQueue());
        const injectingItem = await this._withSteerQueueLock(async () => {
          const nextPostItem = getNextQueuedPostFinishItem(this.steerQueueState);
          if (!nextPostItem) {
            return null;
          }

          await this._setSteerQueueState(markSteerItemStatus(this.steerQueueState, nextPostItem.id, "injecting"));
          return this.steerQueueState.postFinishQueue.find((current) => current.id === nextPostItem.id) ?? nextPostItem;
        });
        if (!injectingItem) {
          return;
        }

        this._emitSteerQueueEvent("injecting", { item: injectingItem });

        try {
          await this._persistSteeringMemory(injectingItem);
          this.pendingPrepareMessageDirectives.push(injectingItem);

          const queuedStream = await agent.streamText(modelMessages, {
            abortSignal,
          });
          await parseStreamToUI(queuedStream.fullStream, writer);

          await this._withSteerQueueLock(async () => {
            await this._setSteerQueueState(markSteerItemStatus(this.steerQueueState, injectingItem.id, "done"));
          });
          const doneItem = this.steerQueueState.postFinishQueue.find((current) => current.id === injectingItem.id) ?? injectingItem;
          this._emitSteerQueueEvent("done", { item: doneItem });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this._withSteerQueueLock(async () => {
            await this._setSteerQueueState(markSteerItemStatus(this.steerQueueState, injectingItem.id, "failed", { error: message }));
          });
          const failedItem = this.steerQueueState.postFinishQueue.find((current) => current.id === injectingItem.id) ?? injectingItem;
          this._emitSteerQueueEvent("failed", { item: failedItem });
        }
      }
    } finally {
      this.isDrainingPostFinishQueue = false;
      await this._setSteerQueueState(setRunFlags(this.steerQueueState, { isPostFlushing: false }));
    }
  }

  private async _persistSteeringMemory(item: SteerQueueItem): Promise<void> {
    await this._appendSteeringHistory(item.text);

    if (!this.planAgent) {
      this.planAgent = await this._prepAgent();
    }

    const memoryManager = this.planAgent?.getMemoryManager();
    if (!memoryManager || !this.chatDoc?.memberId || !this.chatDoc?._id) {
      return;
    }

    if (!memoryManager.hasWorkingMemorySupport()) {
      return;
    }

    await memoryManager.updateWorkingMemory({
      userId: this.chatDoc.memberId,
      conversationId: this.chatDoc._id,
      content: `Steering directive: ${item.text}`,
    });
  }

  private async _appendSteeringHistory(text: string): Promise<void> {
    const current = await this._readSteeringHistory();
    const deduped = [text, ...current.filter((item) => item !== text)];
    const next = pruneSteeringHistoryByBudget(deduped);
    await this.ctx.storage.put(STEER_MEMORY_STORAGE_KEY, next);
  }

  private async _readSteeringHistory(): Promise<string[]> {
    const current = await this.ctx.storage.get<string[]>(STEER_MEMORY_STORAGE_KEY);
    if (!Array.isArray(current)) {
      return [];
    }

    return current
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, STEER_MEMORY_MAX_ITEMS);
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

      // Workflow: non-streaming generateText, update execution status
      if (isWorkflow && this.state.modeConfig && this.workflowDoc) {
        const modelMessages = buildWorkflowExecutionMessages();
        const result = await agent.generateText(modelMessages);

        await this.convexAdapter.mutation(
          api.workflows.index.finalizeWorkflowStepsExt,
          { executionId: modeConfig.executionId },
        );

        await this.convexAdapter.mutation(
          api.workflows.index.updateExecutionStatusExt,
          {
            executionId: modeConfig.executionId,
            status: "completed",
            agentOutput: result.text,
            completedAt: Date.now(),
          },
        );

        return new Response(JSON.stringify({ status: "completed" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

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

      const runId = `run-${crypto.randomUUID()}`;
      await this._beginChatRun(runId);
      let stream: Awaited<ReturnType<PlanAgent["streamText"]>>;
      try {
        stream = await agent.streamText(modelMessages, {
          abortSignal: options?.abortSignal,
        });
      } catch (error) {
        await this._endChatRun();
        throw error;
      }

      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: async ({ writer }) => {
            this._attachChatRunWriter(writer);
            try {
              await parseStreamToUI(stream.fullStream, writer);
              await this._withSteerQueueLock(() => this._flushLiveSteerQueue());
              await this._drainPostFinishSteerQueue({
                agent,
                modelMessages,
                abortSignal: options?.abortSignal,
                writer,
              });
            } finally {
              await this._endChatRun();
            }
          },
        }),
      });
    } catch (error) {
      await this._markWorkflowExecutionFailed(
        error,
        this.state?.modeConfig?.mode === "workflow" ? this.state.modeConfig.executionId : null,
      );
      console.error("onChatMessage failed", error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
        { status: 500 },
      );
    }
  }

  override async onChatMessage(onFinish: StreamTextOnFinishCallback<ToolSet>, options?: OnChatMessageOptions): Promise<Response> {
    return await this._onChatMessage(onFinish, options);
  }
}

function collectSteeringDirectives(input: SteerQueueInput): string[] {
  const fromSingle = [input.directive, input.text, input.content]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const fromMany = (input.directives ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return fromSingle.concat(fromMany);
}

function mergeSteeringItemsForPrepareMessages(
  pendingItems: SteerQueueItem[],
  history: string[],
): SteerQueueItem[] {
  const now = Date.now();
  const mergedTexts: string[] = [];
  const seen = new Set<string>();

  for (const item of pendingItems) {
    const text = item.text.trim();
    if (!text || seen.has(text)) continue;
    mergedTexts.push(text);
    seen.add(text);
  }

  for (const text of history) {
    const normalized = text.trim();
    if (!normalized || seen.has(normalized)) continue;
    mergedTexts.push(normalized);
    seen.add(normalized);
  }

  const boundedTexts = pruneSteeringHistoryByBudget(mergedTexts);
  return boundedTexts.map((text, index) => ({
    id: `steer-context-${now}-${index}`,
    text,
    source: "live",
    status: "done",
    createdAt: now,
  }));
}

function pruneSteeringHistoryByBudget(items: string[]): string[] {
  const next: string[] = [];
  let usedChars = 0;

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;

    const nextChars = usedChars + normalized.length;
    if (nextChars > STEER_MEMORY_MAX_CHARS || next.length >= STEER_MEMORY_MAX_ITEMS) {
      break;
    }

    next.push(normalized);
    usedChars = nextChars;
  }

  return next;
}
