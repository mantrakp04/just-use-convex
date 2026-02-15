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
import type { worker } from "../../alchemy.run";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import {
  type ConvexAdapter,
  createConvexAdapter,
  parseTokenFromUrl,
} from "@just-use-convex/backend/convex/lib/convexAdapter";
import { env as agentDefaults } from "@just-use-convex/env/agent";
import type { FunctionReturnType } from "convex/server";
import { parseStreamToUI } from "../utils/fullStreamParser";
import {
  BackgroundTaskStore,
  TruncatedOutputStore,
  patchToolWithBackgroundSupport,
  createBackgroundTaskToolkit,
} from "../tools/utils/wrapper";
import { generateTitle } from "./chat-meta";
import {
  extractMessageText,
  processMessagesForAgent,
} from "./messages";
import type { AgentArgs, AgentDeps, AgentEnv, ModeConfig } from "./types";
import {
  buildRetrievalMessage,
  deleteMessageVectors,
  indexMessagesInVectorStore,
} from "./vectorize";
import {
  createSandboxFsFunctions,
  createSandboxPtyFunctions,
} from "../tools/sandbox";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { ensureSandboxStarted, downloadFileUrlsInSandbox } from "../tools/utils/sandbox";
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
import { createAiClient } from "./client";
import { CHAT_SYSTEM_PROMPT, WORKFLOW_SYSTEM_PROMPT, TASK_PROMPT } from "./prompt";
import { createAskUserToolkit } from "../tools/ask-user";
import { createWebSearchToolkit } from "../tools/websearch";
import { createDaytonaToolkit } from "../tools/sandbox";
import { createWorkflowActionToolkit } from "../tools/workflow-actions";

// ─── Config helpers ──────────────────────────────────────────────

const FORWARDED_STREAM_EVENTS = [
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
] as const;

const PLANNING_INSTRUCTIONS = [
  "Use write_todos when a task is multi-step or when a plan improves clarity.",
  "If the request is simple and direct, you may skip write_todos.",
  "When you do use write_todos, keep 3-8 concise steps.",
  "When creating a plan, all steps must start with 'pending' status.",
  "When all steps are executed, all the todos must end with 'done' status.",
  "Regularly check and update the status of the todos to ensure they are accurate and up to date.",
].join("\n");

function initVoltAgentRegistry(
  env: AgentEnv,
  waitUntil: (promise: Promise<unknown>) => void,
): void {
  setWaitUntil(waitUntil);
  const registry = AgentRegistry.getInstance();
  if (env.VOLTAGENT_PUBLIC_KEY && env.VOLTAGENT_SECRET_KEY) {
    registry.setGlobalVoltOpsClient(
      createVoltOpsClient({
        publicKey: env.VOLTAGENT_PUBLIC_KEY as string,
        secretKey: env.VOLTAGENT_SECRET_KEY as string,
      })
    );
  }
}

async function buildPlanAgent(
  deps: AgentDeps,
  config: ModeConfig,
): Promise<PlanAgent> {
  const { env, model, reasoningEffort, daytona, sandbox, backgroundTaskStore, truncatedOutputStore } = deps;

  const subagents = await buildSubagents(model, reasoningEffort, daytona, sandbox);

  const toolkits: Toolkit[] = [
    createWebSearchToolkit(),
    createAskUserToolkit(),
  ];

  if (config.mode === "workflow") {
    toolkits.push(
      createWorkflowActionToolkit(config.workflow.allowedActions, config.convexAdapter),
    );
  }

  const systemPrompt = config.mode === "chat"
    ? CHAT_SYSTEM_PROMPT(config.chat)
    : WORKFLOW_SYSTEM_PROMPT(config.workflow, config.triggerPayload);

  const agent = new PlanAgent({
    name: config.mode === "chat" ? "Assistant" : "WorkflowExecutor",
    systemPrompt,
    model: createAiClient(model, reasoningEffort),
    tools: [...toolkits, createBackgroundTaskToolkit(backgroundTaskStore, truncatedOutputStore)],
    planning: false,
    task: {
      taskDescription: TASK_PROMPT,
      supervisorConfig: {
        fullStreamEventForwarding: {
          types: [...FORWARDED_STREAM_EVENTS],
        },
      },
    },
    subagents,
    filesystem: false,
    maxSteps: config.mode === "chat" ? 100 : 50,
    ...buildObservability(env),
  });

  agent.addTools([
    createPlanningToolkit(agent, {
      systemPrompt: PLANNING_INSTRUCTIONS,
    }),
  ]);

  for (const sub of subagents) {
    agent.addSubAgent(sub);
  }

  return agent;
}

