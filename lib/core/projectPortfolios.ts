import { AccessControlError, getAuthenticatedUserContext } from "@/lib/accessControl";
import { getProjectAccessRegistry } from "@/lib/core/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import {
  validateClientBusinessUnitRelation,
  validateClientPortfolioRelation,
  validatePortfolioBusinessUnitRelation
} from "@/lib/core/enterpriseHierarchy";
import type { CreateProjectPortfolioInput, ProjectPortfolio, UpdateProjectPortfolioInput } from "@/lib/types";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function codeToken(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function statusValue(value: unknown) {
  const normalized = textValue(value).toLowerCase();
  if (normalized === "active" || normalized === "inactive" || normalized === "archived") return normalized;
  return "active";
}

function normalizePortfolio(row: Record<string, unknown>) {
  return {
    id: textValue(row.id),
    client_id: textValue(row.client_id),
    business_unit_id: textValue(row.business_unit_id) || null,
    code: textValue(row.code),
    name: textValue(row.name),
    description: textValue(row.description) || null,
    portfolio_type: textValue(row.portfolio_type) || null,
    status: statusValue(row.status),
    planned_start_date: textValue(row.planned_start_date) || null,
    planned_end_date: textValue(row.planned_end_date) || null,
    created_by: textValue(row.created_by) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    archived_at: textValue(row.archived_at) || null
  } as ProjectPortfolio;
}

function assertReadPermission(permissions: string[]) {
  if (!permissions.includes("clients:read")) {
    throw new AccessControlError("You do not have permission to read Portfolios.", 403);
  }
}

function assertWritePermission(permissions: string[]) {
  if (!permissions.includes("clients:write")) {
    throw new AccessControlError("You do not have permission to modify Portfolios.", 403);
  }
}

export async function assertPortfolioAccess(params: {
  request?: Request;
  clientId: string;
  portfolioId?: string | null;
  canWrite?: boolean;
}) {
  const clientId = textValue(params.clientId);
  if (!clientId) throw new AccessControlError("clientId is required.", 400);

  const authContext = await getAuthenticatedUserContext(params.request);
  const registry = await getProjectAccessRegistry(params.request);

  if (params.canWrite) {
    assertWritePermission(registry.permissions);
    if (!authContext.is_admin) {
      throw new AccessControlError("Only admins can modify Portfolios at this stage.", 403);
    }
  } else {
    assertReadPermission(registry.permissions);
    if (!authContext.is_admin) {
      if (authContext.role !== "client" || authContext.client_id !== clientId) {
        throw new AccessControlError("You do not have access to this client.", 403);
      }
    }
  }

  const portfolio = params.portfolioId
    ? await validateClientPortfolioRelation({ clientId, portfolioId: params.portfolioId, includeArchived: true })
    : null;

  return {
    authContext,
    clientId,
    portfolio
  };
}

export async function getPortfoliosForClient(params: {
  request?: Request;
  clientId: string;
  businessUnitId?: string | null;
  includeArchived?: boolean;
}) {
  const includeArchived = Boolean(params.includeArchived);
  const access = await assertPortfolioAccess({ request: params.request, clientId: params.clientId, canWrite: false });

  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived Portfolios.", 403);
  }

  const requestedBusinessUnitId = textValue(params.businessUnitId);
  if (requestedBusinessUnitId) {
    await validateClientBusinessUnitRelation({
      clientId: access.clientId,
      businessUnitId: requestedBusinessUnitId,
      includeArchived: includeArchived
    });
  }

  const supabase = createAdminSupabase();
  let query = supabase
    .from("project_portfolios")
    .select("*")
    .eq("client_id", access.clientId)
    .order("created_at", { ascending: true });

  if (requestedBusinessUnitId) query = query.eq("business_unit_id", requestedBusinessUnitId);
  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load Portfolios: ${error.message}`, 500);

  return (data ?? []).map((row) => normalizePortfolio(row as Record<string, unknown>));
}

export async function getPortfolioById(params: {
  request?: Request;
  clientId: string;
  portfolioId: string;
  includeArchived?: boolean;
}) {
  const includeArchived = Boolean(params.includeArchived);
  const access = await assertPortfolioAccess({
    request: params.request,
    clientId: params.clientId,
    portfolioId: params.portfolioId,
    canWrite: false
  });

  if (!access.portfolio) return null;
  if (!includeArchived && access.portfolio.archived_at) return null;
  return access.portfolio as ProjectPortfolio;
}

export async function createProjectPortfolio(params: {
  request?: Request;
  input: CreateProjectPortfolioInput;
}) {
  const input = params.input;
  const access = await assertPortfolioAccess({ request: params.request, clientId: input.clientId, canWrite: true });

  const name = textValue(input.name);
  if (!name) throw new AccessControlError("Portfolio name is required.", 400);
  const code = codeToken(textValue(input.code || ""));
  if (!code) throw new AccessControlError("Portfolio code is required.", 400);

  const businessUnit = await validateClientBusinessUnitRelation({
    clientId: access.clientId,
    businessUnitId: input.businessUnitId,
    includeArchived: false
  });

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("project_portfolios")
    .insert({
      client_id: access.clientId,
      business_unit_id: businessUnit?.id ?? null,
      code,
      name,
      description: textValue(input.description || "") || null,
      portfolio_type: textValue(input.portfolioType || "") || null,
      status: statusValue(input.status),
      planned_start_date: textValue(input.plannedStartDate || "") || null,
      planned_end_date: textValue(input.plannedEndDate || "") || null,
      created_by: access.authContext.user_id
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Portfolio code must be unique within the client.", 409);
    }
    throw new AccessControlError(`Could not create Portfolio: ${error.message}`, 500);
  }

  return normalizePortfolio(data as Record<string, unknown>);
}

export async function updateProjectPortfolio(params: {
  request?: Request;
  input: UpdateProjectPortfolioInput;
}) {
  const input = params.input;
  const access = await assertPortfolioAccess({
    request: params.request,
    clientId: input.clientId,
    portfolioId: input.id,
    canWrite: true
  });

  const nextBusinessUnit = await validateClientBusinessUnitRelation({
    clientId: access.clientId,
    businessUnitId: input.businessUnitId,
    includeArchived: false
  });

  validatePortfolioBusinessUnitRelation({
    businessUnitId: nextBusinessUnit?.id ?? null,
    portfolioBusinessUnitId: nextBusinessUnit?.id ?? access.portfolio?.business_unit_id ?? null
  });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof input.code === "string") updates.code = codeToken(input.code);
  if (typeof input.name === "string") updates.name = textValue(input.name);
  if ("description" in input) updates.description = textValue(input.description || "") || null;
  if ("portfolioType" in input) updates.portfolio_type = textValue(input.portfolioType || "") || null;
  if ("status" in input && input.status) updates.status = statusValue(input.status);
  if ("plannedStartDate" in input) updates.planned_start_date = textValue(input.plannedStartDate || "") || null;
  if ("plannedEndDate" in input) updates.planned_end_date = textValue(input.plannedEndDate || "") || null;
  if ("businessUnitId" in input) updates.business_unit_id = nextBusinessUnit?.id ?? null;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("project_portfolios")
    .update(updates)
    .eq("id", input.id)
    .eq("client_id", input.clientId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Portfolio code must be unique within the client.", 409);
    }
    throw new AccessControlError(`Could not update Portfolio: ${error.message}`, 500);
  }

  return normalizePortfolio(data as Record<string, unknown>);
}

export async function archiveProjectPortfolio(params: {
  request?: Request;
  clientId: string;
  portfolioId: string;
}) {
  await assertPortfolioAccess({
    request: params.request,
    clientId: params.clientId,
    portfolioId: params.portfolioId,
    canWrite: true
  });

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("project_portfolios")
    .update({ archived_at: new Date().toISOString(), status: "archived", updated_at: new Date().toISOString() })
    .eq("id", params.portfolioId)
    .eq("client_id", params.clientId)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive Portfolio: ${error.message}`, 500);
  return normalizePortfolio(data as Record<string, unknown>);
}
