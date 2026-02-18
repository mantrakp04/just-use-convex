import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";

export const todoTimeMetadataZodSchema = {
  dueDate: z.number().nullable().optional(),
  startTime: z.number().nullable().optional(),
  endTime: z.number().nullable().optional(),
  updatedAt: z.number(),
};

export const todosZodSchema = {
  organizationId: z.string(),
  memberId: z.string(),
  teamId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  ...todoTimeMetadataZodSchema,
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
  .index("organizationId_memberId", ["organizationId", "memberId", "updatedAt"])
  .index("organizationId", ["organizationId", "updatedAt"])
  .index("organizationId_teamId", ["organizationId", "teamId", "updatedAt"])
  .index("memberId", ["memberId"]);

export const todosEnt = defineEntFromTable(todosTable)
  .edges("assignedMembers", { to: "todoAssignedMembers", ref: "todoId" })
  .edge("content", { to: "todosContent", ref: "todoId" });
