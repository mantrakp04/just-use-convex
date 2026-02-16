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
import {
  Agent,
  AgentRegistry,
  PlanAgent,
  createPlanningToolkit,
  createVoltAgentObservability,
  createVoltOpsClient,
  setWaitUntil,
  type Toolkit,
} from "@voltagent/core";
import type { worker } from "../../alchemy.run";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import {
  ConvexAdapter,
  createConvexAdapter,
  parseTokenFromUrl,
  type TokenConfig,
} from "@just-use-convex/backend/convex/lib/convexAdapter";
import { env as agentDefaults } from "@just-use-convex/env/agent";
import { createAiClient } from "./client";
import { CHAT_SYSTEM_PROMPT, WORKFLOW_SYSTEM_PROMPT, TASK_PROMPT } from "./prompt";
import { createAskUserToolkit } from "../tools/ask-user";
import { createWebSearchToolkit } from "../tools/websearch";
import { parseStreamToUI } from "../utils/fullStreamParser";
import {
  BackgroundTaskStore,
  TruncatedOutputStore,
  patchToolWithBackgroundSupport,
} from "../tools/utils/wrapper";
import { createBackgroundTaskToolkit } from "../tools/utils/wrapper/toolkit";
import { generateTitle } from "./chat-meta";
import {
  extractMessageText,
  processMessagesForAgent,
} from "./messages";
import {
  workflowInitPayloadSchema,
  type AgentArgs,
  type ModeConfig,
} from "./types";
import {
  buildRetrievalMessage,
  deleteMessageVectors,
  indexMessagesInVectorStore,
} from "./vectorize";
import {
  createDaytonaToolkit,
  createSandboxFsFunctions,
  createSandboxPtyFunctions,
} from "../tools/sandbox";
import { createWorkflowActionToolkit } from "../tools/workflow-actions";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { ensureSandboxStarted, downloadFileUrlsInSandbox } from "../tools/utils/sandbox";

type CallableFunctionInstance = object;
type CallableServiceMethodsMap = Record<string, (...args: unknown[]) => unknown>;
type CallableServiceMethod = keyof CallableServiceMethodsMap;

export class AgentWorker extends AIChatAgent<typeof worker.Env, AgentArgs> {
  private convexAdapter: ConvexAdapter | null = null;
  private planAgent: PlanAgent | null = null;
  private backgroundTaskStore = new BackgroundTaskStore(this.ctx.waitUntil.bind(this.ctx));
  private truncatedOutputStore = new TruncatedOutputStore();
  private chatDoc: Extract<ModeConfig, { mode: "chat" }>["chat"] | null = null;
  private modeConfig: ModeConfig | null = null;
  private callableFunctions: CallableFunctionInstance[] = [];
  private didRegisterCallableFunctions = false;
  private daytona: Daytona | null = null;
  private sandbox: Sandbox | null = null;
  private executionId: Id<"workflowExecutions"> | null = null;

