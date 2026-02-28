import { agentArgsSchema, type AgentArgs } from "../agent/types";
import { env } from "@just-use-convex/env/agent";

export function buildInitArgsFromUrl(url: URL): AgentArgs {
  const raw: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
  const args = agentArgsSchema.parse(raw);
  if (args.tokenConfig.type === "ext" && args.tokenConfig.externalToken !== env.EXTERNAL_TOKEN) {
    throw new Error("Unauthorized");
  }
  return args;
}
