import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";

export const chatsZodSchema = {
  organizationId: z.string(),
  userId: z.string(),
  title: z.string(),
  isPinned: z.boolean(),
  updatedAt: z.number(),
};

export const chatsFields = zodToConvexFields(chatsZodSchema);

export const Chats = Table("chats", chatsFields);

export const systemFields = Chats.systemFields;
export const zSystemFields = convexToZodFields(systemFields);

export const chatsWithSystemFields = {
  ...chatsZodSchema,
  ...zSystemFields,
};

const chatsTable = Chats.table
  .index("organizationId_userId_isPinned", ["organizationId", "userId", "isPinned", "updatedAt"])
  .index("organizationId", ["organizationId", "updatedAt"])
  .index("userId", ["userId"]);

export const chatsEnt = defineEntFromTable(chatsTable);
