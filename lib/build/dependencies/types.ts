export type BuildActivityDependencyType = "FS" | "SS" | "FF" | "SF";

export type BuildActivityDependencyLagUnit = "hours" | "days" | "weeks";

export type BuildActivityTemplateDependency = {
  id: string;
  template_id: string;
  predecessor_activity_template_id: string;
  successor_activity_template_id: string;
  dependency_type: BuildActivityDependencyType;
  lag_value: number;
  lag_unit: BuildActivityDependencyLagUnit;
  mandatory: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type CreateBuildActivityTemplateDependencyInput = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  predecessorActivityTemplateId: string;
  successorActivityTemplateId: string;
  dependencyType?: BuildActivityDependencyType;
  lagValue?: number;
  lagUnit?: BuildActivityDependencyLagUnit;
  mandatory?: boolean;
  notes?: string | null;
};

export type UpdateBuildActivityTemplateDependencyInput = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  id: string;
  predecessorActivityTemplateId?: string;
  successorActivityTemplateId?: string;
  dependencyType?: BuildActivityDependencyType;
  lagValue?: number;
  lagUnit?: BuildActivityDependencyLagUnit;
  mandatory?: boolean;
  notes?: string | null;
};

export type DependencyValidationIssue = {
  code: "SELF_REFERENCE" | "DUPLICATE_EDGE" | "MISSING_NODE" | "CYCLE" | "DISCONNECTED";
  message: string;
  nodes?: string[];
};

export type DependencyGraphValidationResult = {
  isValid: boolean;
  issues: DependencyValidationIssue[];
  disconnectedNodeIds: string[];
  topologicalOrder: string[];
};
