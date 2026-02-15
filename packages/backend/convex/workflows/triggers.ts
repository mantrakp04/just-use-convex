import type { Trigger } from "convex-helpers/server/triggers";
import type { GenericMutationCtx } from "convex/server";
import { components, internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import type { EventType } from "./types";
import { triggerSchema } from "../tables/workflows";
import { isMemberRole, type MemberRole } from "../shared/auth";

type MutationCtx = GenericMutationCtx<DataModel>;

type EventName = EventType;

const TABLE_EVENT_MAP: Record<string, { insert?: EventName; delete?: EventName; update?: EventName }> = {
  chats: { insert: "on_chat_create", delete: "on_chat_delete" },
  sandboxes: { insert: "on_sandbox_provision", delete: "on_sandbox_delete" },
  todos: { insert: "on_todo_create" },
};

// For todos "on_todo_complete", we check update where status changed to "done"
function getTodoCompleteEvent(change: { operation: string; oldDoc?: Record<string, unknown>; newDoc?: Record<string, unknown> }): EventName | null {
  if (change.operation === "update" && change.newDoc && change.oldDoc) {
    const oldStatus = change.oldDoc.status;
    const newStatus = change.newDoc.status;
    if (oldStatus !== "done" && newStatus === "done") {
      return "on_todo_complete";
    }
  }
  return null;
}

export function workflowEventTrigger<T extends "chats" | "sandboxes" | "todos">(
  tableName: T
): Trigger<MutationCtx, DataModel, T> {
  return async (ctx, change) => {
    const events: EventName[] = [];

    // Map operation to event
    const mapping = TABLE_EVENT_MAP[tableName];
    if (mapping) {
      if (change.operation === "insert" && mapping.insert) {
        events.push(mapping.insert);
      }
      if (change.operation === "update" && mapping.update) {
        events.push(mapping.update);
      }
      if (change.operation === "delete" && mapping.delete) {
        events.push(mapping.delete);
      }
    }

    // Special case: todo completion
    if (tableName === "todos") {
      const completeEvent = getTodoCompleteEvent(change as never);
      if (completeEvent) events.push(completeEvent);
    }

    if (events.length === 0) return;

    // Get the doc for building trigger payload
    const doc = change.operation === "delete"
      ? change.oldDoc
      : change.newDoc;

    if (!doc) return;

    const organizationId = (doc as Record<string, unknown>).organizationId as string | undefined;
    if (!organizationId) return;

    // Query enabled workflows in this org with matching event triggers
    const enabledWorkflows = await ctx.db
      .query("workflows")
      .withIndex("organizationId_enabled", (q) =>
        q.eq("organizationId", organizationId).eq("enabled", true)
      )
      .collect();

    for (const workflow of enabledWorkflows) {
      let trigger: ReturnType<typeof triggerSchema.parse>;
      try {
        trigger = triggerSchema.parse(JSON.parse(workflow.trigger));
      } catch {
        continue;
      }

      if (trigger.type !== "event") continue;

      const organizationRole = await resolveWorkflowOrganizationRole(
        ctx,
        workflow.organizationId,
        workflow.memberId,
      );
      if (!organizationRole) continue;

      for (const event of events) {
        if (trigger.event === event) {
          const triggerPayload = JSON.stringify({
            event,
            table: tableName,
            operation: change.operation,
            documentId: change.id,
            document: doc,
            timestamp: Date.now(),
          });

          await ctx.scheduler.runAfter(0, internal.workflows.dispatch.dispatchWorkflow, {
            workflowId: workflow._id,
            triggerPayload,
            userId: workflow.memberId, // use workflow owner's identity
            activeOrganizationId: workflow.organizationId,
            organizationRole,
            memberId: workflow.memberId,
          });
        }
      }
    }
  };
}

async function resolveWorkflowOrganizationRole(
  ctx: { runQuery: unknown },
  organizationId: string,
  memberId: string,
): Promise<MemberRole | null> {
  const runQuery = ctx.runQuery as (query: unknown, args: unknown) => Promise<unknown>;
  const member = await runQuery(components.betterAuth.adapter.findOne, {
    model: "member",
    where: [
      { field: "_id", operator: "eq", value: memberId },
      { field: "organizationId", operator: "eq", value: organizationId },
    ],
    select: ["role"],
  });

  const role = (member as { role?: unknown } | null)?.role;
  if (typeof role !== "string" || !isMemberRole(role)) {
    return null;
  }
  return role;
}
