import { orgMemberAttachmentsByOrg, orgMemberAttachmentsByMember } from "./aggregates";
import type { zQueryCtx } from "../functions";
import { exactBounds } from "../shared/aggregates";
import { assertPermission } from "../shared/auth";

export async function GetMemberAttachmentStats(ctx: zQueryCtx) {
  const orgId = ctx.identity.activeOrganizationId;
  const memberId = ctx.identity.memberId;

  const total = await orgMemberAttachmentsByMember.count(ctx, {
    namespace: orgId,
    ...exactBounds(memberId),
  });

  return { total };
}

export async function GetOrgAttachmentStats(ctx: zQueryCtx) {
  assertPermission(
    ctx.identity.organizationRole,
    { attachment: ["readAny"] },
    "You are not authorized to view organization attachment stats"
  );

  const orgId = ctx.identity.activeOrganizationId;

  const total = await orgMemberAttachmentsByOrg.count(ctx, exactBounds(orgId));

  return { total };
}
