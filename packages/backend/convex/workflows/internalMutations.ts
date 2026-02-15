import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const failExecution = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, {
      status: "failed",
      error: args.error,
      completedAt: Date.now(),
    });
  },
});
