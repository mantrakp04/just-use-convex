import { components } from "../_generated/api";
import { isMemberRole, type MemberRole } from "../shared/auth";

type WorkflowMember = {
  role: MemberRole;
  userId: string;
};

export async function resolveWorkflowMemberIdentity(
  ctx: { runQuery: unknown },
  organizationId: string,
  memberId: string,
): Promise<WorkflowMember | null> {
  const runQuery = ctx.runQuery as (query: unknown, args: unknown) => Promise<unknown>;
  const member = await runQuery(components.betterAuth.adapter.findOne, {
    model: "member",
    where: [
      { field: "_id", operator: "eq", value: memberId },
      { field: "organizationId", operator: "eq", value: organizationId },
    ],
    select: ["role", "userId"],
  });

  const role = (member as { role?: unknown } | null)?.role;
  const userId = (member as { userId?: unknown } | null)?.userId;
  if (typeof role !== "string" || !isMemberRole(role)) {
    return null;
  }
  if (typeof userId !== "string" || userId.length === 0) {
    return null;
  }

  return { role, userId };
}
