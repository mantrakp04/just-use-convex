import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";

export const sandboxesZodSchema = {
  organizationId: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  updatedAt: z.number(),
};

export const sandboxesFields = zodToConvexFields(sandboxesZodSchema);

export const Sandboxes = Table("sandboxes", sandboxesFields);

export const systemFields = Sandboxes.systemFields;
export const zSystemFields = convexToZodFields(systemFields);

export const sandboxesWithSystemFields = {
  ...sandboxesZodSchema,
  ...zSystemFields,
};

const sandboxesTable = Sandboxes.table
  .index("organizationId_userId", ["organizationId", "userId", "updatedAt"])
  .index("organizationId", ["organizationId", "updatedAt"])
  .index("userId", ["userId"]);

// 1:many relationship - one sandbox has many chats
export const sandboxesEnt = defineEntFromTable(sandboxesTable)
  .edges("chats", { to: "chats", ref: "sandboxId" });
