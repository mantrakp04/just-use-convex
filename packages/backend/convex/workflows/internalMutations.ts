import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const failExecution = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) return;

    const now = Date.now();
    const wasTerminal = isTerminalExecutionStatus(execution.status);

    // Finalize any pending workflow steps as "not_called" before marking failed
    const steps = await ctx.db
      .query("workflowSteps")
      .withIndex("workflowExecutionId_updatedAt", (q) => q.eq("workflowExecutionId", args.executionId))
      .collect();
    const pendingSteps = steps.filter((step) => step.status === "pending");
    await Promise.all(pendingSteps.map((step) => ctx.db.patch(step._id, {
      status: "failure",
      failureReason: "not_called",
      updatedAt: now,
    })));

    // Recompute summary counters
    const total = steps.length;
    const success = steps.filter((s) => s.status === "success").length;
    const failure = pendingSteps.length + steps.filter((s) => s.status === "failure").length;

    await ctx.db.patch(args.executionId, {
      status: "failed",
      error: args.error,
      completedAt: now,
      requiredActionsTotal: total,
      requiredActionsSuccess: success,
      requiredActionsFailure: failure,
      requiredActionsStatus: failure > 0 ? "failure" : total === 0 || success === total ? "success" : "pending",
    });

    if (!wasTerminal) {
      await ctx.scheduler.runAfter(0, internal.workflows.scheduler.scheduleNext, {
        workflowId: execution.workflowId,
        fromTimestamp: now,
      });
    }
  },
});

function isTerminalExecutionStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
