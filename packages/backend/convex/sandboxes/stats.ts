import { sandboxesByOrg, sandboxesByUser } from "./aggregates";
import type { zQueryCtx } from "../functions";
import { exactBounds } from "../shared/aggregates";
import { assertPermission } from "../shared/auth";

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
  assertPermission(
    ctx.identity.organizationRole,
    { sandbox: ["readAny"] },
    "You are not authorized to view organization sandbox stats"
  );

  const orgId = ctx.identity.activeOrganizationId;

  const total = await sandboxesByOrg.count(ctx, exactBounds(orgId));

  return { total };
}
