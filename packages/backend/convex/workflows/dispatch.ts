"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { env } from "@just-use-convex/env/backend";
import { baseIdentity } from "../functions";
import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";

const dispatchWorkflowArgs = {
  workflowId: v.id("workflows"),
  triggerPayload: v.optional(v.string()),
  ...baseIdentity.fields,
};

export const dispatchWorkflow = internalAction({
  args: dispatchWorkflowArgs,
  handler: async (ctx, args) => {
    // 1. Create execution record
    const { executionId, namespace, model, inputModalities } = await ctx.runMutation(internal.workflows.index.createExecution, {
      workflowId: args.workflowId,
      triggerPayload: args.triggerPayload,
      userId: args.userId,
      activeOrganizationId: args.activeOrganizationId,
      organizationRole: args.organizationRole,
      memberId: args.memberId,
      activeTeamId: args.activeTeamId,
    });

    // 2. POST to CF Worker to execute workflow
    // URL format: /agents/{agentNamespace}/{instanceName}/path?params
    // agentNamespace = kebab-cased DO binding name ("agent-worker")
    // instanceName = workflow namespace (isolated workflow namespace or latest chat id)
    const agentUrl = env.AGENT_URL;
    const doInstanceName = namespace;
    const searchParams = buildDispatchSearchParams({
      model,
      inputModalities,
      memberId: args.memberId,
      workflowId: args.workflowId,
      executionId,
      triggerPayload: args.triggerPayload,
    });

    let response: Response;
    try {
      response = await fetch(
        `${agentUrl}/agents/agent-worker/${doInstanceName}/executeWorkflow?${searchParams}`,
        { method: "POST" },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markDispatchFailure(ctx, executionId, `Dispatch error: ${message}`);
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const message = `Dispatch failed: ${response.status} ${errorText}`;
      await markDispatchFailure(ctx, executionId, message);
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

function buildDispatchSearchParams(args: {
  model?: string;
  inputModalities?: string[];
  memberId: string;
  workflowId: string;
  executionId: string;
  triggerPayload?: string;
}) {
  const resolvedModel = args.model?.trim() ? args.model : "openai/gpt-5.2-chat";
  const resolvedInputModalities = args.inputModalities && args.inputModalities.length > 0
    ? args.inputModalities
    : ["text"];

  return new URLSearchParams({
    model: resolvedModel,
    inputModalities: resolvedInputModalities.join(","),
    tokenConfig: JSON.stringify({
      type: "ext",
      externalToken: env.EXTERNAL_TOKEN,
      identifier: { type: "memberId", value: args.memberId },
    }),
    modeConfig: JSON.stringify({
      mode: "workflow",
      workflow: args.workflowId,
      executionId: args.executionId,
      triggerPayload: args.triggerPayload ?? "{}",
    }),
  });
}

async function markDispatchFailure(
  ctx: Pick<GenericActionCtx<DataModel>, "runMutation">,
  executionId: Id<"workflowExecutions">,
  error: string,
) {
  await ctx.runMutation(internal.workflows.index.failExecution, {
    executionId,
    error,
  });
}
