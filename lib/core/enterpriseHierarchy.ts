import { AccessControlError } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export type BusinessUnitCore = {
  id: string;
  client_id: string;
  name: string;
  archived_at: string | null;
};

export type ProjectPortfolioCore = {
  id: string;
  client_id: string;
  business_unit_id: string | null;
  name: string;
  archived_at: string | null;
};

export type ProjectCore = {
  id: string;
  client_id: string;
  business_unit_id: string | null;
  portfolio_id: string | null;
  project_type: string | null;
  archived_at: string | null;
};

export type BuildSiteCore = {
  id: string;
  client_id: string;
  project_id: string;
  archived_at: string | null;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isRetailProjectType(projectType: string | null | undefined) {
  const normalized = textValue(projectType).toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "retail_deployment" || normalized === "retail" || normalized === "retail_posm";
}

export async function getBusinessUnitCore(businessUnitId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("business_units")
    .select("id, client_id, name, archived_at")
    .eq("id", businessUnitId)
    .maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve business unit: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Business Unit not found.", 404);
  return data as BusinessUnitCore;
}

export async function getProjectPortfolioCore(portfolioId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("project_portfolios")
    .select("id, client_id, business_unit_id, name, archived_at")
    .eq("id", portfolioId)
    .maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve portfolio: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Portfolio not found.", 404);
  return data as ProjectPortfolioCore;
}

export async function getProjectCore(projectId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("id, client_id, business_unit_id, portfolio_id, project_type, archived_at")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve project: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Project not found.", 404);
  return data as ProjectCore;
}

export async function getBuildSiteCore(siteId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_sites")
    .select("id, client_id, project_id, archived_at")
    .eq("id", siteId)
    .maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve site: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Site not found.", 404);
  return data as BuildSiteCore;
}

export async function validateClientBusinessUnitRelation(params: {
  clientId: string;
  businessUnitId?: string | null;
  includeArchived?: boolean;
}) {
  const businessUnitId = textValue(params.businessUnitId);
  if (!businessUnitId) return null;
  const businessUnit = await getBusinessUnitCore(businessUnitId);
  if (businessUnit.client_id !== params.clientId) {
    throw new AccessControlError("Business Unit does not belong to the selected client.", 400);
  }
  if (!params.includeArchived && businessUnit.archived_at) {
    throw new AccessControlError("Business Unit is archived.", 400);
  }
  return businessUnit;
}

export async function validateClientPortfolioRelation(params: {
  clientId: string;
  portfolioId?: string | null;
  includeArchived?: boolean;
}) {
  const portfolioId = textValue(params.portfolioId);
  if (!portfolioId) return null;
  const portfolio = await getProjectPortfolioCore(portfolioId);
  if (portfolio.client_id !== params.clientId) {
    throw new AccessControlError("Portfolio does not belong to the selected client.", 400);
  }
  if (!params.includeArchived && portfolio.archived_at) {
    throw new AccessControlError("Portfolio is archived.", 400);
  }
  return portfolio;
}

export function validatePortfolioBusinessUnitRelation(params: {
  businessUnitId?: string | null;
  portfolioBusinessUnitId?: string | null;
}) {
  const businessUnitId = textValue(params.businessUnitId);
  const portfolioBusinessUnitId = textValue(params.portfolioBusinessUnitId);
  if (!businessUnitId || !portfolioBusinessUnitId) return;
  if (businessUnitId !== portfolioBusinessUnitId) {
    throw new AccessControlError("Portfolio does not belong to the selected Business Unit.", 400);
  }
}

export async function validateProjectHierarchyInput(params: {
  clientId: string;
  businessUnitId?: string | null;
  portfolioId?: string | null;
}) {
  const businessUnit = await validateClientBusinessUnitRelation({
    clientId: params.clientId,
    businessUnitId: params.businessUnitId,
    includeArchived: false
  });

  const portfolio = await validateClientPortfolioRelation({
    clientId: params.clientId,
    portfolioId: params.portfolioId,
    includeArchived: false
  });

  validatePortfolioBusinessUnitRelation({
    businessUnitId: businessUnit?.id ?? params.businessUnitId,
    portfolioBusinessUnitId: portfolio?.business_unit_id ?? null
  });

  return {
    businessUnit,
    portfolio
  };
}

export async function validateProjectSiteOwnership(params: {
  projectId: string;
  siteId: string;
  clientId?: string | null;
}) {
  const project = await getProjectCore(params.projectId);
  const site = await getBuildSiteCore(params.siteId);
  if (site.project_id !== project.id) {
    throw new AccessControlError("Site does not belong to the specified project.", 400);
  }
  if (site.client_id !== project.client_id) {
    throw new AccessControlError("Site and project tenant ownership mismatch.", 400);
  }
  if (params.clientId && textValue(params.clientId) !== project.client_id) {
    throw new AccessControlError("Project and client mismatch.", 400);
  }
  return { project, site };
}
