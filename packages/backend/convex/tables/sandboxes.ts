import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";
import type { Trigger } from "convex-helpers/server/triggers";
import type { GenericMutationCtx } from "convex/server";
import { internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";

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
  .index("userId", ["userId"])
  .searchIndex("name", {
    searchField: "name",
    filterFields: ["organizationId", "userId"],
  });

// 1:many relationship - one sandbox has many chats
export const sandboxesEnt = defineEntFromTable(sandboxesTable)
  .edges("chats", { to: "chats", ref: "sandboxId" });

type MutationCtx = GenericMutationCtx<DataModel>;

export const sandboxDaytonaTrigger: Trigger<MutationCtx, DataModel, "sandboxes"> = async (ctx, change) => {
  if (change.operation === "insert") {
    await ctx.scheduler.runAfter(0, internal.sandboxes.nodeFunctions.provision, {
      sandboxId: change.id,
    });
    return;
  }

  if (change.operation === "delete") {
    await ctx.scheduler.runAfter(0, internal.sandboxes.nodeFunctions.destroy, {
      sandboxId: change.id,
    });
  }
};
