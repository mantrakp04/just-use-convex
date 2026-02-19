import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";
import { sandboxesWithSystemFields } from "./sandboxes";
import { executionStatusSchema } from "./shared";

export const chatsZodSchema = {
  organizationId: z.string(),
  memberId: z.string(),
  title: z.string(),
  isPinned: z.boolean(),
  updatedAt: z.number(),
  sandboxId: sandboxesWithSystemFields._id.optional(),
  executionStatus: executionStatusSchema.optional(), // optional only for query filters to avoid a force filter, but set as idle by default
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
  .index("organizationId_memberId_isPinned_executionStatus", ["organizationId", "memberId", "isPinned", "executionStatus", "updatedAt"])
  .index("organizationId", ["organizationId", "updatedAt"])
  .index("memberId", ["memberId"])
  .searchIndex("title", {
    searchField: "title",
    filterFields: ["organizationId", "memberId", "isPinned", "executionStatus"],
  });

// Many chats belong to one sandbox (optional relationship)
export const chatsEnt = defineEntFromTable(chatsTable)
  .edge("sandbox", { to: "sandboxes", field: "sandboxId", optional: true });
