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
  },
});

function isTerminalExecutionStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
