import type { Trigger } from "convex-helpers/server/triggers";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import type { EventType } from "./types";
import {
  buildDispatchArgs,
  parseWorkflowTrigger,
  scheduleDispatch,
  resolveWorkflowMemberIdentity,
} from "./helpers";

type MutationCtx = GenericMutationCtx<DataModel>;

const TABLE_EVENT_MAP: Record<string, { insert?: EventType; delete?: EventType; update?: EventType }> = {
  chats: { insert: "on_chat_create", delete: "on_chat_delete" },
  sandboxes: { insert: "on_sandbox_provision", delete: "on_sandbox_delete" },
  todos: { insert: "on_todo_create" },
};

function getTodoCompleteEvent(change: { operation: string; oldDoc?: Record<string, unknown>; newDoc?: Record<string, unknown> }): EventType | null {
  if (change.operation === "update" && change.newDoc && change.oldDoc) {
    if (change.oldDoc.status !== "done" && change.newDoc.status === "done") {
      return "on_todo_complete";
    }
  }
  return null;
}

export function workflowEventTrigger<T extends "chats" | "sandboxes" | "todos">(
  tableName: T,
): Trigger<MutationCtx, DataModel, T> {
  return async (ctx, change) => {
    const events: EventType[] = [];

    const mapping = TABLE_EVENT_MAP[tableName];
    if (mapping) {
      if (change.operation === "insert" && mapping.insert) events.push(mapping.insert);
      if (change.operation === "update" && mapping.update) events.push(mapping.update);
      if (change.operation === "delete" && mapping.delete) events.push(mapping.delete);
    }

    if (tableName === "todos") {
      const completeEvent = getTodoCompleteEvent({
        operation: change.operation,
        oldDoc: asRecord(change.oldDoc),
        newDoc: asRecord(change.newDoc),
      });
      if (completeEvent) events.push(completeEvent);
    }

    if (events.length === 0) return;

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
      if (!trigger || trigger.type !== "event" || !events.includes(trigger.event)) continue;

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
