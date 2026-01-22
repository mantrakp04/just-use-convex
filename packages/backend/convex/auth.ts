import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { organization } from "better-auth/plugins";

import type { DataModel } from "./_generated/dataModel";
import { ac, roles } from "./shared/auth-shared";
import { components } from "./_generated/api";
import { internalAction, query } from "./_generated/server";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3001";

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: {
      schema: authSchema,
    },
  }
);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  return {
    baseURL: siteUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      convex({
        authConfig,
        jwks: process.env.JWKS,
        jwksRotateOnTokenGenerationError: true,
      }),
      organization({
        ac,
        roles,
        allowUserToCreateOrganization: true,
        creatorRole: "owner",
        invitationExpiresIn: 48 * 60 * 60, // 48 hours
        teams: {
          enabled: true,
        },
        
        organizationHooks: {
          afterCreateOrganization: async ({ organization: _organization, user: _user }) => {
            // TODO: Add logic after organization creation
          },
          afterAddMember: async ({ member: _member, organization: _organization, user: _user }) => {
            // TODO: Add logic after member is added
          },
          afterRemoveMember: async ({ member: _member }) => {
            // TODO: Add logic after member is removed
          },
          afterCreateTeam: async ({ team: _team, organization: _organization }) => {
            // TODO: Add logic after team creation
          },
          afterDeleteTeam: async ({ team: _team }) => {
            // TODO: Add logic after team deletion
          },
          afterAddTeamMember: async ({ team: _team, teamMember: _teamMember }) => {
            // TODO: Add logic after team member is added
          },
          afterRemoveTeamMember: async ({ teamMember: _teamMember }) => {
            // TODO: Add logic after team member is removed
          },
          afterAcceptInvitation: async ({ member: _member, organization: _organization, user: _user }) => {
            // TODO: Add logic after invitation is accepted
          },
          afterUpdateMemberRole: async ({ member: _member, previousRole: _previousRole }) => {
            // TODO: Add logic after member role is updated
          },
          beforeDeleteOrganization: async ({ organization: _organization }) => {
            // TODO: Add logic before organization deletion
          },
          afterDeleteOrganization: async ({ organization: _organization }) => {
            // TODO: Add logic after organization deletion
          },
        }
      })
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (_user) => {
            // TODO: Add logic after user creation
          },
        },
        delete: {
          after: async (_user) => {
            // TODO: Add logic after user deletion
          },
        },
      },
      session: {
        create: {
          before: async (_session) => {
            // TODO: Add logic before session creation
          },
        },
      },
    }
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};

export const { getAuthUser } = authComponent.clientApi(); 

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.safeGetAuthUser(ctx);
  },
});

export const getLatestJwks = internalAction({
  args: {},
  handler: async (ctx) => {
    const auth = createAuth(ctx);
    // This method is added by the Convex Better Auth plugin and is
    // available via `auth.api` only, not exposed as a route.
    return await auth.api.getLatestJwks();
  },
});