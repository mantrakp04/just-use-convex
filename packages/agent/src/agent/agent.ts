import {
  Agent,
  AgentRegistry,
  PlanAgent,
  Tool,
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
import { normalizeDuration } from "../tools/utils/duration";
import {
  BackgroundTaskStore,
  TruncatedOutputStore,
} from "../tools/utils/wrapper";
import { createDaytonaToolkit } from "../tools/sandbox";
import { createWorkflowActionToolkit } from "../tools/workflow-actions";
import { createWorkflowToolkit } from "../tools/workflows";
import { type Sandbox } from "@daytonaio/sdk";
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
  sandbox,
  backgroundTaskStore,
  truncatedOutputStore,
  waitUntil,
}: CreateWorkerPlanAgentArgs): Promise<PlanAgent> {
  if (modeConfig.mode === "chat" && !chatDoc) {
    throw new Error("Agent not initialized: missing chat context");
  }
  if (modeConfig.mode === "workflow" && (!convexAdapter || !workflowDoc)) {
    throw new Error("Agent not initialized: missing workflow context");
  }

  setWaitUntil(waitUntil);
  configureVoltOpsClient(env);
  const defaultToolTimeoutMs = normalizeDuration(env.MAX_TOOL_DURATION_MS, 600_000);
  const backgroundTaskPollIntervalMs = normalizeDuration(
    env.BACKGROUND_TASK_POLL_INTERVAL_MS,
    3_000,
  );

  const subagents = await createSubagents({
    model: state.model,
    reasoningEffort: state.reasoningEffort,
    modeConfig,
    workflowDoc: modeConfig.mode === "workflow" ? workflowDoc : null,
    convexAdapter,
    sandbox,
  });
  const systemPrompt = resolveSystemPrompt(modeConfig, chatDoc, workflowDoc);

  const agent = new PlanAgent({
    name: modeConfig.mode === "chat" ? "Assistant" : "WorkflowExecutor",
    systemPrompt,
    model: createAiClient(state.model, state.reasoningEffort),
    tools: [
      createBackgroundTaskToolkit(backgroundTaskStore, truncatedOutputStore, {
        defaultTimeoutMs: defaultToolTimeoutMs,
        pollIntervalMs: backgroundTaskPollIntervalMs,
      }),
      ...(modeConfig.mode === "chat" ? [createAskUserToolkit()] : []),
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

  for (const subagent of subagents) {
    agent.addSubAgent(subagent);
  }

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

  return WORKFLOW_SYSTEM_PROMPT(
    workflowDoc,
    modeConfig.executionId,
  );
}

async function createSubagents({
  model,
  reasoningEffort,
  modeConfig,
  workflowDoc,
  convexAdapter,
  sandbox,
}: Pick<CreateWorkerPlanAgentArgs, "modeConfig" | "workflowDoc" | "convexAdapter" | "sandbox"> & {
  model: string;
  reasoningEffort: AgentArgs["reasoningEffort"];
}): Promise<Agent[]> {
  const toolkitPromises: Promise<Toolkit>[] = [];
  if (sandbox) {
    toolkitPromises.push(createDaytonaToolkit(sandbox, convexAdapter));
  }
  toolkitPromises.push(createWebSearchToolkit());
  if (convexAdapter) {
    toolkitPromises.push(createWorkflowToolkit(convexAdapter));
  }

  if (modeConfig.mode === "workflow" && workflowDoc) {
    if (!convexAdapter) {
      throw new Error("No convex adapter");
    }
    toolkitPromises.push(createWorkflowActionToolkit(workflowDoc.actions, {
      executionId: modeConfig.executionId,
      convexAdapter,
    }));
  }

  const toolkits = await Promise.all(toolkitPromises);
  return toolkits.map((toolkit) => new Agent({
    name: toolkit.name,
    purpose: `${toolkit.description}\n\nAvailable tools in this agent: ${toolkit.tools.filter((t): t is Tool => t instanceof Tool).map((t) => t.name).join(", ")}`,
    model: createAiClient(model, reasoningEffort),
    instructions: toolkit.instructions ?? "",
    tools: toolkit.tools,
  }));
}
