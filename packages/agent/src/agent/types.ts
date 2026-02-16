import type { TokenConfig } from "@just-use-convex/backend/convex/lib/convexAdapter";
import type { Doc } from "@just-use-convex/backend/convex/_generated/dataModel";

export type AgentArgs = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  inputModalities?: string[];
  tokenConfig?: TokenConfig;
  modeConfig?: ModeConfig;
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
