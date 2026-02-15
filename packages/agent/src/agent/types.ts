import type { TokenConfig, ConvexAdapter } from "@just-use-convex/backend/convex/lib/convexAdapter";
import type { Doc } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { Daytona, Sandbox } from "@daytonaio/sdk";
import type { BackgroundTaskStore, TruncatedOutputStore } from "../tools/utils/wrapper";
import type { worker } from "../../alchemy.run";

export type AgentArgs = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  inputModalities?: string[];
  tokenConfig?: TokenConfig;
};

export type AgentEnv = typeof worker.Env;

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