function patchAgentModel(
  agent: PlanAgent,
  model: string,
  reasoningEffort?: "low" | "medium" | "high",
): void {
  const aiModel = createAiClient(model, reasoningEffort);

  for (const subagent of agent.getSubAgents()) {
    if (subagent && typeof subagent === "object" && "model" in subagent) {
      Object.defineProperty(subagent, "model", {
        value: createAiClient(model, reasoningEffort),
        writable: true,
        configurable: true,
      });
    }
  }

  Object.defineProperty(agent, "model", {
    value: aiModel,
    writable: true,
    configurable: true,
  });
}

function patchBackgroundTasks(
  agent: PlanAgent,
  backgroundTaskStore: BackgroundTaskStore,
  truncatedOutputStore: TruncatedOutputStore,
  env: AgentEnv,
): void {
  const tasks = agent.getTools().find((t) => t.name === "task");
  if (tasks) {
    const maxBackgroundDuration = Number(
      env.MAX_BACKGROUND_DURATION_MS ?? agentDefaults.MAX_BACKGROUND_DURATION_MS,
    );
    patchToolWithBackgroundSupport(tasks, backgroundTaskStore, truncatedOutputStore, {
      maxDuration: 30 * 60 * 1000,
      maxBackgroundDuration: maxBackgroundDuration > 0 ? maxBackgroundDuration : undefined,
      allowAgentSetDuration: true,
      allowBackground: true,
    });
  }
}

async function buildSubagents(
  model: string,
  reasoningEffort: "low" | "medium" | "high" | undefined,
  daytona: Daytona | null,
  sandbox: Sandbox | null,
): Promise<Agent[]> {
  if (!sandbox || !daytona) return [];

  const toolkit = await createDaytonaToolkit(daytona, sandbox);
  return [
    new Agent({
      name: toolkit.name,
      purpose: toolkit.description,
      model: createAiClient(model, reasoningEffort),
      instructions: toolkit.instructions ?? "",
      tools: toolkit.tools,
    }),
  ];
}

function buildObservability(env: AgentEnv) {
  if (!env.VOLTAGENT_PUBLIC_KEY || !env.VOLTAGENT_SECRET_KEY) return {};
  return {
    observability: createVoltAgentObservability({
      serviceName: "just-use-convex-agent",
      serviceVersion: "1.0.0",
      voltOpsSync: {
        sampling: { strategy: "always" as const },
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 30000,
      },
    }),
  };
}

// ─── AgentWorker ────────────────────────────────────────────────

type CallableFunctionInstance = object;
type CallableServiceMethodsMap = Record<string, (...args: unknown[]) => unknown>;
type CallableServiceMethod = keyof CallableServiceMethodsMap;

export class AgentWorker extends AIChatAgent<typeof worker.Env, AgentArgs> {
  private convexAdapter: ConvexAdapter | null = null;
  private planAgent: PlanAgent | null = null;
  private backgroundTaskStore = new BackgroundTaskStore(this.ctx.waitUntil.bind(this.ctx));
  private truncatedOutputStore = new TruncatedOutputStore();
  private chatDoc: FunctionReturnType<typeof api.chats.index.get> | null = null;
  private callableFunctions: CallableFunctionInstance[] = [];
  private didRegisterCallableFunctions = false;
  private daytona: Daytona | null = null;
  private sandbox: Sandbox | null = null;

  // ─── Initialization ───────────────────────────────────────────

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

    this.daytona = new Daytona({
      apiKey: this.env.DAYTONA_API_KEY ?? agentDefaults.DAYTONA_API_KEY,
      apiUrl: this.env.DAYTONA_API_URL ?? agentDefaults.DAYTONA_API_URL,
      target: this.env.DAYTONA_TARGET ?? agentDefaults.DAYTONA_TARGET,
    });
    if (!this.sandbox && this.chatDoc?.sandboxId) {
      this.sandbox = await this.daytona.get(this.chatDoc?.sandboxId);
      await ensureSandboxStarted(this.sandbox);
    }

