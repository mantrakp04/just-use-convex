import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { zodToConvexFields } from "convex-helpers/server/zod4";

export const todosZodSchema = {
  organizationId: z.string(),
  userId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  completed: z.boolean().default(false),
  dueDate: z.number().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  updatedAt: z.number(),
};

export const todosFields = zodToConvexFields(todosZodSchema);

export const Todos = Table("todos", todosFields);

const todosTable = Todos.table
  .index("organizationId_userId", ["organizationId", "userId"])
  .index("organizationId", ["organizationId"])
  .index("userId", ["userId"]);

export const todosEnt = defineEntFromTable(todosTable);
