import type { z } from "zod";
import type { zMutationCtx, zQueryCtx } from "../functions";
import * as types from "./types";
import { withInvalidCursorRetry } from "../shared/pagination";
import {
  assertOrganizationAccess,
  assertPermission,
  assertScopedPermission,
} from "../shared/auth_shared";

async function runTodosQuery(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  return ctx.table("todos", 'organizationId', (q) => q
    .eq('organizationId', ctx.identity.activeOrganizationId))
    .filter((q) => {
      const conditions: ReturnType<typeof q.eq>[] = [];

      if (args.filters.status !== undefined) {
        conditions.push(q.eq(q.field("status"), args.filters.status));
      }
      if (args.filters.priority !== undefined) {
        conditions.push(q.eq(q.field("priority"), args.filters.priority));
      }
      if (args.filters.memberId !== undefined) {
        conditions.push(q.eq(q.field("memberId"), args.filters.memberId));
      }
      if (args.filters.teamId !== undefined) {
        conditions.push(q.eq(q.field("teamId"), args.filters.teamId));
      }
      if (args.filters.dueDate !== undefined) {
        conditions.push(q.lte(q.field("dueDate"), args.filters.dueDate));
      }
      if (args.filters.dueDateFrom !== undefined) {
        conditions.push(q.gte(q.field("dueDate"), args.filters.dueDateFrom));
      }
      if (args.filters.dueDateTo !== undefined) {
        conditions.push(q.lte(q.field("dueDate"), args.filters.dueDateTo));
      }
      if (args.filters.updatedAt !== undefined) {
        conditions.push(q.gte(q.field("updatedAt"), args.filters.updatedAt));
      }

      if (conditions.length === 0) {
        return true;
      }
      if (conditions.length === 1) {
        return conditions[0]!;
      }
      return q.and(...conditions);
    })
    .paginate(args.paginationOpts);
}

export async function ListTodos(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { todo: ["read"] },
    "You are not authorized to view todos"
  );
  if (args.filters.memberId !== undefined && args.filters.memberId !== ctx.identity.memberId) {
    assertPermission(
      ctx.identity.organizationRole,
      { todo: ["readAny"] },
      "You are not authorized to view other members' todos"
    );
  }
  if (args.filters.assignedMemberId !== undefined && args.filters.assignedMemberId !== ctx.identity.memberId) {
    assertPermission(
      ctx.identity.organizationRole,
      { todo: ["readAny"] },
      "You are not authorized to view other members' assigned todos"
    );
  }

  // If filtering by assigned member, get the set of todo IDs first
  let assignedTodoIds: Set<string> | null = null;
  if (args.filters.assignedMemberId !== undefined) {
    const assignments = await ctx.table("todoAssignedMembers", "memberId", (q) =>
      q.eq("memberId", args.filters.assignedMemberId!)
    );
    assignedTodoIds = new Set(assignments.map((a) => a.todoId));
  }

  let todos;
  todos = await withInvalidCursorRetry(
    args,
    (nextArgs) => runTodosQuery(ctx, nextArgs),
    (nextArgs) => ({ ...nextArgs, paginationOpts: { ...nextArgs.paginationOpts, cursor: null } })
  );

  // Filter by assigned user if specified (post-pagination JS filter)
  if (assignedTodoIds !== null) {
    return {
      ...todos,
      page: todos.page.filter((todo) => assignedTodoIds!.has(todo._id)),
    };
  }

  return todos;
}

export async function GetTodo(ctx: zQueryCtx, args: z.infer<typeof types.GetTodoArgs>) {
  const todo = await ctx.table("todos").getX(args._id)
  assertOrganizationAccess(
    todo.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to get this todo"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    todo.memberId,
    { todo: ["read"] },
    { todo: ["readAny"] },
    "You are not authorized to get this todo",
    "You are not authorized to get this todo"
  );
  const assignedMembers = await todo.edge("assignedMembers").order('desc')

  return {
    ...todo,
    assignedMembers,
  };
}

