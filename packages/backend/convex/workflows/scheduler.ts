import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Query all enabled schedule-type workflows
    const enabledWorkflows = await ctx.db
      .query("workflows")
      .withIndex("organizationId_enabled")
      .filter((q) => q.eq(q.field("enabled"), true))
      .collect();

    const now = Date.now();

    for (const workflow of enabledWorkflows) {
      let trigger: { type: string; cron?: string };
      try {
        trigger = JSON.parse(workflow.trigger);
      } catch {
        continue;
      }

      if (trigger.type !== "schedule" || !trigger.cron) continue;

      // Simple cron matching: check if this workflow should run now
      if (!shouldRunCron(trigger.cron, now)) continue;

      const triggerPayload = JSON.stringify({
        type: "schedule",
        cron: trigger.cron,
        scheduledAt: now,
      });

      await ctx.scheduler.runAfter(0, internal.workflows.dispatch.dispatchWorkflow, {
        workflowId: workflow._id,
        triggerPayload,
        userId: workflow.memberId,
        activeOrganizationId: workflow.organizationId,
        organizationRole: "owner",
        memberId: workflow.memberId,
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

function matchesCronField(field: string, value: number, _min: number, _max: number): boolean {
  if (field === "*") return true;

  // Handle step values: */5
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) return false;
    return value % step === 0;
  }

  // Handle comma-separated values: 1,15,30
  const values = field.split(",");
  for (const v of values) {
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
