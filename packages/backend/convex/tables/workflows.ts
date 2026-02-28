import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";
import { sandboxesWithSystemFields } from "./sandboxes";
import { tableNames } from "../lib/schemaTables";

const WORKFLOW_OPERATIONS = ["create", "update", "delete"] as const;

/** Inferred from schema table names + create/update/delete */
export const eventSchema = z.enum(
  tableNames.flatMap((t) =>
    WORKFLOW_OPERATIONS.map((op) => `on_${t}_${op}` as const)
  ) as [string, ...string[]]
);

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

export const actionSchema = z.string();

export const inputModalitySchema = z.enum(["text", "image", "file"]);

export const isolationModeSchema = z.enum(["isolated", "shared"]);

export const workflowsZodSchema = {
  organizationId: z.string(),
  memberId: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  triggerType: triggerTypeSchema,
  trigger: z.string(), // JSON-serialized triggerSchema
  instructions: z.string(),
  actions: z.array(actionSchema),
  model: z.string(),
  inputModalities: z.array(inputModalitySchema),
  isolationMode: isolationModeSchema,
  sandboxId: sandboxesWithSystemFields._id.optional(),
  updatedAt: z.number(),
  lastScheduledAt: z.number().optional(),
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
  .index("organizationId_memberId", ["organizationId", "memberId"])
  .index("organizationId_enabled", ["organizationId", "enabled"])
  .index("organizationId_enabled_triggerType", ["organizationId", "enabled", "triggerType"])
  .index("enabled", ["enabled"])
  .index("enabled_triggerType", ["enabled", "triggerType"])
  .index("enabled_triggerType_updatedAt", ["enabled", "triggerType", "updatedAt"]);

export const workflowsEnt = defineEntFromTable(workflowsTable)
  .edge("sandbox", { to: "sandboxes", field: "sandboxId", optional: true })
  .edges("executions", { to: "workflowExecutions", ref: "workflowId" });
