import { chatsByOrg, chatsByMember } from "./aggregates";
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
// MEMBER STATS (for the current member's chats)
// ═══════════════════════════════════════════════════════════════════

export async function GetMemberChatStats(ctx: zQueryCtx) {
  const orgId = ctx.identity.activeOrganizationId;
  const memberId = ctx.identity.memberId;

  const total = await chatsByMember.count(ctx, {
    namespace: orgId,
    ...exactBounds(memberId),
  });

  return { total };
}

// ═══════════════════════════════════════════════════════════════════
// ORGANIZATION STATS (total chats in org - for admin views)
// ═══════════════════════════════════════════════════════════════════

export async function GetOrgChatStats(ctx: zQueryCtx) {
  const orgId = ctx.identity.activeOrganizationId;

  const total = await chatsByOrg.count(ctx, exactBounds(orgId));

  return { total };
}
