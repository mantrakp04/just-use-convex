import type { z } from "zod";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import type { Doc as BetterAuthDoc } from "../betterAuth/_generated/dataModel";
import type { zMutationCtx, zQueryCtx } from "../functions";
import { components } from "../_generated/api";
import { internal } from "../_generated/api";
import * as types from "./types";
import { triggerSchema as TriggerSchema } from "../tables/workflows";
import { isMemberRole } from "../shared/auth";
import { withInvalidCursorRetry } from "../shared/pagination";
import { buildPatchData } from "../shared/patch";
import {
  assertOrganizationAccess,
  assertPermission,
  assertScopedPermission,
} from "../shared/auth";

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW QUERIES
// ═══════════════════════════════════════════════════════════════════

async function runWorkflowsQuery(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  return ctx.table("workflows", "organizationId_memberId", (q) => q
    .eq("organizationId", ctx.identity.activeOrganizationId)
    .eq("memberId", ctx.identity.memberId)
  )
    .order("desc")
    .paginate(args.paginationOpts);
}

export async function ListWorkflows(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["read"] },
    "You are not authorized to view workflows"
  );

  const workflows = await withInvalidCursorRetry(
    args,
    (nextArgs) => runWorkflowsQuery(ctx, nextArgs),
    (nextArgs) => ({ ...nextArgs, paginationOpts: { ...nextArgs.paginationOpts, cursor: null } })
  );

  const workflowsWithSandbox = await Promise.all(
    workflows.page.map(async (w) => ({
      ...w.doc(),
      sandbox: await w.edge("sandbox"),
    }))
  );

  return {
    ...workflows,
    page: workflowsWithSandbox,
  };
}

export async function GetWorkflow(ctx: zQueryCtx, args: z.infer<typeof types.GetArgs>) {
  const workflow = await ctx.table("workflows").getX(args._id);
  assertOrganizationAccess(
    workflow.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to view this workflow"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    workflow.memberId,
    { workflow: ["read"] },
    { workflow: ["readAny"] },
    "You are not authorized to view this workflow",
    "You are not authorized to view this workflow"
  );
  const sandbox = await workflow.edge("sandbox");
  return { ...workflow.doc(), sandbox };
}

export async function GetWorkflowForExecution(ctx: zQueryCtx, args: z.infer<typeof types.GetForExecutionArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["read"] },
    "You are not authorized to view this workflow"
  );

  const workflow = await ctx.table("workflows").getX(args._id);
  assertOrganizationAccess(
    workflow.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to view this workflow"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    workflow.memberId,
    { workflow: ["read"] },
    { workflow: ["readAny"] },
    "You are not authorized to view this workflow",
    "You are not authorized to view this workflow"
  );
  const sandbox = await workflow.edge("sandbox");
  return { ...workflow.doc(), sandbox };
}

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW MUTATIONS
// ═══════════════════════════════════════════════════════════════════

export async function CreateWorkflow(ctx: zMutationCtx, args: z.infer<typeof types.CreateArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["create"] },
    "You are not authorized to create workflows"
  );

  const now = Date.now();

  // Validate sandboxId if provided
  if (args.data.sandboxId) {
    const sandbox = await ctx.table("sandboxes").getX(args.data.sandboxId);
    if (sandbox.organizationId !== ctx.identity.activeOrganizationId) {
      throw new Error("Sandbox does not belong to your organization");
    }
    if (sandbox.userId !== ctx.identity.userId) {
      throw new Error("Sandbox does not belong to you");
    }
  }

  // If webhook trigger, generate a secret
  let trigger = args.data.trigger;
  if (trigger.type === "webhook" && !trigger.secret) {
    trigger = { ...trigger, secret: generateWebhookSecret() };
  }

  const workflow = await ctx.table("workflows").insert({
    name: args.data.name,
    triggerType: trigger.type,
    trigger: JSON.stringify(trigger),
    instructions: args.data.instructions,
    allowedActions: args.data.allowedActions,
    model: args.data.model,
    inputModalities: args.data.inputModalities,
    sandboxId: args.data.sandboxId,
    enabled: false,
    organizationId: ctx.identity.activeOrganizationId,
    memberId: ctx.identity.memberId,
    updatedAt: now,
  });
  return workflow;
}

