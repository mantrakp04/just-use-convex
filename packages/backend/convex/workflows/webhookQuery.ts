import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const getEnabledWorkflow = internalQuery({
  args: {
    workflowId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const workflow = await ctx.db.get(args.workflowId as Id<"workflows">);
      if (!workflow || !("enabled" in workflow) || !workflow.enabled) return null;
      return workflow;
    } catch {
      return null;
    }
  },
});
