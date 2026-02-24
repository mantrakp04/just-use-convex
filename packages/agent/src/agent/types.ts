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
    z.array(z.enum(["text", "file", "image"])),
  ),
  tokenConfig: jsonPreprocess(z.custom<TokenConfig>()),
  modeConfig: jsonPreprocess(z.custom<ModeConfig>()),
  steerQueueState: z.custom<SteerQueueState>().optional(),
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

export const steerQueueTargetSchema = z.enum(["live", "post_finish"]);
export type SteerQueueTarget = z.infer<typeof steerQueueTargetSchema>;

export const steerQueueStatusSchema = z.enum(["queued", "injecting", "done", "failed"]);
export type SteerQueueStatus = z.infer<typeof steerQueueStatusSchema>;

export const steerQueueItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  source: steerQueueTargetSchema,
  status: steerQueueStatusSchema,
  createdAt: z.number(),
  error: z.string().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
});
export type SteerQueueItem = z.infer<typeof steerQueueItemSchema>;

export const steerQueueStateSchema = z.object({
  liveSteerQueue: z.array(steerQueueItemSchema),
  postFinishQueue: z.array(steerQueueItemSchema),
  isRunActive: z.boolean(),
  isLiveFlushing: z.boolean(),
  isPostFlushing: z.boolean(),
  activeRunId: z.string().nullable(),
  version: z.number(),
});
export type SteerQueueState = z.infer<typeof steerQueueStateSchema>;

export const steerQueueModeSchema = z.enum(["auto", "live", "post_finish"]);
export type SteerQueueMode = z.infer<typeof steerQueueModeSchema>;

export const steerQueueInputSchema = z.object({
  directive: z.string().optional(),
  text: z.string().optional(),
  content: z.string().optional(),
  directives: z.array(z.string()).optional(),
  mode: steerQueueModeSchema.optional(),
  queue: steerQueueTargetSchema.optional(),
});
export type SteerQueueInput = z.infer<typeof steerQueueInputSchema>;
