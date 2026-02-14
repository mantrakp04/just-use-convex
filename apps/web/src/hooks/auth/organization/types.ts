import { authClient } from "@/lib/auth-client";
export { ROLE_HIERARCHY, ROLES, type MemberRole } from "@convex/shared/auth";

type Session = ReturnType<typeof authClient.useSession>["data"];
export type User = NonNullable<Session>["user"];

type ListOrganizationsData = ReturnType<typeof authClient.useListOrganizations>["data"];
export type Organization = NonNullable<ListOrganizationsData>[number];

type ActiveOrganizationData = ReturnType<typeof authClient.useActiveOrganization>["data"];
export type FullOrganization = NonNullable<ActiveOrganizationData>;

export type Member = NonNullable<FullOrganization["members"]>[number];

type ListUserInvitationsResult = Awaited<ReturnType<typeof authClient.organization.listUserInvitations>>;
export type Invitation = NonNullable<ListUserInvitationsResult["data"]>[number];

type ListTeamsResult = Awaited<ReturnType<typeof authClient.organization.listTeams>>;
export type Team = NonNullable<ListTeamsResult["data"]>[number];

type ListTeamMembersResult = Awaited<ReturnType<typeof authClient.organization.listTeamMembers>>;
export type TeamMember = NonNullable<ListTeamMembersResult["data"]>[number];
