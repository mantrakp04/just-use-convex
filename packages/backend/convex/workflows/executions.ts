import type { z } from "zod";
import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { zMutationCtx, zQueryCtx } from "../functions";
import * as types from "./types";
import { assertPermission } from "../shared/auth";
import { withInvalidCursorRetry } from "../shared/pagination";
import {
  assertWorkflowAccess,
  scheduleDispatch,
  buildDispatchArgs,
  queueScheduleNext,
  type FailExecutionCtx,
} from "./helpers";

// ═══════════════════════════════════════════════════════════════════
// EXECUTION QUERIES
// ═══════════════════════════════════════════════════════════════════

export async function ListExecutions(ctx: zQueryCtx, args: z.infer<typeof types.ListExecutionsArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["read"] },
    "Not authorized to view workflow executions",
  );

  const workflow = await ctx.table("workflows").getX(args.workflowId);
  assertWorkflowAccess(ctx.identity, workflow, "read");

  return withInvalidCursorRetry(
    args,
    (nextArgs) => ctx.db
      .query("workflowExecutions")
      .withIndex("workflowId_startedAt", (q) => q.eq("workflowId", nextArgs.workflowId))
      .order("desc")
      .paginate(nextArgs.paginationOpts),
    (nextArgs) => ({ ...nextArgs, paginationOpts: { ...nextArgs.paginationOpts, cursor: null } }),
  );
}

export async function GetExecution(ctx: zQueryCtx, args: z.infer<typeof types.GetExecutionArgs>) {
  const execution = await ctx.table("workflowExecutions").get(args._id);
  if (!execution) return null;
  assertWorkflowAccess(ctx.identity, execution, "read");

  const steps = await listStepsByExecutionId(ctx, execution._id);
  return { ...execution.doc(), steps };
}

// ═══════════════════════════════════════════════════════════════════
// EXECUTION MUTATIONS
// ═══════════════════════════════════════════════════════════════════

export async function CreateExecution(ctx: zMutationCtx, args: z.infer<typeof types.CreateExecutionArgs>) {
  const workflow = await ctx.table("workflows").getX(args.workflowId);
  const now = Date.now();
  const requiredActions = dedupeActions(workflow.actions);

  const execution = await ctx.table("workflowExecutions").insert({
    workflowId: args.workflowId,
    organizationId: workflow.organizationId,
    memberId: workflow.memberId,
    status: "pending",
    requiredActionsTotal: requiredActions.length,
    requiredActionsSuccess: 0,
    requiredActionsFailure: 0,
    requiredActionsStatus: requiredActions.length === 0 ? "success" : "pending",
    triggerPayload: args.triggerPayload,
    startedAt: now,
  });

  await Promise.all(requiredActions.map((action) => ctx.table("workflowSteps").insert({
    workflowExecutionId: execution,
    action,
    status: "pending",
    callCount: 0,
    successCount: 0,
    failureCount: 0,
    updatedAt: now,
  })));

  const namespace = workflow.isolationMode === "shared"
    ? `workflow-${args.workflowId}`
    : `workflow-${execution}`;

  return {
    executionId: execution,
    namespace,
    model: workflow.model,
    inputModalities: workflow.inputModalities,
  };
}

export async function UpdateExecutionStatus(ctx: zMutationCtx, args: z.infer<typeof types.UpdateExecutionStatusArgs>) {
  const execution = await ctx.table("workflowExecutions").getX(args.executionId);
  assertWorkflowAccess(ctx.identity, execution, "update");

  const wasTerminal = isTerminalStatus(execution.status);
  const patchData: Record<string, unknown> = { status: args.status };
  if (args.agentOutput !== undefined) patchData.agentOutput = args.agentOutput;
  if (args.toolCalls !== undefined) patchData.toolCalls = args.toolCalls;
  if (args.error !== undefined) patchData.error = args.error;
  if (args.completedAt !== undefined) patchData.completedAt = args.completedAt;

  await execution.patch(patchData);

  if (!wasTerminal && isTerminalStatus(args.status)) {
    await queueScheduleNext(ctx, execution.workflowId, args.completedAt ?? Date.now());
  }

  return execution;
}

export async function RetryExecution(ctx: zMutationCtx, args: z.infer<typeof types.RetryExecutionArgs>) {
  const execution = await ctx.table("workflowExecutions").getX(args.executionId);
  assertWorkflowAccess(ctx.identity, execution, "execute");

  if (execution.status !== "failed") {
    throw new Error(`Only failed executions can be retried (current: ${execution.status})`);
  }

  const workflow = await ctx.table("workflows").getX(execution.workflowId);
  await scheduleDispatch(ctx, buildDispatchArgs(
    workflow,
    { role: ctx.identity.organizationRole as import("../shared/auth").MemberRole, userId: ctx.identity.userId },
    execution.triggerPayload ?? "{}",
    { activeTeamId: ctx.identity.activeTeamId },
  ));

  return { ok: true };
}

