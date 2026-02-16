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
import type { ConvexAdapter } from "@just-use-convex/backend/convex/lib/convexAdapter";
import { createAiClient } from "./client";
import { CHAT_SYSTEM_PROMPT, WORKFLOW_SYSTEM_PROMPT, TASK_PROMPT } from "./prompt";
import { createAskUserToolkit } from "../tools/ask-user";
import { createWebSearchToolkit } from "../tools/websearch";
import { createBackgroundTaskToolkit } from "../tools/utils/wrapper/toolkit";
import {
  BackgroundTaskStore,
  TruncatedOutputStore,
} from "../tools/utils/wrapper";
import { createDaytonaToolkit } from "../tools/sandbox";
import { createWorkflowActionToolkit } from "../tools/workflow-actions";
import { createWorkflowToolkit } from "../tools/workflows";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import type {
  AgentArgs,
  ChatRuntimeDoc,
  ModeConfig,
  WorkflowRuntimeDoc,
} from "./types";

type CreateWorkerPlanAgentArgs = {
  env: typeof worker.Env;
  state: AgentArgs;
  modeConfig: ModeConfig;
  chatDoc: ChatRuntimeDoc | null;
  workflowDoc: WorkflowRuntimeDoc | null;
  convexAdapter: ConvexAdapter | null;
  daytona: Daytona | null;
  sandbox: Sandbox | null;
  backgroundTaskStore: BackgroundTaskStore;
  truncatedOutputStore: TruncatedOutputStore;
  waitUntil: (promise: Promise<unknown>) => void;
};

export async function createWorkerPlanAgent({
  env,
  state,
  modeConfig,
  chatDoc,
  workflowDoc,
  convexAdapter,
  daytona,
  sandbox,
  backgroundTaskStore,
  truncatedOutputStore,
  waitUntil,
}: CreateWorkerPlanAgentArgs): Promise<PlanAgent> {
  if (!state.model) {
    throw new Error("Agent not initialized: missing model");
  }
  if (modeConfig.mode === "chat" && !chatDoc) {
    throw new Error("Agent not initialized: missing chat context");
  }
  if (modeConfig.mode === "workflow" && (!convexAdapter || !workflowDoc)) {
    throw new Error("Agent not initialized: missing workflow context");
  }

  setWaitUntil(waitUntil);
  configureVoltOpsClient(env);

  const model = state.model;
  const subagents = await createSubagents({
    model,
    reasoningEffort: state.reasoningEffort,
    modeConfig,
    workflowDoc: modeConfig.mode === "workflow" ? workflowDoc : null,
    convexAdapter,
    daytona,
    sandbox,
  });
  const systemPrompt = resolveSystemPrompt(modeConfig, chatDoc, workflowDoc);

  const agent = new PlanAgent({
    name: modeConfig.mode === "chat" ? "Assistant" : "WorkflowExecutor",
    systemPrompt,
    model: createAiClient(model, state.reasoningEffort),
    tools: [
      createWebSearchToolkit(),
      createAskUserToolkit(),
      createBackgroundTaskToolkit(backgroundTaskStore, truncatedOutputStore),
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
    ...(env.VOLTAGENT_PUBLIC_KEY && env.VOLTAGENT_SECRET_KEY ? {
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

  return agent;
}

function configureVoltOpsClient(env: typeof worker.Env): void {
  if (!env.VOLTAGENT_PUBLIC_KEY || !env.VOLTAGENT_SECRET_KEY) {
    return;
  }

  const registry = AgentRegistry.getInstance();
  registry.setGlobalVoltOpsClient(
    createVoltOpsClient({
      publicKey: env.VOLTAGENT_PUBLIC_KEY as string,
      secretKey: env.VOLTAGENT_SECRET_KEY as string,
    }),
  );
}

function resolveSystemPrompt(
  modeConfig: ModeConfig,
  chatDoc: ChatRuntimeDoc | null,
  workflowDoc: WorkflowRuntimeDoc | null,
): string {
  if (modeConfig.mode === "chat") {
    if (!chatDoc) {
      throw new Error("Agent not initialized: missing chat context");
    }

    return CHAT_SYSTEM_PROMPT(chatDoc);
  }

  if (!workflowDoc) {
    throw new Error("Agent not initialized: missing workflow context");
  }

  return WORKFLOW_SYSTEM_PROMPT(workflowDoc, modeConfig.triggerPayload);
}

async function createSubagents({
  model,
  reasoningEffort,
  modeConfig,
  workflowDoc,
  convexAdapter,
  daytona,
  sandbox,
}: Pick<CreateWorkerPlanAgentArgs, "modeConfig" | "workflowDoc" | "convexAdapter" | "daytona" | "sandbox"> & {
  model: string;
  reasoningEffort: AgentArgs["reasoningEffort"];
}): Promise<Agent[]> {
  const toolkitPromises: Promise<Toolkit>[] = [];
  if (modeConfig.mode === "workflow" && convexAdapter) {
    toolkitPromises.push(createWorkflowToolkit(modeConfig.workflow, convexAdapter));
  }
  if (sandbox && daytona) {
    toolkitPromises.push(createDaytonaToolkit(daytona, sandbox));
  }

  const extraToolkits: Toolkit[] = modeConfig.mode === "workflow" && convexAdapter && workflowDoc
    ? [createWorkflowActionToolkit(workflowDoc.allowedActions, convexAdapter)]
    : [];

  const toolkits = [...(await Promise.all(toolkitPromises)), ...extraToolkits];
  return toolkits.map((toolkit) => new Agent({
    name: toolkit.name,
    purpose: toolkit.description,
    model: createAiClient(model, reasoningEffort),
    instructions: toolkit.instructions ?? "",
    tools: toolkit.tools,
  }));
}
