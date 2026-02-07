import { z } from "zod";
import { sandboxesZodSchema, sandboxesWithSystemFields } from "../tables/sandboxes";
import { paginationOptsValidator } from "convex/server";
import { convexToZod, zid } from "convex-helpers/server/zod4";

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

// Search args
export const SearchArgs = z.object({
  query: z.string(),
  paginationOpts: zPaginationOpts,
});

export const CreateChatSshAccessArgs = z.object({
  chatId: zid("chats"),
  expiresInMinutes: z.number().min(1).max(1440).optional(),
});

export const CreateChatPreviewAccessArgs = z.object({
  chatId: zid("chats"),
  previewPort: z.number().min(1).max(65535).default(3000),
}); 

export const CreateChatSshAccessResult = z.object({
  chatId: zid("chats"),
  sandboxId: zid("sandboxes"),
  sandboxName: z.string(),
  ssh: z.object({
    token: z.string(),
    expiresAt: z.number(),
    expiresInMinutes: z.number(),
    host: z.string(),
    command: z.string(),
  }),
  explorer: z.object({
    path: z.string(),
    entries: z.array(z.object({
      name: z.string(),
      path: z.string(),
      isDir: z.boolean(),
      size: z.number(),
      modifiedAt: z.number(),
    })),
  }),
});

export const CreateChatPreviewAccessResult = z.object({
  chatId: zid("chats"),
  sandboxId: zid("sandboxes"),
  sandboxName: z.string(),
  preview: z.object({
    port: z.number(),
    url: z.string(),
    token: z.string().nullable(),
  }),
});