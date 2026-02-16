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
import { parseStreamToUI } from "../utils/fullStreamParser";
import {
  BackgroundTaskStore,
  TruncatedOutputStore,
  patchToolWithBackgroundSupport,
} from "../tools/utils/wrapper";
import { generateTitle } from "../agent/chat-meta";
import {
  extractMessageText,
  processMessagesForAgent,
} from "../agent/messages";
import {
  executeWorkflowRequestSchema,
  type AgentArgs,
  type ChatRuntimeDoc,
  type CallableFunctionInstance,
  type CallableServiceMethod,
  type CallableServiceMethodsMap,
  type ModeConfig,
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
import { ensureSandboxStarted, downloadFileUrlsInSandbox } from "../tools/utils/sandbox";
import {
  buildInitArgsFromUrl,
  buildWorkflowExecutionMessages,
  parseTokenFromRequest,
  resolveWorkflowExecutionState,
} from "./helpers";
import { createWorkerPlanAgent } from "../agent/agent";

export class AgentWorker extends AIChatAgent<typeof worker.Env, AgentArgs> {
  private convexAdapter: ConvexAdapter | null = null;
  private planAgent: PlanAgent | null = null;
  private backgroundTaskStore = new BackgroundTaskStore(this.ctx.waitUntil.bind(this.ctx));
  private truncatedOutputStore = new TruncatedOutputStore();
  private chatDoc: ChatRuntimeDoc | null = null;
  private workflowDoc: WorkflowRuntimeDoc | null = null;
  private modeConfig: ModeConfig | null = null;
  private callableFunctions: CallableFunctionInstance[] = [];
  private didRegisterCallableFunctions = false;
  private daytona: Daytona | null = null;
  private sandbox: Sandbox | null = null;

  private async _init(args?: AgentArgs): Promise<void> {
    if (args) {
      await this.ctx.storage.put("initArgs", args);
      this.planAgent = null;
    }
    const initArgs = (args ?? (await this.ctx.storage.get("initArgs"))) as AgentArgs | null;
    if (!initArgs) {
      throw new Error("Agent not initialized: missing initArgs");
    }
    const persistedState = await this.ctx.storage.get<AgentArgs>("chatState");
    const currentState: AgentArgs = this.state ?? persistedState ?? initArgs ?? {};
    if (Object.keys(currentState).length) {
      this.setState(currentState);
    }

    const activeTokenConfig = initArgs.tokenConfig ?? currentState.tokenConfig;
    if (!activeTokenConfig) {
      throw new Error("Unauthorized: No token provided");
    }
    this.convexAdapter = await createConvexAdapter(this.env.CONVEX_URL, activeTokenConfig);
    const modeConfig = initArgs.modeConfig ?? getDefaultChatModeConfig(this.name as Id<"chats">);
    this.modeConfig = modeConfig;
    this.chatDoc = null;
    this.workflowDoc = null;

    let sandboxId: string | undefined;
    if (modeConfig.mode === "workflow") {
      const workflow = await this.convexAdapter.query(
        api.workflows.index.getForExecutionExt,
        { _id: modeConfig.workflow },
      );
      if (!workflow) {
        throw new Error("Workflow not found");
      }
      this.workflowDoc = workflow;

      this.setState({
        ...resolveWorkflowExecutionState(currentState, workflow),
        modeConfig,
      });

      if (workflow.executionMode === "latestChat") {
        this.chatDoc = await this._getChatById(this.name as Id<"chats">).catch(() => null);
      }

      sandboxId = workflow.sandboxId ?? this.chatDoc?.sandboxId;
    } else {
      const chat = await this._getChatById(modeConfig.chat);
      if (!chat) {
        throw new Error("Unauthorized: No chat found");
      }
      this.chatDoc = chat;
      this.setState({
        ...currentState,
        modeConfig,
      });
      sandboxId = chat.sandboxId;
    }

    this.daytona = new Daytona({
      apiKey: this.env.DAYTONA_API_KEY ?? agentDefaults.DAYTONA_API_KEY,
      apiUrl: this.env.DAYTONA_API_URL ?? agentDefaults.DAYTONA_API_URL,
      target: this.env.DAYTONA_TARGET ?? agentDefaults.DAYTONA_TARGET,
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
    if (!this.state || !this.modeConfig) {
      throw new Error("Agent not initialized: missing model or modeConfig");
    }
    const agent = await createWorkerPlanAgent({
      env: this.env,
      state: this.state,
      modeConfig: this.modeConfig,
      chatDoc: this.chatDoc,
      workflowDoc: this.workflowDoc,
      convexAdapter: this.convexAdapter,
      daytona: this.daytona,
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
      const maxBackgroundDuration = Number(this.env.MAX_BACKGROUND_DURATION_MS ?? agentDefaults.MAX_BACKGROUND_DURATION_MS);
      patchToolWithBackgroundSupport(tasks, this.backgroundTaskStore, this.truncatedOutputStore, {
        maxDuration: 30 * 60 * 1000,
        maxBackgroundDuration: maxBackgroundDuration > 0 ? maxBackgroundDuration : undefined,
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

  private async _getChatById(chatId: Id<"chats">): Promise<ChatRuntimeDoc | null> {
    if (!this.convexAdapter) {
      throw new Error("Agent not initialized: missing convex adapter");
    }

    const getFn = this.convexAdapter.getTokenType() === "ext"
      ? api.chats.index.getExt
      : api.chats.index.get;

    return await this.convexAdapter.query(getFn, { _id: chatId });
  }

  private async _markWorkflowExecutionFailed(error: unknown, executionId: Id<"workflowExecutions"> | null): Promise<void> {
    if (!executionId || !this.convexAdapter) {
      return;
    }

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
    let executionId: Id<"workflowExecutions"> | null = null;

    try {
      if (isExecuteWorkflow) {
        const parsedRequestBody = executeWorkflowRequestSchema.safeParse(await request.json());
        if (!parsedRequestBody.success) {
          return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
        }

        const tokenConfig = parseTokenFromRequest(request);
        if (!tokenConfig) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        const workflowRequest = parsedRequestBody.data;
        executionId = workflowRequest.executionId as Id<"workflowExecutions">;
        await this._init(
          buildInitArgsFromUrl(url, {
            tokenConfig,
            modeConfig: {
              mode: "workflow",
              workflow: workflowRequest.workflow as Id<"workflows">,
              executionId,
              triggerPayload: workflowRequest.triggerPayload,
            },
          }),
        );
        if (!this.convexAdapter) {
          throw new Error("No convex adapter");
        }
        await this.convexAdapter.mutation(api.workflows.index.updateExecutionStatusExt, {
          executionId,
          status: "running",
        });
        return await this._handleExecuteWorkflow();
      }

      await this._init(buildInitArgsFromUrl(url, {
        modeConfig: getDefaultChatModeConfig(this.name as Id<"chats">),
      }));
      return await super.onRequest(request);
    } catch (error) {
      await this._markWorkflowExecutionFailed(error, executionId);

      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
        { status: 500 },
      );
    }
  }

  override async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    await this._init(buildInitArgsFromUrl(url, {
      modeConfig: getDefaultChatModeConfig(this.name as Id<"chats">),
    }));
    await this._prepAgent();
    return await super.onConnect(connection, ctx);
  }

  override async onStateUpdate(state: AgentArgs, source: Connection | "server"): Promise<void> {
    await this.ctx.storage.put("chatState", state);
    await this._patchAgent();
    await super.onStateUpdate(state, source);
  }

  override async persistMessages(messages: UIMessage[]): Promise<void> {
    await super.persistMessages(messages);
    await indexMessagesInVectorStore({
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

  private async _onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions
  ): Promise<Response> {
    if (!this.state?.model) {
      await this._markWorkflowExecutionFailed(
        new Error("Model not configured."),
        this.modeConfig?.mode === "workflow" ? this.modeConfig.executionId : null,
      );
      return new Response("Model not configured.", { status: 400 });
    }

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

      const modeConfig = this.modeConfig;
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
      if (isWorkflow && modeConfig && this.workflowDoc) {
        const modelMessages = buildWorkflowExecutionMessages(
          this.messages,
          this.state.inputModalities,
          this.workflowDoc.executionMode,
        );
        const result = await agent.generateText(modelMessages);

        if (this.workflowDoc.executionMode === "latestChat" && this.chatDoc && result.text.trim().length > 0) {
          const workflowMessage: UIMessage = {
            id: `workflow-${modeConfig.executionId}-${crypto.randomUUID()}`,
            role: "assistant",
            parts: [{ type: "text", text: result.text }],
          };
          await this.persistMessages([...this.messages, workflowMessage]);
        }

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
        lastUserIdx !== -1 && lastUserQueryText
          ? buildRetrievalMessage({
              env: this.env,
              memberId: this.chatDoc?.memberId,
              queryText: lastUserQueryText,
            })
          : null,
        this.sandbox && lastUserFilePartUrls.length > 0
          ? downloadFileUrlsInSandbox(this.sandbox, lastUserFilePartUrls)
          : null,
      ]);

      let modelMessages = retrievalMessage && lastUserIdx !== -1
        ? messagesForAgent.toSpliced(lastUserIdx, 0, retrievalMessage)
        : messagesForAgent;

      if (downloadedPaths && downloadedPaths.length > 0) {
        const fileContextMessage: UIMessage = {
          id: `file-downloads-${crypto.randomUUID()}`,
          role: "system",
          parts: [
            {
              type: "text",
              text: `Attached files downloaded to sandbox at:\n${downloadedPaths.map((p) => `- ${p}`).join("\n")}`,
            },
          ],
        };
        modelMessages = modelMessages.toSpliced(
          lastUserIdx + (retrievalMessage ? 1 : 0),
          0,
          fileContextMessage
        );
      }

      const stream = await agent.streamText(modelMessages, {
        abortSignal: options?.abortSignal,
      });

      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: ({ writer }) => parseStreamToUI(stream.fullStream, writer),
        }),
      });
    } catch (error) {
      await this._markWorkflowExecutionFailed(
        error,
        this.modeConfig?.mode === "workflow" ? this.modeConfig.executionId : null,
      );
      console.error("onChatMessage failed", error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
        { status: 500 },
      );
    }
  }

  private async _handleExecuteWorkflow(): Promise<Response> {
    return await this._onChatMessage(() => {});
  }

  override async onChatMessage(onFinish: StreamTextOnFinishCallback<ToolSet>, options?: OnChatMessageOptions): Promise<Response> {
    return await this._onChatMessage(onFinish, options);
  }
}

function getDefaultChatModeConfig(chatId: Id<"chats">): Extract<ModeConfig, { mode: "chat" }> {
  return { mode: "chat", chat: chatId };
}
