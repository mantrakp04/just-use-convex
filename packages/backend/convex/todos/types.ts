import { z } from "zod";
import { todosZodSchema, todosWithSystemFields } from "../tables/todos";
import {
  todoAssignedMembersZodSchema,
  todoAssignedMembersWithSystemFields,
} from "../tables/todoAssignedMembers";
import { paginationOptsValidator } from "convex/server";
import { convexToZod } from "convex-helpers/server/zod4";

const zPaginationOpts = convexToZod(paginationOptsValidator);

export const Todo = z.object(todosZodSchema);
export const TodoWithSystemFields = z.object(todosWithSystemFields);

// Inferred types from Zod schemas
export const prioritySchema = todosZodSchema.priority;
export const statusSchema = todosZodSchema.status;
export type Priority = z.infer<typeof prioritySchema>;
export type TodoStatus = z.infer<typeof statusSchema>;

export const TodoAssignedMember = z.object(todoAssignedMembersZodSchema);
export const TodoAssignedMemberWithSystemFields = z.object(todoAssignedMembersWithSystemFields);

// Filter schema - explicit definition for proper type inference
const TodoFilters = z.object({
  memberId: z.string(),
  teamId: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["todo", "in_progress", "done"]),
  dueDate: z.number(),
  dueDateFrom: z.number(),
  dueDateTo: z.number(),
  priority: z.enum(["low", "medium", "high"]),
  updatedAt: z.number(),
  assignedMemberId: z.string(),
}).partial();

export const ListArgs = z.object({
  filters: TodoFilters,
  paginationOpts: zPaginationOpts,
});

export const GetTodoArgs = TodoWithSystemFields.pick({ _id: true });

export const CreateArgs = z.object({
  data: Todo.omit({ organizationId: true, memberId: true, updatedAt: true }),
});

export const UpdateArgs = TodoWithSystemFields.pick({ _id: true }).extend({
  patch: Todo.omit({ organizationId: true, memberId: true, updatedAt: true }).partial(),
});

export const DeleteArgs = TodoWithSystemFields.pick({ _id: true });

export const AssignMemberArgs = z.object({
  todoId: TodoWithSystemFields.shape._id,
  memberId: z.string(),
});

export const UnassignMemberArgs = z.object({
  todoId: TodoWithSystemFields.shape._id,
  memberId: z.string(),
});

export const ListAssignedTodosArgs = z.object({
  memberId: z.string().optional(),
  paginationOpts: zPaginationOpts,
});

export const SearchArgs = z.object({
  query: z.string(),
});