import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  todo: [
    "create",
    "read",
    "readAny",
    "update",
    "updateAny",
    "delete",
    "deleteAny",
    "assign",
    "assignAny",
  ],
  chat: [
    "create",
    "read",
    "readAny",
    "update",
    "updateAny",
    "delete",
    "deleteAny",
  ],
  sandbox: [
    "create",
    "read",
    "readAny",
    "update",
    "updateAny",
    "delete",
    "deleteAny",
  ],
  attachment: [
    "create",
    "read",
    "delete",
    "readAny",
    "deleteAny",
  ],
} as const;

export const ac = createAccessControl(statement);

const member = ac.newRole({
  ...memberAc.statements,
  todo: ["create", "read", "update", "delete", "assign"],
  chat: ["create", "read", "update", "delete"],
  sandbox: ["create", "read", "update", "delete"],
  attachment: ["create", "read", "delete"],
});

const admin = ac.newRole({
  ...adminAc.statements,
  todo: ["create", "read", "readAny", "update", "updateAny", "delete", "deleteAny", "assign", "assignAny"],
  chat: ["create", "read", "readAny", "update", "updateAny", "delete", "deleteAny"],
  sandbox: ["create", "read", "readAny", "update", "updateAny", "delete", "deleteAny"],
  attachment: ["create", "read", "delete", "readAny", "deleteAny"],
});

const owner = ac.newRole({
  ...ownerAc.statements,
  todo: ["create", "read", "readAny", "update", "updateAny", "delete", "deleteAny", "assign", "assignAny"],
  chat: ["create", "read", "readAny", "update", "updateAny", "delete", "deleteAny"],
  sandbox: ["create", "read", "readAny", "update", "updateAny", "delete", "deleteAny"],
  attachment: ["create", "read", "delete", "readAny", "deleteAny"],
});

// Roles ordered by hierarchy (lowest to highest)
export const roles = { member, admin, owner };

// Role hierarchy derived from the order of roles object
export type MemberRole = keyof typeof roles;
const roleKeys = Object.keys(roles) as MemberRole[];

export const ROLE_HIERARCHY = Object.fromEntries(
  roleKeys.map((key, index) => [key, index + 1])
) as Record<MemberRole, number>;

export const ROLES = roleKeys.map((key) => ({
  value: key,
  label: key.charAt(0).toUpperCase() + key.slice(1),
}));

export function isMemberRole(role: string): role is MemberRole {
  return role in ROLE_HIERARCHY;
}

function parseRoleNames(role: string) {
  return role
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function hasPermission(
  role: string,
  request: Parameters<(typeof roles)[MemberRole]["authorize"]>[0]
) {
  for (const roleName of parseRoleNames(role)) {
    if (!isMemberRole(roleName)) {
      continue;
    }

    const authResult = roles[roleName].authorize(request);
    if (authResult.success) {
      return true;
    }
  }

  return false;
}

export function assertPermission(
  role: string,
  request: Parameters<(typeof roles)[MemberRole]["authorize"]>[0],
  errorMessage: string
) {
  if (!hasPermission(role, request)) {
    throw new Error(errorMessage);
  }
}

export function assertOrganizationAccess(
  resourceOrganizationId: string,
  activeOrganizationId: string,
  errorMessage: string
) {
  if (resourceOrganizationId !== activeOrganizationId) {
    throw new Error(errorMessage);
  }
}

export function assertScopedPermission(
  role: string,
  actorId: string,
  targetId: string,
  ownRequest: Parameters<(typeof roles)[MemberRole]["authorize"]>[0],
  anyRequest: Parameters<(typeof roles)[MemberRole]["authorize"]>[0],
  ownErrorMessage: string,
  anyErrorMessage: string
) {
  if (targetId === actorId) {
    assertPermission(role, ownRequest, ownErrorMessage);
    return;
  }
  assertPermission(role, anyRequest, anyErrorMessage);
}
