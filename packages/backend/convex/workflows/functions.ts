import type { z } from "zod";
import type { zMutationCtx, zQueryCtx } from "../functions";
import * as types from "./types";
import { assertPermission } from "../shared/auth";
import { withInvalidCursorRetry } from "../shared/pagination";
import { buildPatchData } from "../shared/patch";
import {
  assertWorkflowAccess,
  generateWebhookSecret,
  serializeTrigger,
  queueScheduleNext,
} from "./helpers";

// ═══════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════

async function runWorkflowsQuery(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  return ctx.table("workflows", "organizationId_memberId", (q) => q
    .eq("organizationId", ctx.identity.activeOrganizationId)
    .eq("memberId", ctx.identity.memberId),
  )
    .order("desc")
    .paginate(args.paginationOpts);
}

export async function ListWorkflows(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["read"] },
    "Not authorized to view workflows",
  );

  const workflows = await withInvalidCursorRetry(
    args,
    (nextArgs) => runWorkflowsQuery(ctx, nextArgs),
    (nextArgs) => ({ ...nextArgs, paginationOpts: { ...nextArgs.paginationOpts, cursor: null } }),
  );

  const page = await Promise.all(
    workflows.page.map(async (w) => ({
      ...w.doc(),
      sandbox: await w.edge("sandbox"),
    })),
  );

  return { ...workflows, page };
}

export async function GetWorkflow(ctx: zQueryCtx, args: z.infer<typeof types.GetArgs>) {
  const workflow = await ctx.table("workflows").getX(args._id);
  assertWorkflowAccess(ctx.identity, workflow, "read");

  const sandbox = await workflow.edge("sandbox");
  return { ...workflow.doc(), sandbox };
}

// ═══════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════

export async function CreateWorkflow(ctx: zMutationCtx, args: z.infer<typeof types.CreateArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { workflow: ["create"] },
    "Not authorized to create workflows",
  );

  if (args.data.sandboxId) {
    await validateSandboxOwnership(ctx, args.data.sandboxId);
  }

  let trigger = args.data.trigger;
  if (trigger.type === "webhook" && !trigger.secret) {
    trigger = { ...trigger, secret: generateWebhookSecret() };
  }

  return ctx.table("workflows").insert({
    name: args.data.name,
    ...serializeTrigger(trigger),
    instructions: args.data.instructions,
    allowedActions: args.data.allowedActions,
    model: args.data.model,
    inputModalities: args.data.inputModalities,
    sandboxId: args.data.sandboxId,
    enabled: false,
    organizationId: ctx.identity.activeOrganizationId,
    memberId: ctx.identity.memberId,
    updatedAt: Date.now(),
  });
}

export async function UpdateWorkflow(ctx: zMutationCtx, args: z.infer<typeof types.UpdateArgs>) {
  const workflow = await ctx.table("workflows").getX(args._id);
  assertWorkflowAccess(ctx.identity, workflow, "update");

  if (args.patch.sandboxId) {
    await validateSandboxOwnership(ctx, args.patch.sandboxId);
  }

  const patchData = buildPatchData(args.patch, {
    trigger: (value) => serializeTrigger(value as z.infer<typeof types.TriggerSchema>),
  });

  const now = Date.now();
  await workflow.patch({ ...patchData, updatedAt: now });

  const nextTriggerType = args.patch.trigger?.type ?? workflow.triggerType;
  const nextEnabled = args.patch.enabled ?? workflow.enabled;
  if (nextEnabled && nextTriggerType === "schedule") {
    await queueScheduleNext(ctx, workflow._id, now);
  }

  return workflow;
}

export async function DeleteWorkflow(ctx: zMutationCtx, args: z.infer<typeof types.DeleteArgs>) {
  const workflow = await ctx.table("workflows").getX(args._id);
  assertWorkflowAccess(ctx.identity, workflow, "delete");

  await workflow.delete();
  return true;
}

export async function ToggleWorkflow(ctx: zMutationCtx, args: z.infer<typeof types.ToggleArgs>) {
  const workflow = await ctx.table("workflows").getX(args._id);
  assertWorkflowAccess(ctx.identity, workflow, "update");

  const now = Date.now();
  await workflow.patch({ enabled: args.enabled, updatedAt: now });

  if (args.enabled && workflow.triggerType === "schedule") {
    await queueScheduleNext(ctx, workflow._id, now);
  }

  return workflow;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

async function validateSandboxOwnership(ctx: zMutationCtx, sandboxId: string) {
  const sandbox = await ctx.table("sandboxes").getX(sandboxId as any);
  if (sandbox.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("Sandbox does not belong to your organization");
  }
  if (sandbox.userId !== ctx.identity.userId) {
    throw new Error("Sandbox does not belong to you");
  }
}
