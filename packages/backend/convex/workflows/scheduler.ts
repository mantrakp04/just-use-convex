import type { FunctionArgs } from "convex/server";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { triggerSchema } from "../tables/workflows";
import { resolveWorkflowMemberIdentity } from "./memberIdentity";

type DispatchWorkflowBatchArgs = FunctionArgs<
  typeof internal.workflows.dispatch.dispatchWorkflowBatch
>;

export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Query all enabled schedule-type workflows
    const enabledWorkflows = await ctx.db
      .query("workflows")
      .withIndex("enabled_triggerType_updatedAt", (q) =>
        q.eq("enabled", true).eq("triggerType", "schedule")
      )
      .order("desc")
      .collect();

    const now = Date.now();
    const minuteStart = floorToMinute(now);
    const minuteEnd = minuteStart + 60_000;
    const dispatches: DispatchWorkflowBatchArgs["dispatches"] = [];

    for (const workflow of enabledWorkflows) {
      let trigger: ReturnType<typeof triggerSchema.parse>;
      try {
        trigger = triggerSchema.parse(JSON.parse(workflow.trigger));
      } catch {
        continue;
      }

      if (trigger.type !== "schedule" || !trigger.cron) continue;

      // Simple cron matching: check if this workflow should run now
      if (!shouldRunCron(trigger.cron, now)) continue;
      if (isSameScheduledMinute(workflow.lastScheduledAt, minuteStart, minuteEnd)) continue;

      await ctx.db.patch(workflow._id, { lastScheduledAt: minuteStart });

      const triggerPayload = JSON.stringify({
        type: "schedule",
        cron: trigger.cron,
        scheduledAt: now,
      });

      const memberIdentity = await resolveWorkflowMemberIdentity(
        ctx,
        workflow.organizationId,
        workflow.memberId,
      );
      if (!memberIdentity) continue;

      dispatches.push({
        workflowId: workflow._id,
        triggerPayload,
        userId: memberIdentity.userId,
        activeOrganizationId: workflow.organizationId,
        organizationRole: memberIdentity.role,
        memberId: workflow.memberId,
        activeTeamId: undefined,
      });
    }

    if (dispatches.length > 0) {
      await ctx.scheduler.runAfter(0, internal.workflows.dispatch.dispatchWorkflowBatch, {
        dispatches,
      });
    }
  },
});

// ═══════════════════════════════════════════════════════════════════
// SIMPLE CRON MATCHING
// Supports: "* * * * *" (min hour dom month dow)
// Runs at 1-min granularity — matches current minute
// ═══════════════════════════════════════════════════════════════════

function shouldRunCron(cronExpr: string, nowMs: number): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const date = new Date(nowMs);
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
  return timestampMs - (timestampMs % 60_000);
}

function isSameScheduledMinute(
  lastScheduledAt: number | undefined,
  minuteStart: number,
  minuteEnd: number,
): boolean {
  if (lastScheduledAt === undefined) {
    return false;
  }
  return lastScheduledAt >= minuteStart && lastScheduledAt < minuteEnd;
}
