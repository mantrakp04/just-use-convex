import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { zodToConvexFields } from "convex-helpers/server/zod4";
import { v } from "convex/values";
import type { Trigger } from "convex-helpers/server/triggers";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

export const todosContentZodSchema = {
  organizationId: z.string(),
  content: z.string(),
};

export const todosContentFields = {
  ...zodToConvexFields(todosContentZodSchema),
  todoId: v.id("todos"),
};

export const TodosContent = Table("todosContent", todosContentFields);

const todosContentTable = TodosContent.table
  .index("todoId", ["todoId"])
  .searchIndex("content", {
    searchField: "content",
    filterFields: ["organizationId"],
  });

export const todosContentEnt = defineEntFromTable(todosContentTable)
  .edge("todo", { to: "todos", field: "todoId" });

// ═══════════════════════════════════════════════════════════════════
// CONTENT BUILDER
// ═══════════════════════════════════════════════════════════════════

type MutationCtx = GenericMutationCtx<DataModel>;

interface TodoDoc {
  organizationId: string;
  memberId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  teamId?: string;
  dueDate?: number | null;
  startTime?: number | null;
  endTime?: number | null;
}

function buildTodoContent(todo: TodoDoc, assignedMemberIds: string[]): string {
  const parts = [
    `organizationId:${todo.organizationId}`,
    `memberId:${todo.memberId}`,
    `title:${todo.title}`,
  ];
  if (todo.description) parts.push(`description:${todo.description}`);
  if (todo.status) parts.push(`status:${todo.status}`);
  if (todo.priority) parts.push(`priority:${todo.priority}`);
  if (todo.teamId) parts.push(`teamId:${todo.teamId}`);
  if (todo.dueDate) parts.push(`dueDate:${todo.dueDate}`);
  if (todo.startTime) parts.push(`startTime:${todo.startTime}`);
  if (todo.endTime) parts.push(`endTime:${todo.endTime}`);
  for (const mid of assignedMemberIds) {
    parts.push(`todoAssignedMember:${mid}`);
  }
  return parts.join(", ");
}

async function upsertTodoContent(ctx: MutationCtx, todoId: string, todo: TodoDoc) {
  const assignments = await ctx.db
    .query("todoAssignedMembers")
    .withIndex("todoId_memberId", (q) => q.eq("todoId", todoId as never))
    .collect();
  const content = buildTodoContent(todo, assignments.map((a) => a.memberId));

  const existing = await ctx.db
    .query("todosContent")
    .withIndex("todoId", (q) => q.eq("todoId", todoId as never))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { content });
  } else {
    await ctx.db.insert("todosContent", {
      todoId: todoId as never,
      organizationId: todo.organizationId,
      content,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// TRIGGERS
// ═══════════════════════════════════════════════════════════════════

export const todoContentTrigger: Trigger<MutationCtx, DataModel, "todos"> = async (ctx, change) => {
  if (change.operation === "insert" || change.operation === "update") {
    await upsertTodoContent(ctx, change.id, change.newDoc);
  }

  if (change.operation === "delete") {
    const existing = await ctx.db
      .query("todosContent")
      .withIndex("todoId", (q) => q.eq("todoId", change.id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  }
};

export const todoAssignedMembersContentTrigger: Trigger<MutationCtx, DataModel, "todoAssignedMembers"> = async (ctx, change) => {
  const todoId = change.operation === "delete" ? change.oldDoc.todoId : change.newDoc.todoId;

  const todo = await ctx.db.get(todoId);
  if (!todo) return;

  await upsertTodoContent(ctx, todoId, todo);
};
