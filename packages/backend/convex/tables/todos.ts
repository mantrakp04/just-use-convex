import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";

export const todosZodSchema = {
  organizationId: z.string(),
  userId: z.string(),
  teamId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  dueDate: z.number().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  updatedAt: z.number(),
};

export const todosFields = zodToConvexFields(todosZodSchema);

export const Todos = Table("todos", todosFields);

export const systemFields = Todos.systemFields;
export const zSystemFields = convexToZodFields(systemFields);

export const todosWithSystemFields = {
  ...todosZodSchema,
  ...zSystemFields,
};

const todosTable = Todos.table
  .index("organizationId_userId", ["organizationId", "userId", "updatedAt"])
  .index("organizationId", ["organizationId", "updatedAt"])
  .index("organizationId_teamId", ["organizationId", "teamId", "updatedAt"])
  .index("userId", ["userId"]);

export const todosEnt = defineEntFromTable(todosTable)
  .edges("assignedUsers", { to: "todoAssignedUsers", ref: "todoId" });
