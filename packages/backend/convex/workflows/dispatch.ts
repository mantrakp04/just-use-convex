"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { env } from "@just-use-convex/env/backend";
import { baseIdentity } from "../functions";

const dispatchWorkflowArgs = {
  workflowId: v.id("workflows"),
  triggerPayload: v.optional(v.string()),
  ...baseIdentity.fields,
};

export const dispatchWorkflow = internalAction({
  args: dispatchWorkflowArgs,
  handler: async (ctx, args) => {
    // 1. Create execution record
    const { executionId, namespace } = await ctx.runMutation(internal.workflows.index.createExecution, {
      workflowId: args.workflowId,
      triggerPayload: args.triggerPayload,
      userId: args.userId,
      activeOrganizationId: args.activeOrganizationId,
      organizationRole: args.organizationRole,
      memberId: args.memberId,
      activeTeamId: args.activeTeamId,
    });

    // 2. POST to CF Worker to execute workflow
    // URL format: /agents/{agentNamespace}/{instanceName}/path
    // agentNamespace = kebab-cased DO binding name ("agent-worker")
    // instanceName = workflow namespace (isolated workflow namespace or latest chat id)
    const agentUrl = env.AGENT_URL;
    const doInstanceName = namespace;

    let response: Response;
    try {
      response = await fetch(`${agentUrl}/agents/agent-worker/${doInstanceName}/executeWorkflow`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.EXTERNAL_TOKEN}`,
          "X-Member-Id": args.memberId,
        },
        body: JSON.stringify({
          executionId,
          workflow: args.workflowId,
          triggerPayload: args.triggerPayload ?? "{}",
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.workflows.internalMutations.failExecution, {
        executionId,
        error: `Dispatch error: ${message}`,
      });
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const message = `Dispatch failed: ${response.status} ${errorText}`;
      await ctx.runMutation(internal.workflows.internalMutations.failExecution, {
        executionId,
        error: message,
      });
      throw new Error(message);
    }
  },
});

export const dispatchWorkflowBatch = internalAction({
  args: {
    dispatches: v.array(v.object(dispatchWorkflowArgs)),
  },
  handler: async (ctx, args) => {
    const results = await Promise.allSettled(
      args.dispatches.map((dispatchArgs) =>
        ctx.runAction(internal.workflows.dispatch.dispatchWorkflow, dispatchArgs)
      ),
    );

    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      console.error(
        `[workflows.dispatchWorkflowBatch] ${failed.length}/${args.dispatches.length} dispatches failed`,
        failed.map((result) => (result as PromiseRejectedResult).reason),
      );
    }
  },
});