export async function UpdateWorkflow(ctx: zMutationCtx, args: z.infer<typeof types.UpdateArgs>) {
  const workflow = await ctx.table("workflows").getX(args._id);
  assertOrganizationAccess(
    workflow.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to update this workflow"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    workflow.memberId,
    { workflow: ["update"] },
    { workflow: ["updateAny"] },
    "You are not authorized to update this workflow",
    "You are not authorized to update this workflow"
  );

  // Validate sandboxId if being set (null means unset)
  if (args.patch.sandboxId) {
    const sandbox = await ctx.table("sandboxes").getX(args.patch.sandboxId);
    if (sandbox.organizationId !== ctx.identity.activeOrganizationId) {
      throw new Error("Sandbox does not belong to your organization");
    }
    if (sandbox.userId !== ctx.identity.userId) {
      throw new Error("Sandbox does not belong to you");
    }
  }

  const patchData = buildPatchData(args.patch, {
    trigger: (value) => ({
      trigger: JSON.stringify(value),
      triggerType: (value as z.infer<typeof TriggerSchema>).type,
    }),
  });

  const now = Date.now();
  await workflow.patch({
    ...patchData,
    updatedAt: now,
  });

  const nextTriggerType = args.patch.trigger?.type ?? workflow.triggerType;
  const nextEnabled = args.patch.enabled ?? workflow.enabled;
  if (nextEnabled && nextTriggerType === "schedule") {
    await ctx.scheduler.runAfter(0, internal.workflows.scheduler.scheduleNext, {
      workflowId: workflow._id,
      fromTimestamp: now,
    });
  }

  return workflow;
}

export async function DeleteWorkflow(ctx: zMutationCtx, args: z.infer<typeof types.DeleteArgs>) {
  const workflow = await ctx.table("workflows").getX(args._id);
  assertOrganizationAccess(
    workflow.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to delete this workflow"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    workflow.memberId,
    { workflow: ["delete"] },
    { workflow: ["deleteAny"] },
    "You are not authorized to delete this workflow",
    "You are not authorized to delete this workflow"
  );

  // Let Convex Ents cascade deletion through the required executions edge.
  await workflow.delete();
  return true;
}

export async function ToggleWorkflow(ctx: zMutationCtx, args: z.infer<typeof types.ToggleArgs>) {
  const workflow = await ctx.table("workflows").getX(args._id);
  assertOrganizationAccess(
    workflow.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to update this workflow"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    workflow.memberId,
    { workflow: ["update"] },
    { workflow: ["updateAny"] },
    "You are not authorized to update this workflow",
    "You are not authorized to update this workflow"
  );

  const now = Date.now();
  await workflow.patch({ enabled: args.enabled, updatedAt: now });

  if (args.enabled && workflow.triggerType === "schedule") {
    await ctx.scheduler.runAfter(0, internal.workflows.scheduler.scheduleNext, {
      workflowId: workflow._id,
      fromTimestamp: now,
    });
  }

  return workflow;
}

// ═══════════════════════════════════════════════════════════════════
// EXECUTION QUERIES
// ═══════════════════════════════════════════════════════════════════

export async function ListExecutions(ctx: zQueryCtx, args: z.infer<typeof types.ListExecutionsArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["read"] },
    "You are not authorized to view workflow executions"
  );

  const workflow = await ctx.table("workflows").getX(args.workflowId);
  assertOrganizationAccess(
    workflow.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to view workflow executions"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    workflow.memberId,
    { workflow: ["read"] },
    { workflow: ["readAny"] },
    "You are not authorized to view workflow executions",
    "You are not authorized to view workflow executions"
  );

  const executions = await withInvalidCursorRetry(
    args,
    (nextArgs) => ctx.db
      .query("workflowExecutions")
      .withIndex("workflowId_startedAt", (q) => q.eq("workflowId", nextArgs.workflowId))
      .order("desc")
      .paginate(nextArgs.paginationOpts),
    (nextArgs) => ({ ...nextArgs, paginationOpts: { ...nextArgs.paginationOpts, cursor: null } })
  );

  return executions;
}

export async function GetExecution(ctx: zQueryCtx, args: z.infer<typeof types.GetExecutionArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["read"] },
    "You are not authorized to view this execution"
  );

  const execution = await ctx.table("workflowExecutions").getX(args._id);
  assertOrganizationAccess(
    execution.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to view this execution"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    execution.memberId,
    { workflow: ["read"] },
    { workflow: ["readAny"] },
    "You are not authorized to view this execution",
    "You are not authorized to view this execution"
  );
  const steps = await listWorkflowStepsByExecutionId(ctx, execution._id);
  return { ...execution.doc(), steps };
}

// ═══════════════════════════════════════════════════════════════════
// EXECUTION MUTATIONS (internal / external)
// ═══════════════════════════════════════════════════════════════════

export async function CreateExecution(ctx: zMutationCtx, args: z.infer<typeof types.CreateExecutionArgs>) {
  const workflow = await ctx.table("workflows").getX(args.workflowId);
  const now = Date.now();
  const requiredActions = dedupeAllowedActions(workflow.allowedActions);

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

  return {
    executionId: execution,
    namespace: `workflow-${workflow._id}`,
    model: workflow.model,
    inputModalities: workflow.inputModalities,
  };
}

