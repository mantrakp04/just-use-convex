import type { z } from "zod";
import type { zMutationCtx, zQueryCtx } from "../functions";
import type { Id } from "../_generated/dataModel";
import * as types from "./types";
import { withInvalidCursorRetry } from "../shared/pagination";
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

// Used by agent (external query) — no scoped permission, just org check
export async function GetWorkflowForExecution(ctx: zQueryCtx, args: z.infer<typeof types.GetForExecutionArgs>) {
  const workflow = await ctx.table("workflows").getX(args._id);
  assertOrganizationAccess(
    workflow.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to execute this workflow"
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

  // Validate sandboxId if being updated
  if (args.patch.sandboxId) {
    const sandbox = await ctx.table("sandboxes").getX(args.patch.sandboxId);
    if (sandbox.organizationId !== ctx.identity.activeOrganizationId) {
      throw new Error("Sandbox does not belong to your organization");
    }
    if (sandbox.userId !== ctx.identity.userId) {
      throw new Error("Sandbox does not belong to you");
    }
  }

  const patchData: Record<string, unknown> = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(args.patch)) {
    if (value !== undefined) {
      if (key === "trigger") {
        patchData[key] = JSON.stringify(value);
        patchData.triggerType = (value as z.infer<typeof types.CreateArgs>["data"]["trigger"]).type;
      } else {
        patchData[key] = value;
      }
    }
  }

  await workflow.patch(patchData);
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

  await deleteWorkflowExecutionsInBatches(ctx, workflow._id);

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

  await workflow.patch({ enabled: args.enabled, updatedAt: Date.now() });
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
  const execution = await ctx.table("workflowExecutions").getX(args._id);
  assertOrganizationAccess(
    execution.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to view this execution"
  );
  return execution.doc();
}

// ═══════════════════════════════════════════════════════════════════
// EXECUTION MUTATIONS (internal / external)
// ═══════════════════════════════════════════════════════════════════

export async function CreateExecution(ctx: zMutationCtx, args: z.infer<typeof types.CreateExecutionArgs>) {
  const workflow = await ctx.table("workflows").getX(args.workflowId);

  const execution = await ctx.table("workflowExecutions").insert({
    workflowId: args.workflowId,
    organizationId: workflow.organizationId,
    memberId: workflow.memberId,
    status: "pending",
    triggerPayload: args.triggerPayload,
    startedAt: Date.now(),
  });
  return execution;
}

export async function UpdateExecutionStatus(ctx: zMutationCtx, args: z.infer<typeof types.UpdateExecutionStatusArgs>) {
  const execution = await ctx.table("workflowExecutions").getX(args.executionId);

  const patchData: Record<string, unknown> = { status: args.status };
  if (args.agentOutput !== undefined) patchData.agentOutput = args.agentOutput;
  if (args.toolCalls !== undefined) patchData.toolCalls = args.toolCalls;
  if (args.error !== undefined) patchData.error = args.error;
  if (args.completedAt !== undefined) patchData.completedAt = args.completedAt;

  await execution.patch(patchData);
  return execution;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const EXECUTION_DELETE_BATCH_SIZE = 100;
const MAX_EXECUTIONS_DELETE_PER_MUTATION = 2000;

async function deleteWorkflowExecutionsInBatches(
  ctx: zMutationCtx,
  workflowId: Id<"workflows">,
): Promise<void> {
  let cursor: string | null = null;
  let deletedCount = 0;

  while (true) {
    const page = await ctx.db
      .query("workflowExecutions")
      .withIndex("workflowId_startedAt", (q) => q.eq("workflowId", workflowId))
      .paginate({
        numItems: EXECUTION_DELETE_BATCH_SIZE,
        cursor,
      });

    for (const execution of page.page) {
      await ctx.db.delete(execution._id);
      deletedCount += 1;
      if (deletedCount > MAX_EXECUTIONS_DELETE_PER_MUTATION) {
        throw new Error("Too many workflow executions to delete in one operation");
      }
    }

    if (page.isDone) {
      return;
    }
    cursor = page.continueCursor;
  }
}
