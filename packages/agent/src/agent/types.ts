import type { TokenConfig } from "@just-use-convex/backend/convex/lib/convexAdapter";

export type AgentArgs = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  inputModalities?: string[];
  tokenConfig?: TokenConfig;
};
