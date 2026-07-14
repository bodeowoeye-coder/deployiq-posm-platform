export type BuildSiteStatus = "planned" | "active" | "on_hold" | "completed" | "archived";

export type BuildSiteType =
  | "general"
  | "phase"
  | "infrastructure"
  | "residential"
  | "commercial"
  | "industrial"
  | "mixed_use"
  | "other"
  | (string & {});

export type BuildSite = {
  id: string;
  client_id: string;
  project_id: string;
  site_code: string;
  name: string;
  description: string | null;
  site_type: BuildSiteType | null;
  address: string | null;
  state: string | null;
  lga: string | null;
  latitude: number | null;
  longitude: number | null;
  status: BuildSiteStatus;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type CreateBuildSiteInput = {
  projectId: string;
  clientId?: string | null;
  siteCode?: string | null;
  name: string;
  description?: string | null;
  siteType?: BuildSiteType | null;
  address?: string | null;
  state?: string | null;
  lga?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: BuildSiteStatus;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
};

export type UpdateBuildSiteInput = {
  id: string;
  projectId: string;
  clientId?: string | null;
  siteCode?: string | null;
  name?: string;
  description?: string | null;
  siteType?: BuildSiteType | null;
  address?: string | null;
  state?: string | null;
  lga?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: BuildSiteStatus;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
};
