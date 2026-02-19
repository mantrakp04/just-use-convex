import { chatsByOrg, chatsByMember } from "./aggregates";
import type { zQueryCtx } from "../functions";
import { exactBounds } from "../shared/aggregates";
import { assertPermission } from "../shared/auth";

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
  assertPermission(
    ctx.identity.organizationRole,
    { chat: ["readAny"] },
    "You are not authorized to view organization chat stats"
  );

  const orgId = ctx.identity.activeOrganizationId;

  const total = await chatsByOrg.count(ctx, exactBounds(orgId));

  return { total };
}
