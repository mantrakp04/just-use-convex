import { z } from "zod";
import type { TokenConfig } from "@just-use-convex/backend/convex/lib/convexAdapter";
import type { Doc } from "@just-use-convex/backend/convex/_generated/dataModel";

export const workflowInitPayloadSchema = z.object({
  workflowId: z.string(),
  executionId: z.string(),
  triggerPayload: z.string(),
});

export type WorkflowInitPayload = z.infer<typeof workflowInitPayloadSchema>;

export type AgentArgs = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  inputModalities?: string[];
  tokenConfig?: TokenConfig;
  modeConfig?: ModeConfig;
  workflowInit?: WorkflowInitPayload;
};

export interface ChatModeConfig {
  mode: "chat";
  chat: Doc<"chats"> & { sandbox?: Doc<"sandboxes"> | null };
}

export interface WorkflowModeConfig {
  mode: "workflow";
  workflow: Doc<"workflows"> & { sandbox?: Doc<"sandboxes"> | null };
  triggerPayload: string;
}

export type ModeConfig = ChatModeConfig | WorkflowModeConfig;
