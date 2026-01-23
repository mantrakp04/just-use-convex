import type { z } from "zod";
import type { zMutationCtx, zQueryCtx } from "../functions";
import * as types from "./types";

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
      if (args.filters.userId !== undefined) {
        conditions.push(q.eq(q.field("userId"), args.filters.userId));
      }
      if (args.filters.teamId !== undefined) {
        conditions.push(q.eq(q.field("teamId"), args.filters.teamId));
      }
      if (args.filters.dueDate !== undefined) {
        conditions.push(q.lte(q.field("dueDate"), args.filters.dueDate));
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
  // If filtering by assigned user, get the set of todo IDs first
  let assignedTodoIds: Set<string> | null = null;
  if (args.filters.assignedUserId !== undefined) {
    const assignments = await ctx.table("todoAssignedUsers", "userId", (q) =>
      q.eq("userId", args.filters.assignedUserId!)
    );
    assignedTodoIds = new Set(assignments.map((a) => a.todoId));
  }

  let todos;
  try {
    todos = await runTodosQuery(ctx, args);
  } catch (error) {
    // Handle invalid cursor error by retrying without cursor
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("InvalidCursor")) {
      todos = await runTodosQuery(ctx, {
        ...args,
        paginationOpts: { ...args.paginationOpts, cursor: null },
      });
    } else {
      throw error;
    }
  }

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
  if (todo.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to get this todo");
  }
  const assignedUsers = await todo.edge("assignedUsers").order('desc')

  return {
    ...todo,
    assignedUsers,
  };
}

export async function CreateTodo(ctx: zMutationCtx, args: z.infer<typeof types.CreateArgs>) {
  const todo = await ctx.table("todos").insert({
    ...args.data,
    organizationId: ctx.identity.activeOrganizationId,
    userId: ctx.identity.userId,
    updatedAt: Date.now(),
  });
  return todo;
}

export async function UpdateTodo(ctx: zMutationCtx, args: z.infer<typeof types.UpdateArgs>) {
  const todo = await ctx.table("todos").getX(args._id)
  if (todo.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to update this todo");
  }
  await todo.patch(args.patch);
  return todo;
}

export async function DeleteTodo(ctx: zMutationCtx, args: z.infer<typeof types.DeleteArgs>) {
  const todo = await ctx.table("todos").getX(args._id)
  if (todo.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to delete this todo");
  }
  await todo.delete();
  return true;
}

export async function AssignUser(ctx: zMutationCtx, args: z.infer<typeof types.AssignUserArgs>) {
  const todo = await ctx.table("todos").getX(args.todoId);
  if (todo.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to assign users to this todo");
  }

  const existing = await ctx.table("todoAssignedUsers", "todoId_userId", (q) =>
    q.eq("todoId", args.todoId).eq("userId", args.userId)
  ).unique();

  if (existing) {
    throw new Error("User is already assigned to this todo");
  }

  const assignment = await ctx.table("todoAssignedUsers").insert({
    todoId: args.todoId,
    userId: args.userId,
    assignedBy: ctx.identity.userId,
  });
  return assignment;
}

export async function UnassignUser(ctx: zMutationCtx, args: z.infer<typeof types.UnassignUserArgs>) {
  const todo = await ctx.table("todos").getX(args.todoId);
  if (todo.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to unassign users from this todo");
  }

  const assignment = await ctx.table("todoAssignedUsers", "todoId_userId", (q) =>
    q.eq("todoId", args.todoId).eq("userId", args.userId)
  ).unique();

  if (!assignment) {
    throw new Error("User is not assigned to this todo");
  }

  await assignment.delete();
  return true;
}

export async function ListAssignedTodos(ctx: zQueryCtx, args: z.infer<typeof types.ListAssignedTodosArgs>) {
  const userId = args.userId ?? ctx.identity.userId;

  const assignments = await ctx.table("todoAssignedUsers", "userId", (q) =>
    q.eq("userId", userId)
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
