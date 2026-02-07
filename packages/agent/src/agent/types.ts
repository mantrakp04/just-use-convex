import type { TokenConfig } from "@just-use-convex/backend/convex/lib/convexAdapter";

export type ChatState = {
  model: string;
  reasoningEffort?: "low" | "medium" | "high";
  inputModalities?: string[];
};

export type InitArgs = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  inputModalities?: string[];
  tokenConfig?: TokenConfig;
};
