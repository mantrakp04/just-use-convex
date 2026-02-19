import { type UIMessage } from "ai";
import { agentArgsSchema, type AgentArgs } from "../agent/types";
import type { TokenConfig } from "@just-use-convex/backend/convex/lib/convexAdapter";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { env } from "@just-use-convex/env/agent";

export function buildInitArgsFromUrl(url: URL, fallbackChatId?: Id<"chats">): AgentArgs {
  const raw: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
  raw.model ??= env.DEFAULT_MODEL;
  raw.inputModalities ??= "text";
  raw.tokenConfig ??= buildTokenConfig(url.searchParams.get("token") ?? raw.token);
  raw.modeConfig ??= { mode: "chat", chat: fallbackChatId };
  const args = agentArgsSchema.parse(raw);
  if (args.tokenConfig.type === "ext" && args.tokenConfig.externalToken !== env.EXTERNAL_TOKEN) {
    throw new Error("Unauthorized");
  }
  return args;
}

function buildTokenConfig(value: unknown): TokenConfig {
  const token = typeof value === "string" ? value : null;
  if (!token) throw new Error("Missing token or tokenConfig");
  return { type: "jwt", token };
}

export function buildWorkflowExecutionMessages(): UIMessage[] {
  return [{
    id: `workflow-exec-${crypto.randomUUID()}`,
    role: "user",
    parts: [{ type: "text", text: "Execute this workflow now." }],
  }];
}
