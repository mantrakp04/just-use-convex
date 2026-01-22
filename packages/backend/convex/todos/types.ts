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

// Filter schema - inferred from Todo, omitting org-level fields
const TodoFilters = z.object(
  Object.fromEntries(
    Object.entries(Todo.omit({ organizationId: true }).shape).map(([k, v]) => [
      k,
      v instanceof z.ZodDefault ? v.removeDefault() : v,
    ])
  )
).partial();

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