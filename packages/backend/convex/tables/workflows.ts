import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";
import { sandboxesWithSystemFields } from "./sandboxes";

export const eventSchema = z.enum([
  "on_chat_create",
  "on_chat_delete",
  "on_sandbox_provision",
  "on_sandbox_delete",
  "on_todo_create",
  "on_todo_complete",
]);

export const triggerTypeSchema = z.enum([
  "webhook",
  "schedule",
  "event",
]);

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("webhook"),
    secret: z.string(),
  }),
  z.object({
    type: z.literal("schedule"),
    cron: z.string(),
  }),
  z.object({
    type: z.literal("event"),
    event: eventSchema,
  }),
]);

export const allowedActionSchema = z.enum([
  "send_message",
  "http_request",
  "notify",
]);

export const workflowsZodSchema = {
  organizationId: z.string(),
  memberId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  triggerType: triggerTypeSchema,
  trigger: z.string(), // JSON-serialized triggerSchema
  instructions: z.string(),
  allowedActions: z.array(allowedActionSchema),
  model: z.string().optional(),
  sandboxId: sandboxesWithSystemFields._id.optional(),
  updatedAt: z.number(),
};

export const workflowsFields = zodToConvexFields(workflowsZodSchema);

export const Workflows = Table("workflows", workflowsFields);

export const systemFields = Workflows.systemFields;
export const zSystemFields = convexToZodFields(systemFields);

export const workflowsWithSystemFields = {
  ...workflowsZodSchema,
  ...zSystemFields,
};

const workflowsTable = Workflows.table
  .index("organizationId_memberId", ["organizationId", "memberId", "updatedAt"])
  .index("organizationId_enabled", ["organizationId", "enabled"])
  .index("organizationId_enabled_triggerType", ["organizationId", "enabled", "triggerType"])
  .index("enabled", ["enabled"])
  .index("enabled_triggerType", ["enabled", "triggerType"]);

export const workflowsEnt = defineEntFromTable(workflowsTable)
  .edge("sandbox", { to: "sandboxes", field: "sandboxId", optional: true })
  .edges("executions", { to: "workflowExecutions", ref: "workflowId" });
