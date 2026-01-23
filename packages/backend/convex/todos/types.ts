import { z } from "zod";
import { todosZodSchema, todosWithSystemFields } from "../tables/todos";
import {
  todoAssignedUsersZodSchema,
  todoAssignedUsersWithSystemFields,
} from "../tables/todoAssignedUsers";
import { paginationOptsValidator } from "convex/server";
import { convexToZod } from "convex-helpers/server/zod4";

const zPaginationOpts = convexToZod(paginationOptsValidator);

export const Todo = z.object(todosZodSchema);
export const TodoWithSystemFields = z.object(todosWithSystemFields);

export const TodoAssignedUser = z.object(todoAssignedUsersZodSchema);
export const TodoAssignedUserWithSystemFields = z.object(todoAssignedUsersWithSystemFields);

// Filter schema - explicit definition for proper type inference
const TodoFilters = z.object({
  userId: z.string(),
  teamId: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["todo", "in_progress", "done"]),
  dueDate: z.number(),
  priority: z.enum(["low", "medium", "high"]),
  updatedAt: z.number(),
  assignedUserId: z.string(),
}).partial();

export const ListArgs = z.object({
  filters: TodoFilters,
  paginationOpts: zPaginationOpts,
});

export const GetTodoArgs = TodoWithSystemFields.pick({ _id: true });

export const CreateArgs = z.object({
  data: Todo.omit({ organizationId: true, userId: true, updatedAt: true }),
});

export const UpdateArgs = TodoWithSystemFields.pick({ _id: true }).extend({
  patch: Todo.omit({ organizationId: true, userId: true, updatedAt: true }).partial(),
});

export const DeleteArgs = TodoWithSystemFields.pick({ _id: true });

export const AssignUserArgs = z.object({
  todoId: TodoWithSystemFields.shape._id,
  userId: z.string(),
});

export const UnassignUserArgs = z.object({
  todoId: TodoWithSystemFields.shape._id,
  userId: z.string(),
});

export const ListAssignedTodosArgs = z.object({
  userId: z.string().optional(),
  paginationOpts: zPaginationOpts,
});