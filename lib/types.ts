export type SubmissionStatus = "Pending" | "Flagged" | "Approved" | "Rejected";
export type BrandMatchStatus = "Matched" | "Mismatch" | "Uncertain";
export type AiConfidenceLevel = "High" | "Medium" | "Low";
export type DuplicateStatus = "Unique" | "Possible Duplicate" | "Duplicate";
export type ProjectStatus = "Planning" | "Active" | "On Hold" | "Completed";
export type DeploymentStageCode = "production" | "warehouse" | "in_transit" | "installed" | "approved";

export type Submission = {
  id: string;
  client_id: string | null;
  project_id: string | null;
  project_name: string | null;
  installer_name: string | null;
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
  resolved_lga: string | null;
  resolved_city: string | null;
  resolved_state: string | null;
  deployment_stage_code: DeploymentStageCode | null;
  state_region: string | null;
  status: SubmissionStatus;
  image_url: string;
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
};

export type UserRole = "admin" | "client" | "installer";

export type Client = {
  id: string;
  name: string;
  can_review: boolean;
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
  start_date: string | null;
  end_date: string | null;
  target_quantity: number;
  status: ProjectStatus;
  regions_covered: string[];
  assigned_installers: string[];
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
