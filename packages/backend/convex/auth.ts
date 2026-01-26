import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { organization } from "better-auth/plugins";
import type { GenericActionCtx, GenericMutationCtx } from "convex/server";

import type { DataModel } from "./_generated/dataModel";
import { ac, roles } from "./shared/auth_shared";
import { components } from "./_generated/api";
import { internalAction, query } from "./_generated/server";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";

type RunMutationCtx = (GenericMutationCtx<DataModel> | GenericActionCtx<DataModel>) & {
  runMutation: GenericMutationCtx<DataModel>["runMutation"];
};

const isRunMutationCtx = (ctx: GenericCtx<DataModel>): ctx is RunMutationCtx => {
  return "runMutation" in ctx;
};

const siteUrl = process.env.SITE_URL ?? "http://localhost:3001";
const agentUrl = process.env.AGENT_URL ?? "http://localhost:1337";

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
    trustedOrigins: [siteUrl, agentUrl],
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
        jwt: {
          // Include session fields in the JWT payload so Convex can access them via getUserIdentity
          definePayload: ({ user, session }) => ({
            // User fields (standard)
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            // Session fields for organization context
            activeOrganizationId: session.activeOrganizationId,
            activeTeamId: session.activeTeamId,
            organizationRole: session.organizationRole,
          }),
        },
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
          afterCreateOrganization: async ({ organization: _organization, member: _member, user: _user }) => {
            // Session updates are handled by the session.update.before hook
            // when setActive is called from the client
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
          after: async (user) => {
            if (!isRunMutationCtx(ctx)) return;

            // Create a personal organization for the user
            const slug = user.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();
            const now = Date.now();

            // Create the organization
            const org = await ctx.runMutation(
              components.betterAuth.adapter.create,
              {
                input: {
                  model: "organization",
                  data: {
                    name: `${user.name}'s Organization`,
                    slug,
                    createdAt: now,
                  },
                },
              }
            );

            // Add user as owner member
            await ctx.runMutation(
              components.betterAuth.adapter.create,
              {
                input: {
                  model: "member",
                  data: {
                    organizationId: org._id,
                    userId: user.id,
                    role: "owner",
                    createdAt: now,
                  },
                },
              }
            );

            // Create a team
            const team = await ctx.runMutation(
              components.betterAuth.adapter.create,
              {
                input: {
                  model: "team",
                  data: {
                    name: `${user.name}'s Team`,
                    organizationId: org._id,
                    createdAt: now,
                  },
                },
              }
            );

            // Add user as team member
            await ctx.runMutation(
              components.betterAuth.adapter.create,
              {
                input: {
                  model: "teamMember",
                  data: {
                    teamId: team._id,
                    userId: user.id,
                    createdAt: now,
                  },
                },
              }
            );

            // Set as active organization
            await ctx.runMutation(
              components.betterAuth.adapter.updateOne,
              {
                input: {
                  model: "user",
                  where: [{ field: "_id", operator: "eq", value: user.id }],
                  update: {
                    activeOrganizationId: org._id,
                    activeTeamId: team._id,
                    updatedAt: now,
                  },
                },
              }
            );

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
          before: async (session) => {
            const userResult = await ctx.runQuery(
              components.betterAuth.adapter.findOne,
              {
                model: "user",
                where: [{ field: "_id", operator: "eq", value: session.userId }],
              }
            );

            if (userResult) {

              // fetch the user member for the active organization
              const userMemberResult = userResult.activeOrganizationId
                ? await ctx.runQuery(
                    components.betterAuth.adapter.findOne,
                    {
                      model: "member",
                      where: [
                        { field: "userId", operator: "eq", value: userResult._id },
                        { field: "organizationId", operator: "eq", value: userResult.activeOrganizationId, connector: "AND" },
                      ],
                    }
                  )
                : null;

              const sessionData = {
                ...session,
                activeOrganizationId: userResult.activeOrganizationId ?? null,
                activeTeamId: userResult.activeTeamId ?? null,
                organizationRole: userMemberResult?.role ?? null,
              };
              
              return { data: sessionData };
            }
            return { data: session };
          },
        },
        update: {
          before: async (session, hookCtx) => {
            // When activeOrganizationId changes (e.g., via setActive), update related fields
            const activeOrgId = session.activeOrganizationId;
            // The context structure is: context.session.session.userId or context.session.user.id
            const context = hookCtx?.context as {
              session?: {
                session?: { userId?: string };
                user?: { id?: string };
              };
            } | undefined;
            const userId = context?.session?.session?.userId ?? context?.session?.user?.id;

            if (activeOrgId && typeof activeOrgId === "string" && userId) {
              // Find the team for this organization
              const team = await ctx.runQuery(
                components.betterAuth.adapter.findOne,
                {
                  model: "team",
                  where: [{ field: "organizationId", operator: "eq", value: activeOrgId }],
                }
              );

              // Find the member role for this user in this organization
              const member = await ctx.runQuery(
                components.betterAuth.adapter.findOne,
                {
                  model: "member",
                  where: [
                    { field: "organizationId", operator: "eq", value: activeOrgId },
                    { field: "userId", operator: "eq", value: userId, connector: "AND" },
                  ],
                }
              );

              // Persist the user's organization preference so it survives across sessions
              if (isRunMutationCtx(ctx)) {
                await ctx.runMutation(
                  components.betterAuth.adapter.updateOne,
                  {
                    input: {
                      model: "user",
                      where: [{ field: "_id", operator: "eq", value: userId }],
                      update: {
                        activeOrganizationId: activeOrgId,
                        activeTeamId: team?._id ?? null,
                        updatedAt: Date.now(),
                      },
                    },
                  }
                );
              }

              return {
                data: {
                  ...session,
                  activeTeamId: team?._id ?? null,
                  organizationRole: member?.role ?? null,
                },
              };
            }

            return { data: session };
          },
        },
      },
    },
    user: {
      additionalFields: {
        activeOrganizationId: {
          type: "string",
          required: false,
          input: false
        },
        activeTeamId: {
          type: "string",
          required: false,
          input: false
        },
      }
    },
    session: {
      additionalFields: {
        organizationRole: {
          type: "string",
          required: false,
          input: false
        },
      }
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