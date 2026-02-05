import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";

export const actionStatusSchema = z.enum(["active", "paused", "error"]);

export const actionsZodSchema = {
  // Org that owns the action definition.
  organizationId: z.string(),
  // Optional team scoping within the org.
  teamId: z.string().optional(),
  // Member that created/owns this action.
  memberId: z.string(),
  // Human-friendly name shown in UI.
  name: z.string(),
  // Integration/provider key (e.g. "slack", "whatsapp").
  provider: z.string(),
  // Action identifier within the provider (e.g. "message.send").
  actionKey: z.string(),
  // Runtime status for enabling/disabling execution.
  status: actionStatusSchema,
  // Provider-specific config JSON (stored as string).
  configJson: z.string(),
  // Updated timestamp (ms epoch).
  updatedAt: z.number(),
};

export const actionsFields = zodToConvexFields(actionsZodSchema);

export const Actions = Table("actions", actionsFields);

export const systemFields = Actions.systemFields;
export const zSystemFields = convexToZodFields(systemFields);

export const actionsWithSystemFields = {
  ...actionsZodSchema,
  ...zSystemFields,
};

const actionsTable = Actions.table
  .index("organizationId", ["organizationId", "updatedAt"])
  .index("organizationId_provider", ["organizationId", "provider", "updatedAt"])
  .index("organizationId_actionKey", ["organizationId", "actionKey", "updatedAt"]);

export const actionsEnt = defineEntFromTable(actionsTable);
