import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getEnabledWorkflow = internalQuery({
  args: {
    workflowId: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    try {
      const workflow = await ctx.db.get(args.workflowId);
      if (!workflow || !("enabled" in workflow) || !workflow.enabled) return null;
      return workflow;
    } catch {
      return null;
    }
  },
});
