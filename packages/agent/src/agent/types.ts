import { z } from "zod";
import type { Doc, Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { TokenConfig } from "@just-use-convex/backend/convex/lib/convexAdapter";

export type AgentArgs = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  inputModalities?: string[];
  tokenConfig?: TokenConfig;
  modeConfig: ModeConfig;
};

export interface ChatModeConfig {
  mode: "chat";
  chat: Id<"chats">;
}

export interface WorkflowModeConfig {
  mode: "workflow";
  workflow: Id<"workflows">;
  executionId: Id<"workflowExecutions">;
  triggerPayload: string;
}

export type ModeConfig = ChatModeConfig | WorkflowModeConfig;

export type ChatRuntimeDoc = Doc<"chats"> & { sandbox?: Doc<"sandboxes"> | null };
export type WorkflowRuntimeDoc = Doc<"workflows"> & { sandbox?: Doc<"sandboxes"> | null };

export const executeWorkflowRequestSchema = z.object({
  workflow: z.string(),
  executionId: z.string(),
  triggerPayload: z.string(),
});

export type ExecuteWorkflowRequest = z.infer<typeof executeWorkflowRequestSchema>;

export type CallableFunctionInstance = object;
export type CallableServiceMethodsMap = Record<string, (...args: unknown[]) => unknown>;
export type CallableServiceMethod = keyof CallableServiceMethodsMap;
