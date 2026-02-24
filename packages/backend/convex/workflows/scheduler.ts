import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { triggerSchema } from "../tables/workflows";
import { buildDispatchArgs, resolveWorkflowMemberIdentity } from "./functions";

export const scheduleNext = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    fromTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) return;

    const scheduleTrigger = parseScheduleTrigger(workflow.trigger);
    if (!workflow.enabled || workflow.triggerType !== "schedule" || !scheduleTrigger) {
      return;
    }

    const fromTimestamp = args.fromTimestamp ?? Date.now();
    const nextScheduledAt = getNextScheduledAt(scheduleTrigger.cron, fromTimestamp);
    if (nextScheduledAt === null) return;
    if (workflow.lastScheduledAt === nextScheduledAt) return;

    await ctx.db.patch(workflow._id, { lastScheduledAt: nextScheduledAt });

    await ctx.scheduler.runAt(nextScheduledAt, internal.workflows.scheduler.executeScheduledWorkflow, {
      workflowId: workflow._id,
      scheduledAt: nextScheduledAt,
      expectedUpdatedAt: workflow.updatedAt,
      cron: scheduleTrigger.cron,
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

    const scheduleTrigger = parseScheduleTrigger(workflow.trigger);
    if (!scheduleTrigger || scheduleTrigger.cron !== args.cron) return;

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

    await ctx.scheduler.runAfter(0, internal.workflows.dispatch.dispatchWorkflow, {
      ...buildDispatchArgs(workflow as Doc<"workflows">, memberIdentity, triggerPayload),
    });
  },
});

const MINUTE_MS = 60_000;
const MAX_SEARCH_MINUTES = 366 * 24 * 60;

function getNextScheduledAt(cronExpr: string, fromMs: number): number | null {
  const start = floorToMinute(fromMs) + MINUTE_MS;
  for (let i = 0; i < MAX_SEARCH_MINUTES; i += 1) {
    const candidate = start + i * MINUTE_MS;
    if (matchesCron(cronExpr, candidate)) {
      return candidate;
    }
  }
  return null;
}

function matchesCron(cronExpr: string, timestampMs: number): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const date = new Date(timestampMs);
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday

  return (
    matchesCronField(parts[0]!, minute, 0, 59) &&
    matchesCronField(parts[1]!, hour, 0, 23) &&
    matchesCronField(parts[2]!, dayOfMonth, 1, 31) &&
    matchesCronField(parts[3]!, month, 1, 12) &&
    matchesCronField(parts[4]!, dayOfWeek, 0, 6)
  );
}

function matchesCronField(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;

  // Handle step values: */5
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) return false;
    return (value - min) % step === 0;
  }

  // Handle comma-separated values: 1,15,30
  const values = field.split(",");
  for (const v of values) {
    // Handle stepped ranges and offsets: 5-59/10, 10/15
    if (v.includes("/")) {
      const [basePart, stepPart] = v.split("/");
      const step = parseInt(stepPart ?? "", 10);
      if (isNaN(step) || step <= 0) { continue; }

      if (basePart === "*") {
        if ((value - min) % step === 0) return true;
        continue;
      }

      if (basePart?.includes("-")) {
        const [startStr, endStr] = basePart.split("-");
        const start = parseInt(startStr ?? "", 10);
        const end = parseInt(endStr ?? "", 10);
        if (isNaN(start) || isNaN(end) || value < start || value > end) continue;
        if ((value - start) % step === 0) return true;
        continue;
      }

      const start = parseInt(basePart ?? "", 10);
      if (isNaN(start)) { continue; }
      if (value >= start && value <= max && (value - start) % step === 0) {
        return true;
      }
      continue;
    }

    // Handle ranges: 1-5
    if (v.includes("-")) {
      const [startStr, endStr] = v.split("-");
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);
      if (!isNaN(start) && !isNaN(end) && value >= start && value <= end) {
        return true;
      }
    } else {
      const num = parseInt(v, 10);
      if (!isNaN(num) && num === value) return true;
    }
  }

  return false;
}

function floorToMinute(timestampMs: number): number {
  return timestampMs - (timestampMs % MINUTE_MS);
}

function parseScheduleTrigger(triggerJson: string): { cron: string } | null {
  try {
    const trigger = triggerSchema.parse(JSON.parse(triggerJson));
    if (trigger.type !== "schedule" || !trigger.cron) return null;
    return { cron: trigger.cron };
  } catch {
    return null;
  }
}
