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

    try {
      const response = await fetch(`${agentUrl}/agents/agent-worker/${doInstanceName}/executeWorkflow`, {
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

      if (!response.ok) {
        const errorText = await response.text();
        await ctx.runMutation(internal.workflows.internalMutations.failExecution, {
          executionId,
          error: `Dispatch failed: ${response.status} ${errorText}`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.workflows.internalMutations.failExecution, {
        executionId,
        error: `Dispatch error: ${message}`,
      });
    }
  },
});

export const dispatchWorkflowBatch = internalAction({
  args: {
    dispatches: v.array(v.object(dispatchWorkflowArgs)),
  },
  handler: async (ctx, args) => {
    for (const dispatchArgs of args.dispatches) {
      await ctx.runAction(internal.workflows.dispatch.dispatchWorkflow, dispatchArgs);
    }
  },
});
