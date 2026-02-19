import {
  todosByStatus,
  todosByPriority,
  todosByOrg,
  todosByTeam,
  todosByTeamStatus,
  todosByCreator,
  todosByCreatorStatus,
} from "./aggregates";
import type { zQueryCtx } from "../functions";
import { exactBounds } from "../shared/aggregates";
import { assertPermission } from "../shared/auth";

// ═══════════════════════════════════════════════════════════════════
// SHARED HELPERS (reusable across all stats functions)
// ═══════════════════════════════════════════════════════════════════

const STATUS_VALUES = ["todo", "in_progress", "done"] as const;
const PRIORITY_VALUES = ["low", "medium", "high"] as const;

async function getStatusCounts(ctx: zQueryCtx, namespace: string) {
  const counts = await Promise.all(
    STATUS_VALUES.map((s) =>
      todosByStatus.count(ctx, { namespace, ...exactBounds(s) })
    )
  );
  return { todo: counts[0], inProgress: counts[1], done: counts[2] };
}

async function getPriorityCounts(ctx: zQueryCtx, namespace: string) {
  const counts = await Promise.all(
    PRIORITY_VALUES.map((p) =>
      todosByPriority.count(ctx, { namespace, ...exactBounds(p) })
    )
  );
  return { low: counts[0], medium: counts[1], high: counts[2] };
}

async function getTeamStatusCounts(
  ctx: zQueryCtx,
  orgId: string,
  teamId: string | undefined
) {
  const namespace = `${orgId}:${teamId ?? "none"}`;
  const counts = await Promise.all(
    STATUS_VALUES.map((s) =>
      todosByTeamStatus.count(ctx, { namespace, ...exactBounds(s) })
    )
  );
  return { todo: counts[0], inProgress: counts[1], done: counts[2] };
}

async function getMemberStatusCounts(
  ctx: zQueryCtx,
  orgId: string,
  memberId: string
) {
  const namespace = `${orgId}:${memberId}`;
  const counts = await Promise.all(
    STATUS_VALUES.map((s) =>
      todosByCreatorStatus.count(ctx, { namespace, ...exactBounds(s) })
    )
  );
  return { todo: counts[0], inProgress: counts[1], done: counts[2] };
}

// ═══════════════════════════════════════════════════════════════════
// ORGANIZATION STATS
// ═══════════════════════════════════════════════════════════════════

export async function GetOrgStats(ctx: zQueryCtx) {
  assertPermission(
    ctx.identity.organizationRole,
    { todo: ["readAny"] },
    "You are not authorized to view organization todo stats"
  );

  const orgId = ctx.identity.activeOrganizationId;

  const [total, byStatus, byPriority] = await Promise.all([
    todosByOrg.count(ctx, exactBounds(orgId)),
    getStatusCounts(ctx, orgId),
    getPriorityCounts(ctx, orgId),
  ]);

  return { total, byStatus, byPriority };
}

// ═══════════════════════════════════════════════════════════════════
// TEAM STATS
// ═══════════════════════════════════════════════════════════════════

export async function GetTeamStats(ctx: zQueryCtx, args: { teamId?: string }) {
  const orgId = ctx.identity.activeOrganizationId;
  const teamId = args.teamId ?? ctx.identity.activeTeamId ?? "none";

  const [total, byStatus] = await Promise.all([
    todosByTeam.count(ctx, exactBounds([orgId, teamId] as [string, string])),
    getTeamStatusCounts(ctx, orgId, args.teamId ?? ctx.identity.activeTeamId),
  ]);

  return { total, byStatus };
}

// ═══════════════════════════════════════════════════════════════════
// USER STATS
// ═══════════════════════════════════════════════════════════════════

export async function GetUserStats(ctx: zQueryCtx, args: { memberId?: string }) {
  const orgId = ctx.identity.activeOrganizationId;
  const memberId = args.memberId ?? ctx.identity.memberId;

  const [total, byStatus] = await Promise.all([
    todosByCreator.count(ctx, { namespace: orgId, ...exactBounds(memberId) }),
    getMemberStatusCounts(ctx, orgId, memberId),
  ]);

  return { total, byStatus };
}
