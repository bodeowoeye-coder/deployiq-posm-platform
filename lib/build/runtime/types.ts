export type BuildWorkPlanStatus = "not_started" | "in_progress" | "completed" | "blocked" | "archived";

export type BuildRuntimeActivity = {
  id: string;
  source_activity_template_id: string;
  source_category_id: string;
  category_code: string;
  category_name: string;
  sequence: number;
  code: string;
  name: string;
  description: string | null;
  planned_duration: number | null;
  duration_unit: "hours" | "days" | "weeks";
  status: "not_started" | "in_progress" | "completed" | "blocked";
  checklist_count: number;
  resource_requirement_count: number;
  predecessor_count: number;
};

export type BuildWorkPlan = {
  id: string;
  client_id: string;
  project_id: string;
  site_id: string;
  work_package_id: string;
  source_template_id: string;
  source_template_code: string;
  source_template_name: string;
  source_template_version: number;
  source_fingerprint: string;
  status: BuildWorkPlanStatus;
  instantiated_at: string;
  instantiated_by: string | null;
  archived_at: string | null;
  counts: {
    activities: number;
    checklists: number;
    dependencies: number;
    resourceRequirements: number;
  };
  activities: BuildRuntimeActivity[];
};
