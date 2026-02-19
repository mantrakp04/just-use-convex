import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";
import { workflowsWithSystemFields } from "./workflows";
import { executionStatusSchema } from "./shared";

export const workflowExecutionsZodSchema = {
  workflowId: workflowsWithSystemFields._id,
  organizationId: z.string(),
  memberId: z.string(),
  status: executionStatusSchema.exclude(["idle"]),
  triggerPayload: z.string().optional(),
  error: z.string().optional(),
  agentOutput: z.string().optional(),
  toolCalls: z.string().optional(), // JSON-serialized array
  startedAt: z.number(),
  completedAt: z.number().optional(),
};

export const workflowExecutionsFields = zodToConvexFields(workflowExecutionsZodSchema);

export const WorkflowExecutions = Table("workflowExecutions", workflowExecutionsFields);

export const systemFields = WorkflowExecutions.systemFields;
export const zSystemFields = convexToZodFields(systemFields);

export const workflowExecutionsWithSystemFields = {
  ...workflowExecutionsZodSchema,
  ...zSystemFields,
};

const workflowExecutionsTable = WorkflowExecutions.table
  .index("workflowId_startedAt", ["workflowId", "startedAt"])
  .index("organizationId_status", ["organizationId", "status", "startedAt"]);

export const workflowExecutionsEnt = defineEntFromTable(workflowExecutionsTable)
  .edge("workflow", { to: "workflows", field: "workflowId" });
