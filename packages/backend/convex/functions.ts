import { entsTableFactory } from "convex-ents";
import { zCustomAction, zCustomMutation, zCustomQuery, type ZCustomCtx } from "convex-helpers/server/zod4";
import {
  internalMutation as baseInternalMutation,
  internalQuery as baseInternalQuery,
  mutation as baseMutation,
  query as baseQuery,
  action as baseAction,
  internalAction as baseInternalAction,
} from "./_generated/server";
import { entDefinitions } from "./schema";
import { v, Infer } from "convex/values";

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
    const parsedIdentity: Infer<typeof baseIdentity> = {
      userId: identity?.userId as string,
      activeOrganizationId: identity?.activeOrganizationId as string,
      activeTeamId: identity?.activeTeamId as string,
      organizationRole: identity?.organizationRole as string,
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
    const parsedIdentity: Infer<typeof baseIdentity> = {
      userId: identity?.userId as string,
      activeOrganizationId: identity?.activeOrganizationId as string,
      activeTeamId: identity?.activeTeamId as string,
      organizationRole: identity?.organizationRole as string,
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
    const parsedIdentity: Infer<typeof baseIdentity> = {
      userId: identity?.userId as string,
      activeOrganizationId: identity?.activeOrganizationId as string,
      activeTeamId: identity?.activeTeamId as string,
      organizationRole: identity?.organizationRole as string,
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
