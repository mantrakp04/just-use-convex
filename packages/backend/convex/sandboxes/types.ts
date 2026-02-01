import { z } from "zod";
import { sandboxesZodSchema, sandboxesWithSystemFields } from "../tables/sandboxes";
import { paginationOptsValidator } from "convex/server";
import { convexToZod } from "convex-helpers/server/zod4";

const zPaginationOpts = convexToZod(paginationOptsValidator);

export const Sandbox = z.object(sandboxesZodSchema);
export const SandboxWithSystemFields = z.object(sandboxesWithSystemFields);

// Filter schema
const SandboxFilters = z.object({
  name: z.string(),
}).partial();

export const ListArgs = z.object({
  filters: SandboxFilters,
  paginationOpts: zPaginationOpts,
});

export const GetArgs = SandboxWithSystemFields.pick({ _id: true });

export const CreateArgs = z.object({
  data: Sandbox.pick({ name: true, description: true }).partial({ description: true }),
});

export const UpdateArgs = SandboxWithSystemFields.pick({ _id: true }).extend({
  patch: Sandbox.pick({ name: true, description: true }).partial(),
});

export const DeleteArgs = SandboxWithSystemFields.pick({ _id: true });

// For getting chats by sandbox
export const GetChatsArgs = SandboxWithSystemFields.pick({ _id: true }).extend({
  paginationOpts: zPaginationOpts,
});
