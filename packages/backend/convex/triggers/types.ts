import { z } from "zod";
import { triggersZodSchema, triggersWithSystemFields } from "../tables/triggers";
import { paginationOptsValidator } from "convex/server";
import { convexToZod } from "convex-helpers/server/zod4";

const zPaginationOpts = convexToZod(paginationOptsValidator);

export const Trigger = z.object(triggersZodSchema);
export const TriggerWithSystemFields = z.object(triggersWithSystemFields);

export const statusSchema = triggersZodSchema.status;
export type TriggerStatus = z.infer<typeof statusSchema>;

const TriggerFilters = z.object({
  name: z.string(),
  provider: z.string(),
  eventKey: z.string(),
  status: statusSchema,
  teamId: z.string(),
  updatedAt: z.number(),
}).partial();

export const ListArgs = z.object({
  filters: TriggerFilters,
  paginationOpts: zPaginationOpts,
});

export const GetArgs = TriggerWithSystemFields.pick({ _id: true });

export const CreateArgs = z.object({
  data: Trigger.omit({ organizationId: true, memberId: true, updatedAt: true }),
});

export const UpdateArgs = TriggerWithSystemFields.pick({ _id: true }).extend({
  patch: Trigger.omit({ organizationId: true, memberId: true, updatedAt: true }).partial(),
});

export const DeleteArgs = TriggerWithSystemFields.pick({ _id: true });