export async function CreateTodo(ctx: zMutationCtx, args: z.infer<typeof types.CreateArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { todo: ["create"] },
    "You are not authorized to create todos"
  );

  const todo = await ctx.table("todos").insert({
    ...args.data,
    organizationId: ctx.identity.activeOrganizationId,
    memberId: ctx.identity.memberId,
    updatedAt: Date.now(),
  });
  return todo;
}

export async function UpdateTodo(ctx: zMutationCtx, args: z.infer<typeof types.UpdateArgs>) {
  const todo = await ctx.table("todos").getX(args._id)
  assertOrganizationAccess(
    todo.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to update this todo"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    todo.memberId,
    { todo: ["update"] },
    { todo: ["updateAny"] },
    "You are not authorized to update this todo",
    "You are not authorized to update this todo"
  );

  const patchData: Record<string, unknown> = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(args.patch)) {
    if (value !== undefined) {
      patchData[key] = value;
    }
  }

  await todo.patch(patchData);
  return todo.doc();
}

export async function DeleteTodo(ctx: zMutationCtx, args: z.infer<typeof types.DeleteArgs>) {
  const todo = await ctx.table("todos").getX(args._id)
  assertOrganizationAccess(
    todo.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to delete this todo"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    todo.memberId,
    { todo: ["delete"] },
    { todo: ["deleteAny"] },
    "You are not authorized to delete this todo",
    "You are not authorized to delete this todo"
  );
  await todo.delete();
  return true;
}

export async function AssignMember(ctx: zMutationCtx, args: z.infer<typeof types.AssignMemberArgs>) {
  const todo = await ctx.table("todos").getX(args.todoId);
  assertOrganizationAccess(
    todo.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to assign members to this todo"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    todo.memberId,
    { todo: ["assign"] },
    { todo: ["assignAny"] },
    "You are not authorized to assign members to this todo",
    "You are not authorized to assign members to this todo"
  );

  const existing = await ctx.table("todoAssignedMembers", "todoId_memberId", (q) =>
    q.eq("todoId", args.todoId).eq("memberId", args.memberId)
  ).unique();

  if (existing) {
    throw new Error("Member is already assigned to this todo");
  }

  const assignment = await ctx.table("todoAssignedMembers").insert({
    todoId: args.todoId,
    memberId: args.memberId,
    assignedByMemberId: ctx.identity.memberId,
  });
  return assignment;
}

export async function UnassignMember(ctx: zMutationCtx, args: z.infer<typeof types.UnassignMemberArgs>) {
  const todo = await ctx.table("todos").getX(args.todoId);
  assertOrganizationAccess(
    todo.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to unassign members from this todo"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    todo.memberId,
    { todo: ["assign"] },
    { todo: ["assignAny"] },
    "You are not authorized to unassign members from this todo",
    "You are not authorized to unassign members from this todo"
  );

  const assignment = await ctx.table("todoAssignedMembers", "todoId_memberId", (q) =>
    q.eq("todoId", args.todoId).eq("memberId", args.memberId)
  ).unique();

  if (!assignment) {
    throw new Error("Member is not assigned to this todo");
  }

  await assignment.delete();
  return true;
}

export async function ListAssignedTodos(ctx: zQueryCtx, args: z.infer<typeof types.ListAssignedTodosArgs>) {
  const memberId = args.memberId ?? ctx.identity.memberId;
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    memberId,
    { todo: ["read"] },
    { todo: ["readAny"] },
    "You are not authorized to view assigned todos",
    "You are not authorized to view other members' assigned todos"
  );

  const assignments = await ctx.table("todoAssignedMembers", "memberId", (q) =>
    q.eq("memberId", memberId)
  ).paginate(args.paginationOpts);

  const todos = await Promise.all(
    assignments.page.map(async (assignment) => {
      const todo = await assignment.edge("todo");
      if (todo.organizationId !== ctx.identity.activeOrganizationId) {
        return null;
      }
      return todo;
    })
  );

  return {
    ...assignments,
    page: todos.filter((todo) => todo !== null),
  };
}
