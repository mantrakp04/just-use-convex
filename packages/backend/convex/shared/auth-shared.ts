import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  // Add custom resources as needed
  // project: ["create", "read", "update", "delete"],
  // billing: ["read", "update"],
  // analytics: ["read"],
} as const;

export const ac = createAccessControl(statement);

const member = ac.newRole({
  ...memberAc.statements,
});

const admin = ac.newRole({
  ...adminAc.statements,
});

const owner = ac.newRole({
  ...ownerAc.statements,
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
