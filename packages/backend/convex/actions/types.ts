import { z } from "zod";
import { actionsZodSchema, actionsWithSystemFields } from "../tables/actions";
import { workflowRunsWithSystemFields } from "../tables/workflowRuns";
import { chatsWithSystemFields } from "../tables/chats";
import { paginationOptsValidator } from "convex/server";
import { convexToZod } from "convex-helpers/server/zod4";

const zPaginationOpts = convexToZod(paginationOptsValidator);

export const Action = z.object(actionsZodSchema);
export const ActionWithSystemFields = z.object(actionsWithSystemFields);

export const statusSchema = actionsZodSchema.status;
export type ActionStatus = z.infer<typeof statusSchema>;

const ActionFilters = z.object({
  name: z.string(),
  provider: z.string(),
  actionKey: z.string(),
  status: statusSchema,
  teamId: z.string(),
  updatedAt: z.number(),
}).partial();

export const ListArgs = z.object({
  filters: ActionFilters,
  paginationOpts: zPaginationOpts,
});

export const GetArgs = ActionWithSystemFields.pick({ _id: true });

export const CreateArgs = z.object({
  data: Action.omit({ organizationId: true, memberId: true, updatedAt: true }),
});

export const UpdateArgs = ActionWithSystemFields.pick({ _id: true }).extend({
  patch: Action.omit({ organizationId: true, memberId: true, updatedAt: true }).partial(),
});

export const DeleteArgs = ActionWithSystemFields.pick({ _id: true });

export const StartWorkflowRunArgs = z.object({
  workflowRunId: workflowRunsWithSystemFields._id,
  chatId: chatsWithSystemFields._id,
});
