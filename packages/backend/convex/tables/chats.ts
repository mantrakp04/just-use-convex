import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";
import { sandboxesWithSystemFields } from "./sandboxes";

export const chatsZodSchema = {
  organizationId: z.string(),
  userId: z.string(),
  title: z.string(),
  isPinned: z.boolean(),
  updatedAt: z.number(),
  sandboxId: sandboxesWithSystemFields._id.optional(),
};

export const chatsFields = {
  ...zodToConvexFields(chatsZodSchema),
};

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
  .index("userId", ["userId"])
  .searchIndex("title", {
    searchField: "title",
    filterFields: ["organizationId", "userId", "isPinned"],
  });

// Many chats belong to one sandbox (optional relationship)
export const chatsEnt = defineEntFromTable(chatsTable)
  .edge("sandbox", { to: "sandboxes", field: "sandboxId", optional: true });
