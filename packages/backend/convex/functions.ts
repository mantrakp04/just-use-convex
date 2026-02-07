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
import { allAttachmentAggregates } from "./attachments/aggregates";
import { sandboxDaytonaTrigger } from "./tables/sandboxes";
import { env } from "@just-use-convex/env/backend";

const EXTERNAL_TOKEN = env.EXTERNAL_TOKEN;

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

// Register lifecycle trigger for Daytona sandbox provisioning/cleanup
triggers.register("sandboxes", sandboxDaytonaTrigger);

// Register all aggregate triggers for orgMemberAttachments table
for (const aggregate of allAttachmentAggregates) {
  triggers.register("orgMemberAttachments", aggregate.trigger());
}

// Wrap base mutations with triggers
const baseMutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
const baseInternalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));

export const baseIdentity = v.object({
  userId: v.string(),
  activeOrganizationId: v.string(),
  organizationRole: v.string(),
  memberId: v.string(),
  activeTeamId: v.optional(v.string()),
});

export const externalFields = v.object({
  externalToken: v.string(),
  ...baseIdentity.fields,
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
      memberId: identity.memberId as string,
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
export const zExternalQuery = zCustomQuery(baseQuery, {
  args: externalFields.fields,
  input: async (ctx, args) => {
    if (args.externalToken !== EXTERNAL_TOKEN) {
      throw new Error("Unauthorized: Invalid external token");
    }
    return {
      ctx: { ...ctx, table: entsTableFactory(ctx, entDefinitions), identity: args },
      args: {},
    }
  },
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
      memberId: identity.memberId as string,
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
export const zExternalMutation = zCustomMutation(baseMutation, {
  args: externalFields.fields,
  input: async (ctx, args) => {
    if (args.externalToken !== EXTERNAL_TOKEN) {
      throw new Error("Unauthorized: Invalid external token");
    }
    return {
      ctx: { ...ctx, table: entsTableFactory(ctx, entDefinitions), identity: args },
      args: {},
    }
  }
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
      memberId: identity.memberId as string,
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
export const zExternalAction = zCustomAction(baseAction, {
  args: externalFields.fields,
  input: async (ctx, args) => {
    if (args.externalToken !== EXTERNAL_TOKEN) {
      throw new Error("Unauthorized: Invalid external token");
    }
    return {
    ctx: { ...ctx, identity: args },
    args: {},
    }
  },
});

export type zQueryCtx = ZCustomCtx<typeof zQuery>;
export type zInternalQueryCtx = ZCustomCtx<typeof zInternalQuery>;
export type zExternalQueryCtx = ZCustomCtx<typeof zExternalQuery>;
export type zMutationCtx = ZCustomCtx<typeof zMutation>;
export type zInternalMutationCtx = ZCustomCtx<typeof zInternalMutation>;
export type zExternalMutationCtx = ZCustomCtx<typeof zExternalMutation>;
export type zActionCtx = ZCustomCtx<typeof zAction>;
export type zInternalActionCtx = ZCustomCtx<typeof zInternalAction>;
export type zExternalActionCtx = ZCustomCtx<typeof zExternalAction>;
