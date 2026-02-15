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
import type { PlanAgent } from "@voltagent/core";
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
} from "../tools/utils/wrapper";
import { generateTitle } from "./chat-meta";
import {
  extractMessageText,
  processMessagesForAgent,
} from "./messages";
import type { AgentArgs } from "./types";
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
  buildPlanAgent,
  initVoltAgentRegistry,
  patchAgentModel,
  patchBackgroundTasks,
} from "./config";

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
        sandboxDoc: this.chatDoc?.sandbox ?? undefined,
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

      initVoltAgentRegistry(this.env, this.ctx.waitUntil.bind(this.ctx));

      const agent = await buildPlanAgent(
        {
          env: this.env,
          model,
          daytona: this.daytona,
          sandbox: this.sandbox,
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
