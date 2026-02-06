import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";
import { actionsWithSystemFields } from "./actions";
import { chatsWithSystemFields } from "./chats";
import { triggersWithSystemFields } from "./triggers";

export const workflowRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "canceled"]);

export const workflowRunsZodSchema = {
  // Org that owns the workflow run.
  organizationId: z.string(),
  // Optional team scoping within the org.
  teamId: z.string().optional(),
  // Trigger that started the workflow.
  triggerId: triggersWithSystemFields._id.optional(),
  // Chat associated with the run (if applicable).
  chatId: chatsWithSystemFields._id.optional(),
  // Action executed by the workflow (if applicable).
  actionId: actionsWithSystemFields._id.optional(),
  // Current status of the run.
  status: workflowRunStatusSchema,
  // Payload snapshot or runtime metadata (stored as string).
  payloadJson: z.string(),
  // When the run started (ms epoch).
  startedAt: z.number().optional(),
  // When the run finished (ms epoch).
  finishedAt: z.number().optional(),
  // Last update timestamp (ms epoch).
  updatedAt: z.number(),
};

export const workflowRunsFields = zodToConvexFields(workflowRunsZodSchema);

export const WorkflowRuns = Table("workflowRuns", workflowRunsFields);

export const systemFields = WorkflowRuns.systemFields;
export const zSystemFields = convexToZodFields(systemFields);

export const workflowRunsWithSystemFields = {
  ...workflowRunsZodSchema,
  ...zSystemFields,
};

const workflowRunsTable = WorkflowRuns.table
  .index("organizationId", ["organizationId", "updatedAt"])
  .index("triggerId", ["triggerId", "updatedAt"])
  .index("chatId", ["chatId", "updatedAt"])
  .index("actionId", ["actionId", "updatedAt"])
  .index("organizationId_status", ["organizationId", "status", "updatedAt"]);

export const workflowRunsEnt = defineEntFromTable(workflowRunsTable)
  .edge("trigger", { to: "triggers", field: "triggerId", optional: true })
  .edge("chat", { to: "chats", field: "chatId", optional: true })
  .edge("action", { to: "actions", field: "actionId", optional: true });
