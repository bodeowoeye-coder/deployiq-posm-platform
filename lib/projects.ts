export const DEFAULT_PROJECT_NAME = "Salon Dealer Board for Godrej";
export const FALLBACK_PROJECT_NAME = "General Deployment";

export function displayProjectName(projectName: string | null | undefined) {
  return projectName?.trim() || FALLBACK_PROJECT_NAME;
}

type ProjectRowLike = Record<string, unknown>;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeProjectRecord<T extends ProjectRowLike>(project: T) {
  const projectName = textValue(project.project_name) || textValue(project.name);
  const campaignName = textValue(project.campaign_name) || textValue(project.campaign);

  return {
    ...project,
    project_name: projectName,
    campaign_name: campaignName || null
  };
}

export function normalizeProjectRecords<T extends ProjectRowLike>(projects: T[] | null | undefined) {
  return (projects ?? []).map((project) => normalizeProjectRecord(project));
}
