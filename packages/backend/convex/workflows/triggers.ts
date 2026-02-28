import type { Trigger } from "convex-helpers/server/triggers";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import type { EventType } from "./types";
import { tableNames } from "../lib/schemaTables";
import {
  buildDispatchArgs,
  parseWorkflowTrigger,
  scheduleDispatch,
  resolveWorkflowMemberIdentity,
} from "./helpers";

type MutationCtx = GenericMutationCtx<DataModel>;

const OPERATIONS = ["create", "update", "delete"] as const;
type Operation = (typeof OPERATIONS)[number];

const OP_MAP: Record<string, Operation> = { insert: "create", update: "update", delete: "delete" };

function getEventForChange(tableName: string, operation: string): EventType | null {
  const op = OP_MAP[operation];
  if (!op || !tableNames.includes(tableName as (typeof tableNames)[number])) return null;
  return `on_${tableName}_${op}` as EventType;
}

type TableName = (typeof tableNames)[number];

export function workflowEventTrigger<T extends TableName>(tableName: T): Trigger<MutationCtx, DataModel, T> {
  return async (ctx, change) => {
    const event = getEventForChange(tableName, change.operation);
    if (!event) return;

    const doc = change.operation === "delete" ? asRecord(change.oldDoc) : asRecord(change.newDoc);
    if (!doc) return;

    const organizationId = doc.organizationId as string | undefined;
    if (!organizationId) return;

    const enabledWorkflows = await ctx.db
      .query("workflows")
      .withIndex("organizationId_enabled_triggerType", (q) =>
        q.eq("organizationId", organizationId).eq("enabled", true).eq("triggerType", "event"),
      )
      .collect();

    const dispatches: ReturnType<typeof buildDispatchArgs>[] = [];
    const memberCache = new Map<string, Awaited<ReturnType<typeof resolveWorkflowMemberIdentity>>>();

    for (const workflow of enabledWorkflows) {
      const trigger = parseWorkflowTrigger(workflow.trigger);
      if (!trigger || trigger.type !== "event" || trigger.event !== event) continue;

      const cacheKey = `${workflow.organizationId}:${workflow.memberId}`;
      let memberIdentity = memberCache.get(cacheKey);
      if (memberIdentity === undefined) {
        memberIdentity = await resolveWorkflowMemberIdentity(ctx, workflow.organizationId, workflow.memberId);
        memberCache.set(cacheKey, memberIdentity);
      }
      if (!memberIdentity) continue;

      dispatches.push(buildDispatchArgs(
        workflow as Doc<"workflows">,
        memberIdentity,
        JSON.stringify({
          event: trigger.event,
          table: tableName,
          operation: change.operation,
          documentId: change.id,
          document: doc,
          timestamp: Date.now(),
        }),
      ));
    }

    await scheduleDispatch(ctx, dispatches);
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}
