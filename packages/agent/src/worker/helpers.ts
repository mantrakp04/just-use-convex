import { type UIMessage } from "ai";
import {
  parseTokenFromUrl,
  type TokenConfig,
} from "@just-use-convex/backend/convex/lib/convexAdapter";
import type { AgentArgs } from "../agent/types";

export type InitArgsOverrides = Pick<AgentArgs, "tokenConfig" | "modeConfig">;

export function buildInitArgsFromUrl(url: URL, overrides: InitArgsOverrides): AgentArgs {
  const inputModalitiesRaw = url.searchParams.get("inputModalities");

  return {
    model: url.searchParams.get("model") ?? undefined,
    reasoningEffort: url.searchParams.get("reasoningEffort") as "low" | "medium" | "high" | undefined,
    inputModalities: inputModalitiesRaw ? inputModalitiesRaw.split(",") : undefined,
    tokenConfig: overrides.tokenConfig ?? parseTokenFromUrl(url) ?? undefined,
    modeConfig: overrides.modeConfig,
  };
}

export function buildWorkflowExecutionMessages(): UIMessage[] {
  return [{
    id: `workflow-exec-${crypto.randomUUID()}`,
    role: "user",
    parts: [{ type: "text", text: "Execute this workflow now." }],
  }];
}

export function parseTokenFromRequest(request: Request): TokenConfig | null {
  const url = new URL(request.url);
  const tokenConfig = parseTokenFromUrl(url);
  if (tokenConfig) {
    return tokenConfig;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const externalToken = authorization.slice(7).trim();
  if (!externalToken) {
    return null;
  }

  const memberId = request.headers.get("x-member-id");
  const userId = request.headers.get("x-user-id");
  if (memberId) {
    return {
      type: "ext",
      externalToken,
      identifier: { type: "memberId", value: memberId },
    };
  }

  if (userId) {
    return {
      type: "ext",
      externalToken,
      identifier: { type: "userId", value: userId },
    };
  }

  return null;
}
