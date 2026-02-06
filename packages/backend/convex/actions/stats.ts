import type { zQueryCtx } from "../functions";

export async function GetOrgStats(ctx: zQueryCtx) {
  const orgId = ctx.identity.activeOrganizationId;
  const actions = await ctx.db
    .query("actions")
    .withIndex("organizationId", (q) => q.eq("organizationId", orgId))
    .collect();
  return { total: actions.length };
}

export async function GetUserStats(ctx: zQueryCtx) {
  const orgId = ctx.identity.activeOrganizationId;
  const memberId = ctx.identity.memberId;
  const actions = await ctx.db
    .query("actions")
    .withIndex("organizationId", (q) => q.eq("organizationId", orgId))
    .filter((q) => q.eq(q.field("memberId"), memberId))
    .collect();
  return { total: actions.length };
}
