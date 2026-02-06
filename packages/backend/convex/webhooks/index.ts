import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const insertWorkflowRun = internalMutation({
  args: {
    triggerKey: v.string(),
    payload: v.string(),
    contentType: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    headersJson: v.string(),
    queryJson: v.string(),
  },
  handler: async (ctx, args) => {
    const trigger = await ctx.db
      .query("triggers")
      .withIndex("webhookKey", (query) => query.eq("webhookKey", args.triggerKey))
      .first();
    if (!trigger) {
      throw new Error("Trigger not found");
    }
    const triggerId = trigger._id;
    const organizationId = trigger.organizationId;
    const now = Date.now();
    return await ctx.db.insert("workflowRuns", {
      organizationId,
      teamId: trigger.teamId,
      triggerId,
      status: "queued",
      payloadJson: JSON.stringify({
        payload: args.payload,
        contentType: args.contentType,
        userAgent: args.userAgent,
        headersJson: args.headersJson,
        queryJson: args.queryJson,
      }),
      updatedAt: now,
    });
  },
});
