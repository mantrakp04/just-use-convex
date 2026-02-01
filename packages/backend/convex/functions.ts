import { entsTableFactory } from "convex-ents";
import { zCustomAction, zCustomMutation, zCustomQuery, type ZCustomCtx } from "convex-helpers/server/zod4";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import {
  internalMutation as rawInternalMutation,
  internalQuery as baseInternalQuery,
  mutation as rawMutation,
  query as baseQuery,
  action as baseAction,
  internalAction as baseInternalAction,
} from "./_generated/server";
import { entDefinitions } from "./schema";
import type { DataModel } from "./_generated/dataModel";
import { v, type Infer } from "convex/values";
import { allTodoAggregates } from "./todos/aggregates";
import { allChatAggregates } from "./chats/aggregates";
import { allSandboxAggregates } from "./sandboxes/aggregates";

const triggers = new Triggers<DataModel>();

// Register all aggregate triggers for todos table
for (const aggregate of allTodoAggregates) {
  triggers.register("todos", aggregate.trigger());
}

// Register all aggregate triggers for chats table
for (const aggregate of allChatAggregates) {
  triggers.register("chats", aggregate.trigger());
}

// Register all aggregate triggers for sandboxes table
for (const aggregate of allSandboxAggregates) {
  triggers.register("sandboxes", aggregate.trigger());
}

// Wrap base mutations with triggers
const baseMutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
const baseInternalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));

export const baseIdentity = v.object({
  userId: v.string(),
  activeOrganizationId: v.string(),
  activeTeamId: v.optional(v.string()),
  organizationRole: v.string(),
});

export const zQuery = zCustomQuery(baseQuery, {
  args: {},
  input: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject || !identity?.activeOrganizationId) {
      throw new Error("Unauthorized: User must be authenticated with an active organization");
    }
    const parsedIdentity: Infer<typeof baseIdentity> = {
      userId: identity.subject,
      activeOrganizationId: identity.activeOrganizationId as string,
      activeTeamId: identity.activeTeamId as string | undefined,
      organizationRole: identity.organizationRole as string,
    };
    return {
      ctx: { ...ctx, table: entsTableFactory(ctx, entDefinitions), identity: parsedIdentity },
      args: {},
    }
  },
});
export const zInternalQuery = zCustomQuery(baseInternalQuery, {
  args: baseIdentity.fields,
  input: async (ctx, args) => ({
    ctx: { ...ctx, table: entsTableFactory(ctx, entDefinitions), identity: args },
    args: {},
  }),
});

export const zMutation = zCustomMutation(baseMutation, {
  args: {},
  input: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject || !identity?.activeOrganizationId) {
      throw new Error("Unauthorized: User must be authenticated with an active organization");
    }
    const parsedIdentity: Infer<typeof baseIdentity> = {
      userId: identity.subject,
      activeOrganizationId: identity.activeOrganizationId as string,
      activeTeamId: identity.activeTeamId as string | undefined,
      organizationRole: identity.organizationRole as string,
    };
    return {
      ctx: { ...ctx, table: entsTableFactory(ctx, entDefinitions), identity: parsedIdentity },
      args: {},
    }
  },
});
export const zInternalMutation = zCustomMutation(baseInternalMutation, {
  args: baseIdentity.fields,
  input: async (ctx, args) => {
    return {
      ctx: { ...ctx, table: entsTableFactory(ctx, entDefinitions), identity: args },
      args: {},
    }
  },
});

export const zAction = zCustomAction(baseAction, {
  args: {},
  input: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject || !identity?.activeOrganizationId) {
      throw new Error("Unauthorized: User must be authenticated with an active organization");
    }
    const parsedIdentity: Infer<typeof baseIdentity> = {
      userId: identity.subject,
      activeOrganizationId: identity.activeOrganizationId as string,
      activeTeamId: identity.activeTeamId as string | undefined,
      organizationRole: identity.organizationRole as string,
    };
    return {
      ctx: { ...ctx, identity: parsedIdentity },
      args: {},
    }
  },
});
export const zInternalAction = zCustomAction(baseInternalAction, {
  args: baseIdentity.fields,
  input: async (ctx, args) => {
    return {
      ctx: { ...ctx, identity: args },
      args: {},
    }
  },
});

export type zQueryCtx = ZCustomCtx<typeof zQuery>;
export type zInternalQueryCtx = ZCustomCtx<typeof zInternalQuery>;
export type zMutationCtx = ZCustomCtx<typeof zMutation>;
export type zInternalMutationCtx = ZCustomCtx<typeof zInternalMutation>;
export type zActionCtx = ZCustomCtx<typeof zAction>;
export type zInternalActionCtx = ZCustomCtx<typeof zInternalAction>;
