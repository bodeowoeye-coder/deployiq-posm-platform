import type { UserRole } from "@/lib/types";

export type DeployIQPermission =
  | "platform:diagnostics:view"
  | "clients:read"
  | "clients:write"
  | "projects:read"
  | "projects:write"
  | "submissions:read"
  | "submissions:write"
  | "exports:read"
  | "users:read"
  | "users:write"
  | "installers:read"
  | "installers:write"
  | "agencies:read"
  | "agencies:write"
  | "notifications:read"
  | "notifications:write";

const ROLE_PERMISSION_MATRIX: Record<UserRole, readonly DeployIQPermission[]> = {
  admin: [
    "platform:diagnostics:view",
    "clients:read",
    "clients:write",
    "projects:read",
    "projects:write",
    "submissions:read",
    "submissions:write",
    "exports:read",
    "users:read",
    "users:write",
    "installers:read",
    "installers:write",
    "agencies:read",
    "agencies:write",
    "notifications:read",
    "notifications:write"
  ],
  client: [
    "clients:read",
    "projects:read",
    "submissions:read",
    "exports:read",
    "notifications:read"
  ],
  installer: ["projects:read", "submissions:read", "submissions:write", "notifications:read"]
};

export function getPermissionsForRole(role: UserRole): DeployIQPermission[] {
  return [...ROLE_PERMISSION_MATRIX[role]];
}

export function hasPermission(role: UserRole, permission: DeployIQPermission): boolean {
  return ROLE_PERMISSION_MATRIX[role].includes(permission);
}