    this.callableFunctions = [
      ...(this.sandbox ? [createSandboxFsFunctions(this.sandbox), createSandboxPtyFunctions(this.sandbox)] : []),
    ];
    await this._registerCallableFunctions();
  }

  // ─── Agent Preparation ────────────────────────────────────────

  private async _prepAgent(): Promise<PlanAgent> {
    initVoltAgentRegistry(this.env, this.ctx.waitUntil.bind(this.ctx));

    if (!this.state.model) {
      throw new Error("Agent not initialized: missing model");
    }

    const agent = await buildPlanAgent(
      {
        env: this.env,
        model: this.state.model,
        reasoningEffort: this.state.reasoningEffort,
        daytona: this.daytona,
        sandbox: this.sandbox,
        backgroundTaskStore: this.backgroundTaskStore,
        truncatedOutputStore: this.truncatedOutputStore,
      },
      {
        mode: "chat",
        chat: this.chatDoc!,
      },
    );

    patchBackgroundTasks(agent, this.backgroundTaskStore, this.truncatedOutputStore, this.env);
    this.planAgent = agent;
    return agent;
  }

  private async _patchAgent(): Promise<void> {
    if (!this.planAgent || !this.state.model) return;
    patchAgentModel(this.planAgent, this.state.model, this.state.reasoningEffort);
  }

  // ─── Callable Functions ───────────────────────────────────────

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

  // ─── Lifecycle ────────────────────────────────────────────────

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

  // ─── Workflow Execution ───────────────────────────────────────

  private async _handleExecuteWorkflow(request: Request): Promise<Response> {
    let executionId: Id<"workflowExecutions"> | null = null;
    try {
      const url = new URL(request.url);
      const tokenConfig = parseTokenFromUrl(url);
      if (!tokenConfig) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      const body = await request.json() as {
        executionId: string;
        workflowId: string;
        triggerPayload: string;
      };
      executionId = body.executionId as Id<"workflowExecutions">;

      const adapter = await createConvexAdapter(this.env.CONVEX_URL, tokenConfig);

      const workflow = await adapter.query(
        api.workflows.index.getForExecutionExt,
        { _id: body.workflowId as Id<"workflows"> },
      );
      if (!workflow) {
        return new Response(JSON.stringify({ error: "Workflow not found" }), { status: 404 });
      }

      await adapter.mutation(
        api.workflows.index.updateExecutionStatusExt,
        { executionId, status: "running" },
      );

      const model = workflow.model ?? agentDefaults.DEFAULT_MODEL;

      // Initialize Daytona + sandbox if workflow has one attached
      let daytona: Daytona | null = null;
      let sandbox: Sandbox | null = null;

      if (workflow.sandboxId) {
        daytona = new Daytona({
          apiKey: this.env.DAYTONA_API_KEY ?? agentDefaults.DAYTONA_API_KEY,
          apiUrl: this.env.DAYTONA_API_URL ?? agentDefaults.DAYTONA_API_URL,
          target: this.env.DAYTONA_TARGET ?? agentDefaults.DAYTONA_TARGET,
        });
        sandbox = await daytona.get(workflow.sandboxId);
        await ensureSandboxStarted(sandbox);
      }

      initVoltAgentRegistry(this.env, this.ctx.waitUntil.bind(this.ctx));

      const agent = await buildPlanAgent(
        {
          env: this.env,
          model,
          daytona,
          sandbox,
          backgroundTaskStore: this.backgroundTaskStore,
          truncatedOutputStore: this.truncatedOutputStore,
        },
        {
          mode: "workflow",
          workflow,
          triggerPayload: body.triggerPayload,
          convexAdapter: adapter,
        },
      );

      const result = await agent.generateText([{
        id: crypto.randomUUID(),
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Execute this workflow now." }],
      }]);

      await adapter.mutation(
        api.workflows.index.updateExecutionStatusExt,
        {
          executionId,
          status: "completed",
          agentOutput: result.text,
          completedAt: Date.now(),
        } as never,
      );

      return new Response(JSON.stringify({ status: "completed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("executeWorkflow failed", error);
      try {
        const url = new URL(request.url);
        const tokenConfig = parseTokenFromUrl(url);
        if (tokenConfig && executionId) {
          const adapter = await createConvexAdapter(this.env.CONVEX_URL, tokenConfig);
          await adapter.mutation(
            api.workflows.index.updateExecutionStatusExt,
            {
              executionId,
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
              completedAt: Date.now(),
            } as never,
          );
        }
      } catch {
        // Best effort
      }

      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : "Workflow execution failed",
      }), { status: 500 });
    }
  }

  // ─── Chat Message Handling ────────────────────────────────────

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

      if (this.sandbox) {
        await ensureSandboxStarted(this.sandbox, false);
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