export async function RecordWorkflowStepOutcome(
  ctx: zMutationCtx,
  args: z.infer<typeof types.RecordWorkflowStepOutcomeArgs>,
) {
  const execution = await ctx.table("workflowExecutions").getX(args.executionId);
  assertWorkflowAccess(ctx.identity, execution, "execute");

  const step = await ctx.db
    .query("workflowSteps")
    .withIndex("workflowExecutionId_action", (q) => q
      .eq("workflowExecutionId", args.executionId)
      .eq("action", args.action),
    )
    .unique();

  if (!step) {
    throw new Error(`Workflow step not found for action "${args.action}"`);
  }

  const now = Date.now();
  const isSuccess = args.outcome === "success";
  const nextStatus = step.status === "success" || isSuccess ? "success" : "failure";

  await ctx.db.patch(step._id, {
    status: nextStatus,
    callCount: step.callCount + 1,
    successCount: step.successCount + (isSuccess ? 1 : 0),
    failureCount: step.failureCount + (isSuccess ? 0 : 1),
    lastError: nextStatus === "failure" ? args.error : undefined,
    failureReason: nextStatus === "failure" ? "tool_error" : undefined,
    firstCalledAt: step.firstCalledAt ?? now,
    lastCalledAt: now,
    updatedAt: now,
  });

  const summary = await recomputeStepSummary(ctx, execution._id);
  await execution.patch(summary);

  return { ok: true, ...summary };
}

export async function FinalizeWorkflowSteps(
  ctx: zMutationCtx,
  args: z.infer<typeof types.FinalizeWorkflowStepsArgs>,
) {
  const execution = await ctx.table("workflowExecutions").getX(args.executionId);
  assertWorkflowAccess(ctx.identity, execution, "execute");

  const now = Date.now();
  const steps = await listStepsByExecutionId(ctx, args.executionId);
  const pendingSteps = steps.filter((s) => s.status === "pending");

  await Promise.all(pendingSteps.map((s) => ctx.db.patch(s._id, {
    status: "failure",
    failureReason: "not_called",
    updatedAt: now,
  })));

  const summary = await recomputeStepSummary(ctx, execution._id);
  await execution.patch(summary);

  return { ok: true, updatedSteps: pendingSteps.length, ...summary };
}

// ═══════════════════════════════════════════════════════════════════
// INTERNAL FUNCTIONS (used by dispatch, scheduler)
// ═══════════════════════════════════════════════════════════════════

export async function FailExecution(
  ctx: FailExecutionCtx,
  args: { executionId: Id<"workflowExecutions">; error: string },
) {
  const execution = await ctx.db.get(args.executionId);
  if (!execution) return;

  const wasTerminal = isTerminalStatus(execution.status);
  const now = Date.now();
  await ctx.db.patch(args.executionId, {
    status: "failed",
    error: args.error,
    completedAt: now,
  });

  if (!wasTerminal) {
    await queueScheduleNext(ctx, execution.workflowId, now);
  }
}

export async function GetEnabledWorkflow(
  ctx: Pick<GenericQueryCtx<DataModel>, "db">,
  args: { workflowId: Id<"workflows"> },
): Promise<Doc<"workflows"> | null> {
  const workflow = await ctx.db.get(args.workflowId);
  if (!workflow || !workflow.enabled) return null;
  return workflow;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function dedupeActions(actions: Doc<"workflows">["actions"]) {
  return [...new Set(actions)];
}

async function listStepsByExecutionId(
  ctx: Pick<zQueryCtx | zMutationCtx, "db">,
  executionId: Id<"workflowExecutions">,
) {
  return ctx.db
    .query("workflowSteps")
    .withIndex("workflowExecutionId_updatedAt", (q) => q.eq("workflowExecutionId", executionId))
    .collect();
}

async function recomputeStepSummary(
  ctx: Pick<zMutationCtx, "db">,
  executionId: Id<"workflowExecutions">,
) {
  const steps = await listStepsByExecutionId(ctx, executionId);
  const total = steps.length;
  const success = steps.filter((s) => s.status === "success").length;
  const failure = steps.filter((s) => s.status === "failure").length;

  const requiredActionsStatus =
    failure > 0 ? "failure" as const
      : (total === 0 || success === total) ? "success" as const
        : "pending" as const;

  return {
    requiredActionsTotal: total,
    requiredActionsSuccess: success,
    requiredActionsFailure: failure,
    requiredActionsStatus,
  };
}
