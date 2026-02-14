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
import type { worker } from "@just-use-convex/agent/alchemy.run";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import {
  ConvexAdapter,
  createConvexAdapter,
  parseTokenFromUrl,
} from "@just-use-convex/backend/convex/lib/convexAdapter";
import type { FunctionReturnType } from "convex/server";
import { createAiClient } from "../client";
import { SYSTEM_PROMPT, TASK_PROMPT } from "../prompt";
import { createAskUserToolkit } from "../tools/ask-user";
import { createWebSearchToolkit } from "../tools/websearch";
import { parseStreamToUI } from "../utils/fullStreamParser";
import {
  BackgroundTaskStore,
  TruncatedOutputStore,
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
import { createSandboxPtyFunctions, createDaytonaToolkit } from "../tools/sandbox";
import { Daytona, type Sandbox } from "@daytonaio/sdk";

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
    if (!this.convexAdapter) {
      const activeTokenConfig = initArgs.tokenConfig ?? currentState.tokenConfig;
      if (!activeTokenConfig) {
        throw new Error("Unauthorized: No token provided");
      }
      this.convexAdapter = await createConvexAdapter(this.env.CONVEX_URL, activeTokenConfig);

    }

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

    if (!this.daytona) {
      this.daytona = new Daytona({
        apiKey: this.env.DAYTONA_API_KEY ?? '',
        apiUrl: this.env.DAYTONA_API_URL ?? '',
        target: this.env.DAYTONA_TARGET ?? '',
      });
    }
    if (!this.sandbox && this.chatDoc?.sandboxId) {
      this.sandbox = await this.daytona.get(this.chatDoc?.sandboxId);
    }

    this.callableFunctions = [
      ...(this.sandbox ? [createSandboxPtyFunctions(this.sandbox)] : []),
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

    if (!this.sandbox || !this.daytona || !this.state.model) {
      throw new Error("Daytona or sandbox not found");
    }
    const model = this.state.model;

    const subagents = (await Promise.all([
      createDaytonaToolkit(this.daytona, this.sandbox),
    ]) satisfies Toolkit[]).map((toolkit) =>
        new Agent({
          name: toolkit.name,
          purpose: toolkit.description,
          model: createAiClient(model, this.state.reasoningEffort),
          instructions: toolkit.instructions ?? '',
          tools: toolkit.tools,
        })
      );

    const agent = new PlanAgent({
      name: "Assistant",
      systemPrompt: SYSTEM_PROMPT,
      model: createAiClient(model, this.state.reasoningEffort),
      tools: withBackgroundTaskTools([
        createWebSearchToolkit(),
        createAskUserToolkit(),
      ], this.backgroundTaskStore, this.truncatedOutputStore),
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
      patchToolWithBackgroundSupport(tasks, this.backgroundTaskStore, this.truncatedOutputStore, {
        maxDuration: 30 * 60 * 1000,
        maxBackgroundDuration: Number(this.env.MAX_BACKGROUND_DURATION_MS) || undefined,
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

    await Promise.all(this.callableFunctions.map(async (fn) => {
      const proto = Object.getPrototypeOf(fn);
      const callableMap = fn as unknown as CallableServiceMethodsMap;
      const names = Object.getOwnPropertyNames(proto).filter(
        (name): name is CallableServiceMethod =>
          name !== "constructor" && typeof callableMap[name] === "function"
      );
      const workerProto = Object.getPrototypeOf(this);
      const register = callable();

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

        register(method, { name } as unknown as ClassMethodDecoratorContext);
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

      const messagesForAgent = filterMessageParts(
        this.messages,
        this.state.inputModalities
      );

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
