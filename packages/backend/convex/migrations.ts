import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";

export const migrations = new Migrations<DataModel>(components.migrations);

export const run = migrations.runner();

export const addIsPinnedToChats = migrations.define({
  table: "chats",
  migrateOne: async (ctx, chat) => {
    if ((chat as Record<string, unknown>).isPinned === undefined) {
      await ctx.db.patch(chat._id, { isPinned: false });
    }
  },
});

export const addMemberIdToChats = migrations.define({
  table: "chats",
  migrateOne: async (ctx, chat) => {
    const rawChat = chat as Record<string, unknown>;
    if (typeof rawChat.memberId === "string") {
      return;
    }

    const legacyUserId = rawChat.userId;
    if (typeof legacyUserId !== "string") {
      return;
    }

    const member = await (ctx.db as any)
      .query("member")
      .filter((q: any) =>
        q.and(
          q.eq(q.field("organizationId"), chat.organizationId),
          q.eq(q.field("userId"), legacyUserId)
        )
      )
      .first();

    if (member) {
      await ctx.db.patch(chat._id, { memberId: member._id });
    }
  },
});

export const addMemberIdToTodos = migrations.define({
  table: "todos",
  migrateOne: async (ctx, todo) => {
    const rawTodo = todo as Record<string, unknown>;
    if (typeof rawTodo.memberId === "string") {
      return;
    }

    const legacyUserId = rawTodo.userId;
    if (typeof legacyUserId !== "string") {
      return;
    }

    const member = await (ctx.db as any)
      .query("member")
      .filter((q: any) =>
        q.and(
          q.eq(q.field("organizationId"), todo.organizationId),
          q.eq(q.field("userId"), legacyUserId)
        )
      )
      .first();

    if (member) {
      await ctx.db.patch(todo._id, { memberId: member._id });
    }
  },
});
