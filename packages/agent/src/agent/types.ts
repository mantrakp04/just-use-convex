import { z } from "zod";
import type { Doc, Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { TokenConfig } from "@just-use-convex/backend/convex/lib/convexAdapter";

const jsonPreprocess = <T>(schema: z.ZodType<T>) =>
  z.preprocess((v) => (typeof v === "string" ? JSON.parse(v) : v), schema);

export const agentArgsSchema = z.object({
  model: z.string(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  inputModalities: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",") : v),
    z.array(z.string()),
  ),
  tokenConfig: jsonPreprocess(z.custom<TokenConfig>()),
  modeConfig: jsonPreprocess(z.custom<ModeConfig>()),
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
