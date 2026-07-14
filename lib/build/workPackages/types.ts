export type BuildWorkPackageStatus = "planned" | "active" | "on_hold" | "completed" | "archived";

export type BuildWorkPackageType = string;

export const suggestedBuildWorkPackageTypes = [
  "Earthworks",
  "Foundation",
  "Concrete",
  "Masonry",
  "Roofing",
  "Electrical",
  "Mechanical",
  "Plumbing",
  "Finishes",
  "External Works",
  "Infrastructure",
  "Utilities",
  "General"
] as const;

export type BuildWorkPackage = {
  id: string;
  client_id: string;
  project_id: string;
  site_id: string;
  code: string;
  name: string;
  description: string | null;
  work_package_type: BuildWorkPackageType | null;
  contractor: string | null;
  planned_start: string | null;
  planned_finish: string | null;
  actual_start: string | null;
  actual_finish: string | null;
  status: BuildWorkPackageStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type CreateBuildWorkPackageInput = {
  clientId?: string | null;
  projectId: string;
  siteId: string;
  code?: string | null;
  name: string;
  description?: string | null;
  workPackageType?: BuildWorkPackageType | null;
  contractor?: string | null;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  actualStart?: string | null;
  actualFinish?: string | null;
  status?: BuildWorkPackageStatus;
};

export type UpdateBuildWorkPackageInput = {
  id: string;
  clientId?: string | null;
  projectId: string;
  siteId: string;
  code?: string | null;
  name?: string;
  description?: string | null;
  workPackageType?: BuildWorkPackageType | null;
  contractor?: string | null;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  actualStart?: string | null;
  actualFinish?: string | null;
  status?: BuildWorkPackageStatus;
};
