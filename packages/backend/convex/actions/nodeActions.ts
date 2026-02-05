"use node";

import { zAction } from "../functions";
import * as types from "./types";
import { internal } from "../_generated/api";

const agentUrl = process.env.AGENT_URL ?? "http://localhost:1337";

export const startWorkflowRun = zAction({
  args: types.StartWorkflowRunArgs,
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.actions.index.linkChatToWorkflowRun, {
      ...ctx.identity,
      workflowRunId: args.workflowRunId,
      chatId: args.chatId,
    });

    const url = new URL(`${agentUrl}/agents/agent-worker/${args.workflowRunId}`);
    url.searchParams.set("runId", args.workflowRunId);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workflowRunId: args.workflowRunId,
        chatId: args.chatId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agent worker connection failed: ${response.status} ${errorText}`);
    }

    return { ok: true };
  },
});
