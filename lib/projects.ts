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

  return {
    ...project,
    project_name: projectName,
    campaign_name: campaignName || null
  };
}

export function normalizeProjectRecords<T extends ProjectRowLike>(projects: T[] | null | undefined) {
  return (projects ?? []).map((project) => normalizeProjectRecord(project));
}
