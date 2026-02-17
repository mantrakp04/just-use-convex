import { z } from "zod";
import type { Doc, Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { TokenConfig } from "@just-use-convex/backend/convex/lib/convexAdapter";

export const agentArgsSchema = z.object({
  model: z.string(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  inputModalities: z.array(z.string()),
  tokenConfig: z.custom<TokenConfig>(),
  modeConfig: z.custom<ModeConfig>(),
});

export type AgentArgs = z.infer<typeof agentArgsSchema>;

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

export type CallableFunctionInstance = object;
export type CallableServiceMethodsMap = Record<string, (...args: unknown[]) => unknown>;
export type CallableServiceMethod = keyof CallableServiceMethodsMap;
