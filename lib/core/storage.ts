import type { AuthenticatedUserContext } from "@/lib/accessControl";

export type StorageOwnershipCheck = {
  allowed: boolean;
  reason: string | null;
};

function normalizePath(path: string) {
  return path.trim().replace(/^\/+/, "").replace(/\/+/g, "/");
}

function pathSegments(path: string) {
  return normalizePath(path)
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function canAccessStoragePath(userContext: AuthenticatedUserContext, objectPath: string): StorageOwnershipCheck {
  if (!objectPath.trim()) {
    return { allowed: false, reason: "Storage path is required." };
  }

  if (userContext.is_admin) {
    return { allowed: true, reason: null };
  }

  const segments = pathSegments(objectPath);
  if (segments.length === 0) {
    return { allowed: false, reason: "Invalid storage path." };
  }

  if (userContext.client_id && segments.includes(userContext.client_id)) {
    return { allowed: true, reason: null };
  }

  if (userContext.allowed_project_ids.some((projectId) => segments.includes(projectId))) {
    return { allowed: true, reason: null };
  }

  return { allowed: false, reason: "Object does not match the caller tenant scope." };
}
