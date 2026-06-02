import type { Brand, Client, Project, Submission } from "@/lib/types";

function visibilityKey(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getClientVisibilityScope(client: Client, brands: Array<Pick<Brand, "id" | "brand_name">>, projects: Array<Pick<Project, "id" | "project_name">>) {
  const clientKey = visibilityKey(client.name);
  const isGodrejClient = clientKey.includes("godrej");
  const brandIds = Array.from(new Set((brands ?? []).map((brand) => brand.id).filter(Boolean)));
  const brandNames = Array.from(new Set((brands ?? []).map((brand) => brand.brand_name).filter(Boolean)));
  const projectIds = (projects ?? []).map((project) => project.id).filter(Boolean);
  const projectNames = Array.from(new Set((projects ?? []).map((project) => project.project_name).filter(Boolean)));

  return {
    isGodrejClient,
    brandIds,
    brandNames,
    projectIds,
    projectNames
  };
}

export function clientCanSeeSubmission(
  item: Pick<Submission, "client_id" | "brand_id" | "brand_name" | "project_id" | "project_name">,
  clientId: string,
  scope: ReturnType<typeof getClientVisibilityScope>
) {
  if (item.client_id === clientId) return true;
  if (item.brand_id && scope.brandIds.includes(item.brand_id)) return true;
  if (item.brand_name && scope.brandNames.includes(item.brand_name)) return true;
  if (scope.isGodrejClient && item.project_id && scope.projectIds.includes(item.project_id)) return true;
  if (scope.isGodrejClient && item.project_name && scope.projectNames.includes(item.project_name)) return true;
  return false;
}
