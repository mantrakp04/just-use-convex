import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { Cron } from "croner";
import {
  buildDispatchArgs,
  parseWorkflowTrigger,
  scheduleDispatch,
  resolveWorkflowMemberIdentity,
} from "./helpers";

export const scheduleNext = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    fromTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) return;

    const trigger = parseWorkflowTrigger(workflow.trigger);
    if (!workflow.enabled || workflow.triggerType !== "schedule" || !trigger || trigger.type !== "schedule") {
      return;
    }

    const fromTimestamp = args.fromTimestamp ?? Date.now();
    const nextScheduledAt = getNextScheduledAt(trigger.cron, fromTimestamp);
    if (nextScheduledAt === null) return;
    if (workflow.lastScheduledAt === nextScheduledAt) return;

    await ctx.db.patch(workflow._id, { lastScheduledAt: nextScheduledAt });

    await ctx.scheduler.runAt(nextScheduledAt, internal.workflows.scheduler.executeScheduledWorkflow, {
      workflowId: workflow._id,
      scheduledAt: nextScheduledAt,
      expectedUpdatedAt: workflow.updatedAt,
      cron: trigger.cron,
    });
  },
});

export const executeScheduledWorkflow = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    scheduledAt: v.number(),
    expectedUpdatedAt: v.number(),
    cron: v.string(),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) return;
    if (!workflow.enabled || workflow.triggerType !== "schedule") return;
    if (workflow.updatedAt !== args.expectedUpdatedAt) return;
    if (workflow.lastScheduledAt !== args.scheduledAt) return;

    const trigger = parseWorkflowTrigger(workflow.trigger);
    if (!trigger || trigger.type !== "schedule" || trigger.cron !== args.cron) return;

    const memberIdentity = await resolveWorkflowMemberIdentity(
      ctx,
      workflow.organizationId,
      workflow.memberId,
    );
    if (!memberIdentity) return;

    const triggerPayload = JSON.stringify({
      type: "schedule",
      cron: args.cron,
      scheduledAt: args.scheduledAt,
      dispatchedAt: Date.now(),
    });

    await scheduleDispatch(ctx, buildDispatchArgs(workflow as Doc<"workflows">, memberIdentity, triggerPayload));
  },
});

// ═══════════════════════════════════════════════════════════════════
// CRON PARSING
// ═══════════════════════════════════════════════════════════════════

function getNextScheduledAt(cronExpr: string, fromMs: number): number | null {
  try {
    const next = new Cron(cronExpr).nextRun(new Date(fromMs));
    return next ? next.getTime() : null;
  } catch {
    return null;
  }
}
