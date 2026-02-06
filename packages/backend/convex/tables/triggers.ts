import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";

export const triggerStatusSchema = z.enum(["active", "paused", "error"]);

export const triggersZodSchema = {
  // Org that owns the trigger definition.
  organizationId: z.string(),
  // Optional team scoping within the org.
  teamId: z.string().optional(),
  // Member that created/owns this trigger.
  memberId: z.string(),
  // Human-friendly name shown in UI.
  name: z.string(),
  // Integration/provider key (e.g. "slack", "github").
  provider: z.string(),
  // Event identifier within the provider (e.g. "message.created").
  eventKey: z.string(),
  // Unique key used in webhook URLs to route inbound events.
  webhookKey: z.string(),
  // Runtime status for enabling/disabling processing.
  status: triggerStatusSchema,
  // Provider-specific config JSON (stored as string).
  configJson: z.string(),
  // Updated timestamp (ms epoch).
  updatedAt: z.number(),
};

export const triggersFields = zodToConvexFields(triggersZodSchema);

export const Triggers = Table("triggers", triggersFields);

export const systemFields = Triggers.systemFields;
export const zSystemFields = convexToZodFields(systemFields);

export const triggersWithSystemFields = {
  ...triggersZodSchema,
  ...zSystemFields,
};

const triggersTable = Triggers.table
  .index("organizationId", ["organizationId", "updatedAt"])
  .index("organizationId_provider", ["organizationId", "provider", "updatedAt"])
  .index("organizationId_eventKey", ["organizationId", "eventKey", "updatedAt"])
  .index("webhookKey", ["webhookKey"]);

export const triggersEnt = defineEntFromTable(triggersTable);
