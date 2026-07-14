export type BuildWorkPackageTemplateStatus = "draft" | "active" | "archived";

export type BuildActivityCategoryType =
  | "preparation"
  | "execution"
  | "inspection"
  | "testing"
  | "commissioning"
  | "close_out"
  | "general";

export type BuildActivityCategoryStatus = "active" | "archived";

export type BuildActivityCategory = {
  id: string;
  template_id: string;
  sequence: number;
  code: string;
  name: string;
  description: string | null;
  category_type: BuildActivityCategoryType;
  estimated_duration: number | null;
  status: BuildActivityCategoryStatus;
  created_at: string;
  updated_at: string;
};

export type BuildWorkPackageTemplate = {
  id: string;
  client_id: string | null;
  code: string;
  name: string;
  description: string | null;
  work_package_type: string | null;
  category: string | null;
  version: number;
  is_global: boolean;
  status: BuildWorkPackageTemplateStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type BuildActivityTemplate = {
  id: string;
  template_id: string;
  activity_category_id: string | null;
  sequence: number;
  code: string;
  name: string;
  description: string | null;
  estimated_duration: number | null;
  mandatory: boolean;
  requires_photo: boolean;
  requires_gps: boolean;
  requires_approval: boolean;
  created_at: string;
  updated_at: string;
};

export type BuildChecklistTemplate = {
  id: string;
  activity_template_id: string;
  sequence: number;
  item: string;
  mandatory: boolean;
  created_at: string;
  updated_at: string;
};

export type BuildInspectionTemplate = {
  id: string;
  template_id: string;
  sequence: number;
  inspection_type: string;
  inspector_role: string | null;
  frequency: string | null;
  acceptance_criteria: string | null;
  created_at: string;
  updated_at: string;
};

export type BuildSafetyTemplate = {
  id: string;
  template_id: string;
  sequence: number;
  task_name: string;
  ppe_required: boolean;
  permit_required: boolean;
  toolbox_talk_required: boolean;
  hazard_assessment_required: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BuildSupplyTemplate = {
  id: string;
  template_id: string;
  sequence: number;
  material: string;
  quantity: number | null;
  unit: string | null;
  preferred_supplier: string | null;
  delivery_stage: string | null;
  consumption_stage: string | null;
  created_at: string;
  updated_at: string;
};

export type BuildEquipmentTemplate = {
  id: string;
  template_id: string;
  sequence: number;
  equipment_name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BuildWorkPackageTemplateBundle = {
  template: BuildWorkPackageTemplate;
  categories: BuildActivityCategory[];
  activities: BuildActivityTemplate[];
  checklists: BuildChecklistTemplate[];
  inspections: BuildInspectionTemplate[];
  safety: BuildSafetyTemplate[];
  supplies: BuildSupplyTemplate[];
  equipment: BuildEquipmentTemplate[];
};

export type CreateBuildActivityCategoryInput = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  sequence?: number;
  code: string;
  name: string;
  description?: string | null;
  categoryType?: BuildActivityCategoryType;
  estimatedDuration?: number | null;
  status?: BuildActivityCategoryStatus;
};

export type UpdateBuildActivityCategoryInput = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  id: string;
  sequence?: number;
  code?: string;
  name?: string;
  description?: string | null;
  categoryType?: BuildActivityCategoryType;
  estimatedDuration?: number | null;
  status?: BuildActivityCategoryStatus;
};

export type CreateBuildWorkPackageTemplateInput = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  code: string;
  name: string;
  description?: string | null;
  workPackageType?: string | null;
  category?: string | null;
  version?: number;
  isGlobal?: boolean;
  status?: BuildWorkPackageTemplateStatus;
};

export type UpdateBuildWorkPackageTemplateInput = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  id: string;
  code?: string;
  name?: string;
  description?: string | null;
  workPackageType?: string | null;
  category?: string | null;
  version?: number;
  status?: BuildWorkPackageTemplateStatus;
};
