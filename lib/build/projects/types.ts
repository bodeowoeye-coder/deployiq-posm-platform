export const BUILD_PROJECT_TYPES = ["Construction", "Real Estate", "Facility Management"] as const;

export type BuildProjectType = (typeof BUILD_PROJECT_TYPES)[number];

export type CanonicalBuildProject = {
  id: string;
  client_id: string;
  project_name: string;
  project_code: string | null;
  client_project_reference: string | null;
  project_type: BuildProjectType;
  status: string;
  start_date: string | null;
  end_date: string | null;
  planned_completion: string | null;
  actual_completion: string | null;
  primary_target_region: string | null;
  primary_target_state: string | null;
  project_regions: string[];
  regions_covered: string[];
  agency_id: string | null;
  lead_installer_id: string | null;
  archived_at: string | null;
};

export type CanonicalBuildProjectResult =
  | { ok: true; project: CanonicalBuildProject }
  | { ok: false; code: "project_record_invalid" | "project_archived" | "project_type_not_build_compatible" };

export type BuildProjectAuthority = {
  isAdmin: boolean;
  role: string;
  clientId: string | null;
  allowedProjectIds: string[];
  requestedClientId?: string | null;
};

export type BuildProjectAuthorityResult =
  | { ok: true }
  | { ok: false; code: "requested_client_mismatch" | "role_not_allowed" | "tenant_mismatch" | "project_not_allowed" };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function textArray(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

export function isBuildProjectType(value: unknown): value is BuildProjectType {
  return typeof value === "string" && BUILD_PROJECT_TYPES.includes(value as BuildProjectType);
}

export function canonicalizeBuildProject(row: Record<string, unknown>): CanonicalBuildProjectResult {
  const id = text(row.id);
  const clientId = text(row.client_id);
  const projectName = text(row.project_name);
  if (!id || !clientId || !projectName) return { ok: false, code: "project_record_invalid" };
  if (nullableText(row.archived_at)) return { ok: false, code: "project_archived" };
  if (!isBuildProjectType(row.project_type)) return { ok: false, code: "project_type_not_build_compatible" };

  return {
    ok: true,
    project: {
      id,
      client_id: clientId,
      project_name: projectName,
      project_code: nullableText(row.project_code),
      client_project_reference: nullableText(row.client_project_reference),
      project_type: row.project_type.trim() as BuildProjectType,
      status: text(row.status),
      start_date: nullableText(row.start_date),
      end_date: nullableText(row.end_date),
      planned_completion: nullableText(row.planned_completion),
      actual_completion: nullableText(row.actual_completion),
      primary_target_region: nullableText(row.primary_target_region),
      primary_target_state: nullableText(row.primary_target_state),
      project_regions: textArray(row.project_regions),
      regions_covered: textArray(row.regions_covered),
      agency_id: nullableText(row.agency_id),
      lead_installer_id: nullableText(row.lead_installer_id),
      archived_at: null
    }
  };
}

export function assessBuildProjectAuthority(
  project: CanonicalBuildProject,
  authority: BuildProjectAuthority
): BuildProjectAuthorityResult {
  const requestedClientId = text(authority.requestedClientId);
  if (requestedClientId && requestedClientId !== project.client_id) {
    return { ok: false, code: "requested_client_mismatch" };
  }
  if (authority.isAdmin) return { ok: true };
  if (authority.role !== "client" || !authority.clientId) return { ok: false, code: "role_not_allowed" };
  if (authority.clientId !== project.client_id) return { ok: false, code: "tenant_mismatch" };
  if (!authority.allowedProjectIds.includes(project.id)) return { ok: false, code: "project_not_allowed" };
  return { ok: true };
}
