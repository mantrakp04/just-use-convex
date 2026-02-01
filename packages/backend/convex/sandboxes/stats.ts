import { sandboxesByOrg, sandboxesByUser } from "./aggregates";
import type { zQueryCtx } from "../functions";

// Helper to create bounds for exact key match
function exactBounds<K>(key: K) {
  return {
    bounds: {
      lower: { key, inclusive: true },
      upper: { key, inclusive: true },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// USER STATS (for the current user's sandboxes)
// ═══════════════════════════════════════════════════════════════════

export async function GetUserSandboxStats(ctx: zQueryCtx) {
  const orgId = ctx.identity.activeOrganizationId;
  const userId = ctx.identity.userId;

  const total = await sandboxesByUser.count(ctx, {
    namespace: orgId,
    ...exactBounds(userId),
  });

  return { total };
}

// ═══════════════════════════════════════════════════════════════════
// ORGANIZATION STATS (total sandboxes in org - for admin views)
// ═══════════════════════════════════════════════════════════════════

export async function GetOrgSandboxStats(ctx: zQueryCtx) {
  const orgId = ctx.identity.activeOrganizationId;

  const total = await sandboxesByOrg.count(ctx, exactBounds(orgId));

  return { total };
}
