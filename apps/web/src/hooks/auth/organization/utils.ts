import { ROLE_HIERARCHY, type MemberRole } from "./types";

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function isValidRole(role: string): role is MemberRole {
  return role in ROLE_HIERARCHY;
}

export function canManageRole(currentRole: string | null, targetRole: string): boolean {
  if (!currentRole) return false;
  const currentLevel = isValidRole(currentRole) ? ROLE_HIERARCHY[currentRole] : 0;
  const targetLevel = isValidRole(targetRole) ? ROLE_HIERARCHY[targetRole] : 0;
  return currentLevel > targetLevel;
}

export function normalizeSlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
