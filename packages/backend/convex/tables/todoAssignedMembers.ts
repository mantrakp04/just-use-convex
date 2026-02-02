import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";
import { v } from "convex/values";

export const todoAssignedMembersZodSchema = {
  memberId: z.string(),
  assignedByMemberId: z.string(),
};

export const todoAssignedMembersFields = {
  ...zodToConvexFields(todoAssignedMembersZodSchema),
  todoId: v.id("todos"),
};

export const TodoAssignedMembers = Table("todoAssignedMembers", todoAssignedMembersFields);

const systemFields = TodoAssignedMembers.systemFields;
const zSystemFields = convexToZodFields(systemFields);

export const todoAssignedMembersWithSystemFields = {
  ...todoAssignedMembersZodSchema,
  ...zSystemFields,
};

const todoAssignedMembersTable = TodoAssignedMembers.table
  .index("memberId", ["memberId"])
  .index("todoId_memberId", ["todoId", "memberId"]);

export const todoAssignedMembersEnt = defineEntFromTable(todoAssignedMembersTable)
  .edge("todo", { to: "todos", field: "todoId" });
