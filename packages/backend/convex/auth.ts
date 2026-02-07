import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { organization } from "better-auth/plugins";
import type { GenericActionCtx, GenericMutationCtx } from "convex/server";
import { baseIdentity, zQuery } from "./functions";
import type { DataModel } from "./_generated/dataModel";
import { ac, roles } from "./shared/auth_shared";
import { components, internal } from "./_generated/api";
import { internalAction, query } from "./_generated/server";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import { v } from "convex/values";
import type { Doc as BetterAuthDoc } from "./betterAuth/_generated/dataModel";
import { env } from "@just-use-convex/env/backend";

const EXTERNAL_TOKEN = env.EXTERNAL_TOKEN;

type RunMutationCtx = (GenericMutationCtx<DataModel> | GenericActionCtx<DataModel>) & {
  runMutation: GenericMutationCtx<DataModel>["runMutation"];
};

const isRunMutationCtx = (ctx: GenericCtx<DataModel>): ctx is RunMutationCtx => {
  return "runMutation" in ctx;
};

const siteUrl = env.SITE_URL;
const agentUrl = env.AGENT_URL;

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
        jwks: env.JWKS,
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
            memberId: session.memberId,
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
            const member = await ctx.runMutation(
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

            // Create a default sandbox for the user
            await ctx.runMutation(
              internal.sandboxes.index.createInternal,
              {
                // Identity fields required by zInternalMutation
                userId: user.id,
                activeOrganizationId: org._id,
                organizationRole: "owner",
                memberId: member?._id,
                // Sandbox data
                data: {
                  name: "Default Sandbox",
                  description: "Your personal development sandbox",
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
                memberId: userMemberResult?._id ?? null,
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
                  memberId: member?._id ?? null,
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
        memberId: {
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

export const getIdentity = zQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.identity;
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

export const getUserInfo = query({
  args: {
    externalToken: v.string(),
    identifier: v.union(
      v.object({
        type: v.literal("memberId"),
        value: v.string(),
      }),
      v.object({
        type: v.literal("userId"),
        value: v.string(),
      })
    ),
  },
  returns: baseIdentity,
  handler: async (ctx, args) => {
    if (args.externalToken !== EXTERNAL_TOKEN) {
      throw new Error("Unauthorized: Invalid external token");
    }

    let member: BetterAuthDoc<"member"> | null = null;
    const getMember = async (memberId: string): Promise<BetterAuthDoc<"member"> | null> => {
      return await ctx.runQuery(
        components.betterAuth.adapter.findOne,
        {
          model: "member",
          where: [{ field: "_id", operator: "eq", value: memberId }],
        }
      );
    };

    if (args.identifier.type === "memberId") {
      member = await getMember(args.identifier.value);
    }

    const user: BetterAuthDoc<"user"> = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "user",
        where: [{
          field: "_id",
          operator: "eq", value: member?.userId ?? args.identifier.value
        }],
      }
    );

    member = member ?? await getMember(user?._id);

    if (!user?._id || !user?.activeOrganizationId || !member?.role || !member?._id) {
      throw new Error("User or member data is incomplete");
    }

    return {
      userId: user._id,
      activeOrganizationId: user.activeOrganizationId,
      organizationRole: member.role,
      memberId: member._id,
      activeTeamId: user.activeTeamId ?? undefined,
    };
  },
});
