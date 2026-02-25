import type { z } from "zod";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { Doc as BetterAuthDoc } from "../betterAuth/_generated/dataModel";
import type { WorkflowMember } from "./types";
import { components, internal } from "../_generated/api";
import { triggerSchema as TriggerSchema } from "../tables/workflows";
import { isMemberRole } from "../shared/auth";
import {
  assertOrganizationAccess,
  assertScopedPermission,
} from "../shared/auth";

// ═══════════════════════════════════════════════════════════════════
// CONTEXT TYPE ALIASES
// ═══════════════════════════════════════════════════════════════════

export type RunQueryCtx = Pick<import("convex/server").GenericActionCtx<DataModel>, "runQuery">;
export type RunAfterCtx = Pick<GenericMutationCtx<DataModel>, "scheduler">;
export type FailExecutionCtx = Pick<GenericMutationCtx<DataModel>, "db" | "scheduler">;
export type DbCtx = Pick<GenericQueryCtx<DataModel>, "db">;

// ═══════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════

type WorkflowAction = "read" | "update" | "delete" | "execute";

const SCOPED_ACTIONS = {
  read: { own: "read", any: "readAny" },
  update: { own: "update", any: "updateAny" },
  delete: { own: "delete", any: "deleteAny" },
  execute: { own: "execute", any: "execute" },
} as const;

export function assertWorkflowAccess(
  identity: { organizationRole: string; memberId: string; activeOrganizationId: string },
  resource: { organizationId: string; memberId: string },
  action: WorkflowAction,
) {
  const msg = `Not authorized to ${action} this workflow`;
  assertOrganizationAccess(resource.organizationId, identity.activeOrganizationId, msg);
  const scoped = SCOPED_ACTIONS[action];
  assertScopedPermission(
    identity.organizationRole,
    identity.memberId,
    resource.memberId,
    { workflow: [scoped.own] },
    { workflow: [scoped.any] },
    msg,
    msg,
  );
}

// ═══════════════════════════════════════════════════════════════════
// MEMBER IDENTITY
// ═══════════════════════════════════════════════════════════════════

export async function resolveWorkflowMemberIdentity(
  ctx: RunQueryCtx,
  organizationId: string,
  memberId: string,
): Promise<WorkflowMember | null> {
  const member: Pick<BetterAuthDoc<"member">, "role" | "userId"> | null = await ctx.runQuery(
    components.betterAuth.adapter.findOne,
    {
      model: "member",
      where: [
        { field: "_id", operator: "eq", value: memberId },
        { field: "organizationId", operator: "eq", value: organizationId },
      ],
      select: ["role", "userId"],
    },
  );

  const role = member?.role;
  const userId = member?.userId;
  if (typeof role !== "string" || !isMemberRole(role)) return null;
  if (typeof userId !== "string" || userId.length === 0) return null;

  return { role, userId };
}

// ═══════════════════════════════════════════════════════════════════
// TRIGGER SERIALIZATION
// ═══════════════════════════════════════════════════════════════════

type ParsedTrigger = z.infer<typeof TriggerSchema>;

/** Returns null for invalid triggers (use in scheduler/triggers where we skip silently) */
export function parseWorkflowTrigger(triggerJson: string): ParsedTrigger | null {
  try {
    return TriggerSchema.parse(JSON.parse(triggerJson));
  } catch {
    return null;
  }
}

/** Throws on invalid trigger (use where invalid is an error) */
export function getWorkflowTrigger(workflow: Pick<Doc<"workflows">, "trigger">): ParsedTrigger {
  const parsed = parseWorkflowTrigger(workflow.trigger);
  if (!parsed) throw new Error("Invalid workflow trigger configuration");
  return parsed;
}

/** Serialize trigger for storage */
export function serializeTrigger(trigger: ParsedTrigger): { trigger: string; triggerType: ParsedTrigger["type"] } {
  return { trigger: JSON.stringify(trigger), triggerType: trigger.type };
}

// ═══════════════════════════════════════════════════════════════════
// DISPATCH
// ═══════════════════════════════════════════════════════════════════

export interface DispatchArgs {
  workflowId: Id<"workflows">;
  triggerPayload?: string;
  userId: string;
  activeOrganizationId: string;
  organizationRole: string;
  memberId: string;
  activeTeamId?: string;
}

export function buildDispatchArgs(
  workflow: Pick<Doc<"workflows">, "_id" | "organizationId" | "memberId">,
  memberIdentity: WorkflowMember,
  triggerPayload: string,
  options?: { activeTeamId?: string },
): DispatchArgs {
  return {
    workflowId: workflow._id,
    triggerPayload,
    userId: memberIdentity.userId,
    activeOrganizationId: workflow.organizationId,
    organizationRole: memberIdentity.role,
    memberId: workflow.memberId,
    activeTeamId: options?.activeTeamId,
  };
}

export async function scheduleDispatch(
  ctx: RunAfterCtx,
  dispatches: DispatchArgs | DispatchArgs[],
) {
  const items = Array.isArray(dispatches) ? dispatches : [dispatches];
  if (items.length === 0) return;
  if (items.length === 1) {
    await ctx.scheduler.runAfter(0, internal.workflows.dispatch.dispatchWorkflow, items[0]!);
  } else {
    await ctx.scheduler.runAfter(0, internal.workflows.dispatch.dispatchWorkflowBatch, { dispatches: items });
  }
}

// ═══════════════════════════════════════════════════════════════════
// SCHEDULER
// ═══════════════════════════════════════════════════════════════════

export async function queueScheduleNext(
  ctx: RunAfterCtx,
  workflowId: Id<"workflows">,
  fromTimestamp: number,
) {
  await ctx.scheduler.runAfter(0, internal.workflows.scheduler.scheduleNext, {
    workflowId,
    fromTimestamp,
  });
}

// ═══════════════════════════════════════════════════════════════════
// MISC
// ═══════════════════════════════════════════════════════════════════

export function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
