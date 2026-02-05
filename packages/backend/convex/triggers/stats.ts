import type { zQueryCtx } from "../functions";

export async function GetOrgStats(ctx: zQueryCtx) {
  const orgId = ctx.identity.activeOrganizationId;
  const triggers = await ctx.db
    .query("triggers")
    .withIndex("organizationId", (q) => q.eq("organizationId", orgId))
    .collect();
  return { total: triggers.length };
}

export async function GetUserStats(ctx: zQueryCtx) {
  const orgId = ctx.identity.activeOrganizationId;
  const memberId = ctx.identity.memberId;
  const triggers = await ctx.db
    .query("triggers")
    .withIndex("organizationId", (q) => q.eq("organizationId", orgId))
    .filter((q) => q.eq(q.field("memberId"), memberId))
    .collect();
  return { total: triggers.length };
}