export async function UpdateExecutionStatus(ctx: zMutationCtx, args: z.infer<typeof types.UpdateExecutionStatusArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["update"] },
    "You are not authorized to update this execution"
  );

  const execution = await ctx.table("workflowExecutions").getX(args.executionId);
  assertOrganizationAccess(
    execution.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to update this execution"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    execution.memberId,
    { workflow: ["update"] },
    { workflow: ["updateAny"] },
    "You are not authorized to update this execution",
    "You are not authorized to update this execution"
  );

  const wasTerminal = isTerminalExecutionStatus(execution.status);
  const isTerminal = isTerminalExecutionStatus(args.status);
  const patchData: Record<string, unknown> = { status: args.status };
  if (args.agentOutput !== undefined) patchData.agentOutput = args.agentOutput;
  if (args.toolCalls !== undefined) patchData.toolCalls = args.toolCalls;
  if (args.error !== undefined) patchData.error = args.error;
  if (args.completedAt !== undefined) patchData.completedAt = args.completedAt;

  await execution.patch(patchData);

  if (!wasTerminal && isTerminal) {
    await ctx.scheduler.runAfter(0, internal.workflows.scheduler.scheduleNext, {
      workflowId: execution.workflowId,
      fromTimestamp: args.completedAt ?? Date.now(),
    });
  }

  return execution;
}

export async function RetryExecution(ctx: zMutationCtx, args: z.infer<typeof types.RetryExecutionArgs>) {
  const execution = await ctx.table("workflowExecutions").getX(args.executionId);
  assertOrganizationAccess(
    execution.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to retry this execution"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    execution.memberId,
    { workflow: ["execute"] },
    { workflow: ["execute"] },
    "You are not authorized to retry this execution",
    "You are not authorized to retry this execution"
  );

  if (execution.status !== "failed") {
    throw new Error(`Only failed workflow executions can be retried (current status: ${execution.status})`);
  }

  await ctx.scheduler.runAfter(0, internal.workflows.dispatch.dispatchWorkflow, {
    workflowId: execution.workflowId,
    triggerPayload: execution.triggerPayload,
    userId: ctx.identity.userId,
    activeOrganizationId: ctx.identity.activeOrganizationId,
    organizationRole: ctx.identity.organizationRole,
    memberId: ctx.identity.memberId,
    activeTeamId: ctx.identity.activeTeamId,
  });

  return { ok: true };
}

export async function RecordWorkflowStepOutcome(
  ctx: zMutationCtx,
  args: z.infer<typeof types.RecordWorkflowStepOutcomeArgs>
) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["execute"] },
    "You are not authorized to record workflow step outcomes"
  );

  const execution = await ctx.table("workflowExecutions").getX(args.executionId);
  assertOrganizationAccess(
    execution.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to record workflow step outcomes"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    execution.memberId,
    { workflow: ["execute"] },
    { workflow: ["execute"] },
    "You are not authorized to record workflow step outcomes",
    "You are not authorized to record workflow step outcomes"
  );

  const step = await ctx.db
    .query("workflowSteps")
    .withIndex("workflowExecutionId_action", (q) => q
      .eq("workflowExecutionId", args.executionId)
      .eq("action", args.action)
    )
    .unique();

  if (!step) {
    throw new Error(`Workflow step not found for action "${args.action}"`);
  }

  const now = Date.now();
  const nextStatus =
    step.status === "success" || args.outcome === "success"
      ? "success"
      : "failure";
  await ctx.db.patch(step._id, {
    status: nextStatus,
    callCount: step.callCount + 1,
    successCount: step.successCount + (args.outcome === "success" ? 1 : 0),
    failureCount: step.failureCount + (args.outcome === "failure" ? 1 : 0),
    lastError: nextStatus === "failure" ? args.error : undefined,
    failureReason: nextStatus === "failure" ? "tool_error" : undefined,
    firstCalledAt: step.firstCalledAt ?? now,
    lastCalledAt: now,
    updatedAt: now,
  });

  const summary = await recomputeWorkflowStepSummary(ctx, execution._id);
  await execution.patch(summary);

  return { ok: true, ...summary };
}

export async function FinalizeWorkflowSteps(
  ctx: zMutationCtx,
  args: z.infer<typeof types.FinalizeWorkflowStepsArgs>
) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["execute"] },
    "You are not authorized to finalize workflow steps"
  );

  const execution = await ctx.table("workflowExecutions").getX(args.executionId);
  assertOrganizationAccess(
    execution.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to finalize workflow steps"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    execution.memberId,
    { workflow: ["execute"] },
    { workflow: ["execute"] },
    "You are not authorized to finalize workflow steps",
    "You are not authorized to finalize workflow steps"
  );

  const now = Date.now();
  const steps = await listWorkflowStepsByExecutionId(ctx, args.executionId);
  const pendingSteps = steps.filter((step) => step.status === "pending");

  await Promise.all(pendingSteps.map((step) => ctx.db.patch(step._id, {
    status: "failure",
    failureReason: "not_called",
    updatedAt: now,
  })));

  const summary = await recomputeWorkflowStepSummary(ctx, execution._id);
  await execution.patch(summary);

  return { ok: true, updatedSteps: pendingSteps.length, ...summary };
}

