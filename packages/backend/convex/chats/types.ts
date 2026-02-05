import { z } from "zod";
import { chatsZodSchema, chatsWithSystemFields } from "../tables/chats";
import { paginationOptsValidator } from "convex/server";
import { convexToZod } from "convex-helpers/server/zod4";

const zPaginationOpts = convexToZod(paginationOptsValidator);

export const Chat = z.object(chatsZodSchema);
export const ChatWithSystemFields = z.object(chatsWithSystemFields);

// Filter schema
const ChatFilters = z.object({
  memberId: z.string(),
  title: z.string(),
}).partial().extend({
  isPinned: z.boolean().default(false),
});

export const ListArgs = z.object({
  filters: ChatFilters,
  paginationOpts: zPaginationOpts,
});

export const GetChatArgs = ChatWithSystemFields.pick({ _id: true });

export const CreateArgs = z.object({
  data: Chat.pick({ title: true, sandboxId: true }),
});

export const UpdateArgs = ChatWithSystemFields.pick({ _id: true }).extend({
  patch: Chat.pick({ title: true, isPinned: true }).partial(),
});

export const DeleteArgs = ChatWithSystemFields.pick({ _id: true });

// Search args
export const SearchArgs = z.object({
  query: z.string(),
  isPinned: z.boolean().default(false),
  paginationOpts: zPaginationOpts,
});
