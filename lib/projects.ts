export const DEFAULT_PROJECT_NAME = "Salon Dealer Board for Godrej";
export const FALLBACK_PROJECT_NAME = "General Deployment";

export function displayProjectName(projectName: string | null | undefined) {
  return projectName?.trim() || FALLBACK_PROJECT_NAME;
}
