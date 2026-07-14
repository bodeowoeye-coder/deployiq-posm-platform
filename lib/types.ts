export type SubmissionStatus = "Pending" | "Flagged" | "Approved" | "Rejected";
export type BrandMatchStatus = "Matched" | "Mismatch" | "Uncertain";
export type AiConfidenceLevel = "High" | "Medium" | "Low";
export type DuplicateStatus = "Unique" | "Possible Duplicate" | "Duplicate";
export type OutletMatchStatus = "matched" | "warning" | "not_checked";
export type ProjectType = "Retail Deployment" | "Construction" | "Real Estate" | "Facility Management";
export type ProjectStatus =
  | "Planning"
  | "Active"
  | "On Hold"
  | "Completed"
  | "Not Started"
  | "In Progress"
  | "Delayed"
  | "Cancelled";
export type DeploymentStageCode = "production" | "warehouse" | "in_transit" | "installed" | "approved";

export type Submission = {
  id: string;
  local_submission_id: string | null;
  client_id: string | null;
  installer_user_id: string | null;
  project_id: string | null;
  brand_id: string | null;
  project_name: string | null;
  installer_name: string | null;
  installer_email: string | null;
  brand_name: string | null;
  detected_brand_name: string | null;
  brand_match_status: BrandMatchStatus | null;
  mismatch_reason: string | null;
  ai_review_note: string | null;
  ai_confidence_score: number | null;
  ai_confidence_level: AiConfidenceLevel | null;
  auto_approved: boolean;
  duplicate_status: DuplicateStatus | null;
  duplicate_reason: string | null;
  image_fingerprint: string | null;
  selected_outlet_id: string | null;
  selected_outlet_code: string | null;
  selected_outlet_name: string | null;
  selected_outlet_address: string | null;
  selected_outlet_brand_type: string | null;
  selected_outlet_state: string | null;
  outlet_match_status: OutletMatchStatus | null;
  outlet_match_notes: string | null;
  salon_name: string | null;
  address: string | null;
  phone: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  installer_state: string | null;
  installer_region: string | null;
  installer_lga: string | null;
  resolved_address: string | null;
  resolved_street: string | null;
  resolved_neighbourhood: string | null;
  resolved_lga: string | null;
  resolved_city: string | null;
  resolved_state: string | null;
  resolved_country: string | null;
  deployment_stage_code: DeploymentStageCode | null;
  state_region: string | null;
  status: SubmissionStatus;
  image_url: string;
  image_path: string | null;
  ocr_text: string | null;
  ocr_salon_name: string | null;
  ocr_address: string | null;
  ocr_brand_name: string | null;
  ocr_phone: string | null;
  ocr_raw_text: string | null;
  ocr_confidence: "low" | "medium" | "high" | null;
  ocr_note: string | null;
  approval_comments: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  ai_raw_text: string | null;
  captured_at: string | null;
  installation_date: string | null;
  installation_time: string | null;
  submitted_at: string;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
};

export type UserRole = "admin" | "client" | "installer";

export type Client = {
  id: string;
  name: string;
  can_review?: boolean;
  status?: "Active" | "Inactive";
};

export type ClientProfile = {
  client_id: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  industry_category: string | null;
  created_at: string;
  updated_at: string;
};

export type Brand = {
  id: string;
  client_id: string;
  brand_name: string;
  created_at: string;
};

export type Project = {
  id: string;
  client_id: string;
  brand_id: string | null;
  project_name: string;
  campaign_name: string | null;
  project_type?: ProjectType | null;
  project_code?: string | null;
  client_project_reference?: string | null;
  project_manager?: string | null;
  site_supervisor?: string | null;
  consultant?: string | null;
  contractor?: string | null;
  start_date: string | null;
  end_date: string | null;
  planned_completion?: string | null;
  actual_completion?: string | null;
  budget?: number | null;
  currency?: string | null;
  target_quantity: number;
  status: ProjectStatus;
  regions_covered: string[];
  assigned_installers: string[];
  archived_at: string | null;
  created_at: string;
  client?: Client | null;
  brand?: Brand | null;
};

export type ProjectTarget = {
  id: string;
  project_id: string;
  installer_name: string | null;
  agency_name: string | null;
  region: string | null;
  state: string | null;
  target_quantity: number;
  deployment_timeline_start: string | null;
  deployment_timeline_end: string | null;
  created_at: string;
};

export type DeploymentStage = {
  id: string;
  stage_code: DeploymentStageCode;
  stage_name: string;
  sort_order: number;
  created_at: string;
};

export type DeploymentProgress = {
  id: string;
  project_id: string;
  stage_code: DeploymentStageCode;
  quantity: number;
  updated_by: string | null;
  updated_at: string;
};

export type NotificationEvent = {
  id: string;
  project_id: string | null;
  client_id: string | null;
  phase_name: string | null;
  destination: string | null;
  quantity: number | null;
  title: string;
  message: string;
  status: string;
  created_at: string;
  read_at: string | null;
};

export type Agency = {
  id: string;
  agency_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  assigned_regions: string[];
  status: "Active" | "Inactive";
  created_at: string;
};

export type DeploymentLocation = {
  id: string;
  state: string;
  outlet_name: string;
  owner_name: string | null;
  address: string | null;
  brand_type: string | null;
  outlet_code: string | null;
  created_at: string;
  updated_at: string;
};

export type Installer = {
  id: string;
  user_id: string | null;
  installer_name: string;
  agency_id: string | null;
  assigned_regions: string[];
  assigned_states: string[];
  assigned_project_ids: string[];
  access_status: "Active" | "Suspended" | "Inactive";
  status: "Active" | "Inactive";
  created_at: string;
};

export type UserProfile = {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  agency_id: string | null;
  assigned_project_ids: string[];
  assigned_regions: string[];
  assigned_states: string[];
  status: "Active" | "Inactive" | "Suspended" | "Archived";
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ManagedUser = {
  user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  client_id: string | null;
  agency_id: string | null;
  assigned_project_ids: string[];
  assigned_regions: string[];
  assigned_states: string[];
  status: UserProfile["status"];
  created_at: string;
  last_sign_in_at: string | null;
};

export type AuditLog = {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  action_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
};

export type RoleRecord = {
  user_id: string;
  role: UserRole;
  client_id: string | null;
};

export type SubmissionStatusHistory = {
  id: string;
  submission_id: string;
  previous_status: SubmissionStatus | null;
  new_status: SubmissionStatus;
  changed_by: string | null;
  comment: string | null;
  created_at: string;
};

export type AiExtraction = {
  salonName: string;
  address: string;
  brandName: string;
  phone: string;
  stateRegion: string;
  visibleText: string;
  confidence: "low" | "medium" | "high";
  note: string;
};
