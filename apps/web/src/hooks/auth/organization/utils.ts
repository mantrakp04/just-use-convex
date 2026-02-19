import { isMemberRole, ROLE_HIERARCHY, type MemberRole } from "./types";

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function isAtLeastRole(role: string | null, minimumRole: MemberRole): boolean {
  if (!role) return false;
  if (!isMemberRole(role)) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimumRole];
}

export function canManageRole(currentRole: string | null, targetRole: string): boolean {
  if (currentRole === null) return false;
  if (!isMemberRole(currentRole)) return false;
  if (!isMemberRole(targetRole)) return false;
  return ROLE_HIERARCHY[currentRole] > ROLE_HIERARCHY[targetRole];
}

export function normalizeSlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
