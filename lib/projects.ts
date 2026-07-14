export const FALLBACK_PROJECT_NAME = "General Deployment";

export function displayProjectName(projectName: string | null | undefined) {
  return projectName?.trim() || FALLBACK_PROJECT_NAME;
}

type ProjectRowLike = Record<string, unknown>;
type SubmissionProjectLike = {
  project_id?: unknown;
  project_name?: unknown;
  campaign_name?: unknown;
  campaign?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textKey(value: unknown) {
  return textValue(value).toLowerCase();
}

export function campaignMatches(selectedCampaign: string | null | undefined, actualCampaign: string | null | undefined) {
  const selected = textKey(selectedCampaign);
  if (!selected) return true;
  return selected === textKey(actualCampaign);
}

export function projectCampaignName(project: ProjectRowLike | null | undefined) {
  if (!project) return null;
  const campaignName = textValue(project.campaign_name) || textValue(project.campaign);
  return campaignName || null;
}

export function resolveSubmissionProject<T extends ProjectRowLike>(projects: T[] | null | undefined, submission: SubmissionProjectLike) {
  const rows = projects ?? [];
  const submissionProjectId = textValue(submission.project_id);
  if (submissionProjectId) {
    const matchById = rows.find((project) => textValue(project.id) === submissionProjectId);
    if (matchById) return matchById;
  }

  const submissionProjectName = textKey(displayProjectName(textValue(submission.project_name)));
  if (!submissionProjectName) return undefined;

  return rows.find((project) => {
    const projectName = textValue(project.project_name) || textValue(project.name);
    return textKey(displayProjectName(projectName)) === submissionProjectName;
  });
}

export function resolveSubmissionCampaignName<T extends ProjectRowLike>(projects: T[] | null | undefined, submission: SubmissionProjectLike) {
  const directCampaign = textValue(submission.campaign_name) || textValue(submission.campaign);
  if (directCampaign) return directCampaign;
  const matchedProject = resolveSubmissionProject(projects, submission);
  return projectCampaignName(matchedProject);
}

export function normalizeProjectRecord<T extends ProjectRowLike>(project: T) {
  const projectName = textValue(project.project_name) || textValue(project.name);
  const campaignName = textValue(project.campaign_name) || textValue(project.campaign);
  const projectType = textValue(project.project_type) || textValue(project.projectType) || "Retail Deployment";
  const projectCode = textValue(project.project_code) || textValue(project.projectCode);
  const clientProjectReference = textValue(project.client_project_reference) || textValue(project.clientProjectReference);
  const projectManager = textValue(project.project_manager) || textValue(project.projectManager);
  const siteSupervisor = textValue(project.site_supervisor) || textValue(project.siteSupervisor);
  const consultant = textValue(project.consultant);
  const contractor = textValue(project.contractor);
  const plannedCompletion = textValue(project.planned_completion) || textValue(project.plannedCompletion);
  const actualCompletion = textValue(project.actual_completion) || textValue(project.actualCompletion);
  const currency = textValue(project.currency) || "NGN";
  const budgetValue = typeof project.budget === "number" && Number.isFinite(project.budget) ? project.budget : null;

  return {
    ...project,
    project_name: projectName,
    campaign_name: campaignName || null,
    project_type: projectType,
    project_code: projectCode || null,
    client_project_reference: clientProjectReference || null,
    project_manager: projectManager || null,
    site_supervisor: siteSupervisor || null,
    consultant: consultant || null,
    contractor: contractor || null,
    planned_completion: plannedCompletion || null,
    actual_completion: actualCompletion || null,
    budget: budgetValue,
    currency: currency || null
  };
}

export function normalizeProjectRecords<T extends ProjectRowLike>(projects: T[] | null | undefined) {
  return (projects ?? []).map((project) => normalizeProjectRecord(project));
}
