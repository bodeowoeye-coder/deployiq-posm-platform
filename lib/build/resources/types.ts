export type BuildResourceType = "labour" | "material" | "equipment" | "vehicle" | "contractor" | "service";

export type BuildResourceStatus = "draft" | "active" | "inactive" | "archived";

export type BuildResourceRequirementType = "estimated" | "mandatory" | "optional";

export const buildResourceTypeConfig: Record<
  BuildResourceType,
  { label: string; shortLabel: string }
> = {
  labour: { label: "Labour", shortLabel: "Labour" },
  material: { label: "Material", shortLabel: "Materials" },
  equipment: { label: "Equipment", shortLabel: "Equipment" },
  vehicle: { label: "Vehicle", shortLabel: "Vehicles" },
  contractor: { label: "Contractor", shortLabel: "Contractors" },
  service: { label: "Service", shortLabel: "Services" }
};

export const buildResourceTypeOrder: BuildResourceType[] = [
  "material",
  "labour",
  "equipment",
  "vehicle",
  "contractor",
  "service"
];

export type BuildResource = {
  id: string;
  client_id: string | null;
  code: string;
  name: string;
  description: string | null;
  resource_type: BuildResourceType;
  category: string | null;
  unit_of_measure: string | null;
  specification: string | null;
  default_rate: number | null;
  currency: string | null;
  is_global: boolean;
  status: BuildResourceStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type BuildResourceRequirement = {
  id: string;
  template_id: string;
  activity_category_id: string | null;
  activity_template_id: string | null;
  resource_id: string;
  sequence: number;
  quantity: number;
  unit_of_measure: string;
  requirement_type: BuildResourceRequirementType;
  required_stage: string | null;
  mandatory: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  resource_type: BuildResourceType | null;
  resource_code: string | null;
  resource_name: string | null;
  resource_category: string | null;
};

export type CreateBuildResourceInput = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  code: string;
  name: string;
  description?: string | null;
  resourceType: BuildResourceType;
  category?: string | null;
  unitOfMeasure?: string | null;
  specification?: string | null;
  defaultRate?: number | null;
  currency?: string | null;
  isGlobal?: boolean;
  status?: BuildResourceStatus;
};

export type UpdateBuildResourceInput = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  id: string;
  code?: string;
  name?: string;
  description?: string | null;
  resourceType?: BuildResourceType;
  category?: string | null;
  unitOfMeasure?: string | null;
  specification?: string | null;
  defaultRate?: number | null;
  currency?: string | null;
  status?: BuildResourceStatus;
};

export type CreateTemplateResourceRequirementInput = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  activityCategoryId?: string | null;
  activityTemplateId?: string | null;
  resourceId: string;
  sequence?: number;
  quantity: number;
  unitOfMeasure?: string | null;
  requirementType?: BuildResourceRequirementType;
  requiredStage?: string | null;
  mandatory?: boolean;
  notes?: string | null;
};

export type UpdateTemplateResourceRequirementInput = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  id: string;
  activityCategoryId?: string | null;
  activityTemplateId?: string | null;
  resourceId?: string;
  sequence?: number;
  quantity?: number;
  unitOfMeasure?: string | null;
  requirementType?: BuildResourceRequirementType;
  requiredStage?: string | null;
  mandatory?: boolean;
  notes?: string | null;
};
