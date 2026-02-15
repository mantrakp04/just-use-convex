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
import type { Daytona, Sandbox } from "@daytonaio/sdk";
import type { worker } from "../../alchemy.run";
import type { Doc } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { ConvexAdapter } from "@just-use-convex/backend/convex/lib/convexAdapter";
import { createAiClient } from "./client";
import { CHAT_SYSTEM_PROMPT, WORKFLOW_SYSTEM_PROMPT, TASK_PROMPT } from "./prompt";
import { createAskUserToolkit } from "../tools/ask-user";
import { createWebSearchToolkit } from "../tools/websearch";
import { createDaytonaToolkit } from "../tools/sandbox";
import {
  type BackgroundTaskStore,
  type TruncatedOutputStore,
  patchToolWithBackgroundSupport,
  createBackgroundTaskToolkit,
} from "../tools/utils/wrapper";
import { createWorkflowActionToolkit } from "../tools/workflow-actions";
import { env as agentDefaults } from "@just-use-convex/env/agent";

// ─── Types ────────────────────────────────────────────────────

type AgentEnv = typeof worker.Env;

export interface AgentDeps {
  env: AgentEnv;
  model: string;
  reasoningEffort?: "low" | "medium" | "high";
  daytona: Daytona | null;
  sandbox: Sandbox | null;
  backgroundTaskStore: BackgroundTaskStore;
  truncatedOutputStore: TruncatedOutputStore;
}

export interface ChatModeConfig {
  mode: "chat";
  chat: Doc<"chats"> & { sandbox?: Doc<"sandboxes"> | null };
}

export interface WorkflowModeConfig {
  mode: "workflow";
  workflow: Doc<"workflows"> & { sandbox?: Doc<"sandboxes"> | null };
  triggerPayload: string;
  convexAdapter: ConvexAdapter;
}

export type ModeConfig = ChatModeConfig | WorkflowModeConfig;

// ─── VoltAgent Registry ───────────────────────────────────────

export function initVoltAgentRegistry(
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

// ─── Agent Factory ────────────────────────────────────────────

export async function buildPlanAgent(
  deps: AgentDeps,
  config: ModeConfig,
): Promise<PlanAgent> {
  const { env, model, reasoningEffort, daytona, sandbox, backgroundTaskStore, truncatedOutputStore } = deps;

  // Build subagents from sandbox/daytona toolkits
  const subagents = await buildSubagents(model, reasoningEffort, daytona, sandbox);

  // Build toolkits: shared + mode-specific
  const toolkits: Toolkit[] = [
    createWebSearchToolkit(),
    createAskUserToolkit(),
  ];

  if (config.mode === "workflow") {
    toolkits.push(
      createWorkflowActionToolkit(config.workflow.allowedActions, config.convexAdapter),
    );
  }

  // System prompt
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

  // Planning toolkit references itself, must be added post-creation
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

// ─── Model Patching ───────────────────────────────────────────

export function patchAgentModel(
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

// ─── Background Task Patching ─────────────────────────────────

export function patchBackgroundTasks(
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

// ─── Helpers ──────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────

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