// ═══════════════════════════════════════════════════════════════════
// INTERNAL HELPERS (scheduler, triggers, webhook, dispatch)
// ═══════════════════════════════════════════════════════════════════

type RunQueryCtx = Pick<
  import("convex/server").GenericActionCtx<DataModel>,
  "runQuery"
>;

export async function resolveWorkflowMemberIdentity(
  ctx: RunQueryCtx,
  organizationId: string,
  memberId: string,
): Promise<types.WorkflowMember | null> {
  const member: Pick<BetterAuthDoc<"member">, "role" | "userId"> | null = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "member",
    where: [
      { field: "_id", operator: "eq", value: memberId },
      { field: "organizationId", operator: "eq", value: organizationId },
    ],
    select: ["role", "userId"],
  });

  const role = member?.role;
  const userId = member?.userId;
  if (typeof role !== "string" || !isMemberRole(role)) return null;
  if (typeof userId !== "string" || userId.length === 0) return null;

  return { role, userId };
}

export function buildDispatchArgs(
  workflow: Pick<Doc<"workflows">, "_id" | "organizationId" | "memberId">,
  memberIdentity: types.WorkflowMember,
  triggerPayload: string,
  options?: { activeTeamId?: string },
) {
  return {
    workflowId: workflow._id,
    triggerPayload,
    userId: memberIdentity.userId,
    activeOrganizationId: workflow.organizationId,
    organizationRole: memberIdentity.role,
    memberId: workflow.memberId,
    activeTeamId: options?.activeTeamId,
  };
}

type FailExecutionCtx = Pick<GenericMutationCtx<DataModel>, "db" | "scheduler">;

export async function FailExecution(
  ctx: FailExecutionCtx,
  args: { executionId: z.infer<typeof types.WorkflowExecution>["_id"]; error: string },
) {
  const execution = await ctx.db.get(args.executionId);
  if (!execution) return;

  const wasTerminal = isTerminalExecutionStatus(execution.status);
  const now = Date.now();
  await ctx.db.patch(args.executionId, {
    status: "failed",
    error: args.error,
    completedAt: now,
  });

  if (!wasTerminal) {
    await ctx.scheduler.runAfter(0, internal.workflows.scheduler.scheduleNext, {
      workflowId: execution.workflowId,
      fromTimestamp: now,
    });
  }
}

export async function GetEnabledWorkflow(
  ctx: Pick<GenericQueryCtx<DataModel>, "db">,
  args: { workflowId: z.infer<typeof types.WorkflowWithSystemFields>["_id"] },
): Promise<Doc<"workflows"> | null> {
  const workflow = await ctx.db.get(args.workflowId);
  if (!workflow || !workflow.enabled) return null;
  return workflow;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isTerminalExecutionStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function dedupeAllowedActions(actions: z.infer<typeof types.Workflow>["allowedActions"]) {
  return [...new Set(actions)];
}

async function listWorkflowStepsByExecutionId(
  ctx: Pick<zQueryCtx | zMutationCtx, "db">,
  executionId: z.infer<typeof types.WorkflowExecution>["_id"]
) {
  return await ctx.db
    .query("workflowSteps")
    .withIndex("workflowExecutionId_updatedAt", (q) => q.eq("workflowExecutionId", executionId))
    .collect();
}

async function recomputeWorkflowStepSummary(
  ctx: Pick<zMutationCtx, "db">,
  executionId: z.infer<typeof types.WorkflowExecution>["_id"]
) {
  const steps = await listWorkflowStepsByExecutionId(ctx, executionId);
  const requiredActionsTotal = steps.length;
  const requiredActionsSuccess = steps.filter((step) => step.status === "success").length;
  const requiredActionsFailure = steps.filter((step) => step.status === "failure").length;

  const requiredActionsStatus = deriveRequiredActionsStatus({
    requiredActionsTotal,
    requiredActionsSuccess,
    requiredActionsFailure,
  });

  return {
    requiredActionsTotal,
    requiredActionsSuccess,
    requiredActionsFailure,
    requiredActionsStatus,
  };
}

function deriveRequiredActionsStatus(summary: {
  requiredActionsTotal: number;
  requiredActionsSuccess: number;
  requiredActionsFailure: number;
}) {
  if (summary.requiredActionsFailure > 0) {
    return "failure" as const;
  }
  if (summary.requiredActionsTotal === 0 || summary.requiredActionsSuccess === summary.requiredActionsTotal) {
    return "success" as const;
  }
  return "pending" as const;
}