  private async _init(args?: AgentArgs): Promise<void> {
    if (args) {
      await this.ctx.storage.put("initArgs", args);
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

    // Resolve workflowInit into a full modeConfig
    if (initArgs.workflowInit) {
      const { workflowId, executionId, triggerPayload } = initArgs.workflowInit;
      this.executionId = executionId as Id<"workflowExecutions">;

      const workflow = await this.convexAdapter.query(
        api.workflows.index.getForExecutionExt,
        { _id: workflowId as Id<"workflows"> },
      );
      if (!workflow) throw new Error("Workflow not found");

      await this.convexAdapter.mutation(
        api.workflows.index.updateExecutionStatusExt,
        { executionId: this.executionId, status: "running" },
      );

      this.modeConfig = { mode: "workflow", workflow, triggerPayload };
      if (!currentState.model) {
        this.setState({ ...currentState, model: workflow.model ?? agentDefaults.DEFAULT_MODEL } as AgentArgs);
      }
    } else if (initArgs.modeConfig) {
      this.modeConfig = initArgs.modeConfig;
    }

    // For workflow mode, use the workflow's sandbox; for chat mode, fetch chat doc
    let sandboxId: string | undefined;
    if (this.modeConfig?.mode === "workflow") {
      sandboxId = this.modeConfig.workflow.sandboxId;
    } else {
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
      this.modeConfig = { mode: "chat", chat: this.chatDoc! };
      sandboxId = this.chatDoc?.sandboxId;
    }

    this.daytona = new Daytona({
      apiKey: this.env.DAYTONA_API_KEY ?? agentDefaults.DAYTONA_API_KEY,
      apiUrl: this.env.DAYTONA_API_URL ?? agentDefaults.DAYTONA_API_URL,
      target: this.env.DAYTONA_TARGET ?? agentDefaults.DAYTONA_TARGET,
    });
    if (sandboxId && !this.sandbox) {
      this.sandbox = await this.daytona.get(sandboxId);
      await ensureSandboxStarted(this.sandbox);
    }

    this.callableFunctions = [
      ...(this.sandbox ? [createSandboxFsFunctions(this.sandbox), createSandboxPtyFunctions(this.sandbox)] : []),
    ];
    await this._registerCallableFunctions();
  }

  private async _prepAgent(): Promise<PlanAgent> {
    const boundWaitUntil = this.ctx.waitUntil.bind(this.ctx);
    setWaitUntil(boundWaitUntil);
    const registry = AgentRegistry.getInstance();
    if (this.env.VOLTAGENT_PUBLIC_KEY && this.env.VOLTAGENT_SECRET_KEY) {
      registry.setGlobalVoltOpsClient(
        createVoltOpsClient({
          publicKey: this.env.VOLTAGENT_PUBLIC_KEY as string,
          secretKey: this.env.VOLTAGENT_SECRET_KEY as string,
        })
      );
    }

    if (!this.state.model || !this.modeConfig) {
      throw new Error("Agent not initialized: missing model or modeConfig");
    }
    const model = this.state.model;
    const modeConfig = this.modeConfig;

    const subagents: Agent[] = [];
    const toolkitPromises: Promise<Toolkit>[] = [];
    if (this.sandbox && this.daytona) {
      toolkitPromises.push(createDaytonaToolkit(this.daytona, this.sandbox));
    }

    const extraToolkits: Toolkit[] = [];
    if (modeConfig.mode === "workflow") {
      extraToolkits.push(
        createWorkflowActionToolkit(modeConfig.workflow.allowedActions, this.convexAdapter!),
      );
    }

    for (const toolkit of [...(await Promise.all(toolkitPromises)), ...extraToolkits]) {
      subagents.push(
        new Agent({
          name: toolkit.name,
          purpose: toolkit.description,
          model: createAiClient(model, this.state.reasoningEffort),
          instructions: toolkit.instructions ?? '',
          tools: toolkit.tools,
        })
      );
    }

    const systemPrompt = modeConfig.mode === "chat"
      ? CHAT_SYSTEM_PROMPT(modeConfig.chat)
      : WORKFLOW_SYSTEM_PROMPT(modeConfig.workflow, modeConfig.triggerPayload);

    const agent = new PlanAgent({
      name: modeConfig.mode === "chat" ? "Assistant" : "WorkflowExecutor",
      systemPrompt,
      model: createAiClient(model, this.state.reasoningEffort),
      tools: [
        createWebSearchToolkit(),
        createAskUserToolkit(),
        createBackgroundTaskToolkit(this.backgroundTaskStore, this.truncatedOutputStore),
      ],
      planning: false,
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
      maxSteps: modeConfig.mode === "chat" ? 100 : 50,
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

  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/executeWorkflow") && request.method === "POST") {
      return this._handleExecuteWorkflow(request);
    }

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

  private async _handleExecuteWorkflow(request: Request): Promise<Response> {
    const tokenConfig = parseTokenFromRequest(request);
    if (!tokenConfig) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    let executionId: Id<"workflowExecutions"> | null = null;
    try {
      const parsedRequestBody = workflowInitPayloadSchema.safeParse(await request.json());
      if (!parsedRequestBody.success) {
        return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
      }

      const requestBody = parsedRequestBody.data;
      executionId = requestBody.executionId as Id<"workflowExecutions">;
      await this._init({
        tokenConfig,
        workflowInit: requestBody,
      });

      return this._onChatMessage(() => {});
    } catch (error) {
      if (executionId && this.convexAdapter) {
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

      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
        { status: 500 },
      );
    }
  }

  private async _onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions
  ): Promise<Response> {
    if (!this.state?.model) {
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

      const isChat = this.modeConfig?.mode === "chat";
      const isWorkflow = this.modeConfig?.mode === "workflow";

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
      if (isWorkflow && this.executionId) {
        const result = await agent.generateText([{
          id: crypto.randomUUID(),
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Execute this workflow now." }],
        }]);

        await this.convexAdapter.mutation(
          api.workflows.index.updateExecutionStatusExt,
          {
            executionId: this.executionId,
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
      // Workflow: best-effort status update on failure
      if (this.executionId && this.convexAdapter) {
        await this.convexAdapter.mutation(
          api.workflows.index.updateExecutionStatusExt,
          {
            executionId: this.executionId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            completedAt: Date.now(),
          },
        ).catch(() => {});
      }
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

function parseTokenFromRequest(request: Request): TokenConfig | null {
  const url = new URL(request.url);
  const tokenConfig = parseTokenFromUrl(url);
  if (tokenConfig) {
    return tokenConfig;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const externalToken = authorization.slice(7).trim();
  if (!externalToken) {
    return null;
  }

  const memberId = request.headers.get("x-member-id");
  const userId = request.headers.get("x-user-id");
  if (memberId) {
    return {
      type: "ext",
      externalToken,
      identifier: { type: "memberId", value: memberId },
    };
  }

  if (userId) {
    return {
      type: "ext",
      externalToken,
      identifier: { type: "userId", value: userId },
    };
  }

  return null;
}
