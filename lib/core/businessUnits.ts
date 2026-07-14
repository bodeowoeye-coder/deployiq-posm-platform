import { AccessControlError, getAuthenticatedUserContext } from "@/lib/accessControl";
import { getProjectAccessRegistry } from "@/lib/core/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { validateClientBusinessUnitRelation } from "@/lib/core/enterpriseHierarchy";
import type { BusinessUnit, CreateBusinessUnitInput, UpdateBusinessUnitInput } from "@/lib/types";

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

function assertReadPermission(permissions: string[]) {
  if (!permissions.includes("clients:read")) {
    throw new AccessControlError("You do not have permission to read Business Units.", 403);
  }
}

function assertWritePermission(permissions: string[]) {
  if (!permissions.includes("clients:write")) {
    throw new AccessControlError("You do not have permission to modify Business Units.", 403);
  }
}

function normalizeBusinessUnit(row: Record<string, unknown>) {
  return {
    id: textValue(row.id),
    client_id: textValue(row.client_id),
    code: textValue(row.code),
    name: textValue(row.name),
    description: textValue(row.description) || null,
    status: statusValue(row.status),
    created_by: textValue(row.created_by) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    archived_at: textValue(row.archived_at) || null
  } as BusinessUnit;
}

export async function assertBusinessUnitAccess(params: {
  request?: Request;
  clientId: string;
  businessUnitId?: string | null;
  canWrite?: boolean;
}) {
  const clientId = textValue(params.clientId);
  if (!clientId) throw new AccessControlError("clientId is required.", 400);

  const authContext = await getAuthenticatedUserContext(params.request);
  const registry = await getProjectAccessRegistry(params.request);

  if (params.canWrite) {
    assertWritePermission(registry.permissions);
    if (!authContext.is_admin) {
      throw new AccessControlError("Only admins can modify Business Units at this stage.", 403);
    }
  } else {
    assertReadPermission(registry.permissions);
    if (!authContext.is_admin) {
      if (authContext.role !== "client" || authContext.client_id !== clientId) {
        throw new AccessControlError("You do not have access to this client.", 403);
      }
    }
  }

  const businessUnit = params.businessUnitId
    ? await validateClientBusinessUnitRelation({
        clientId,
        businessUnitId: params.businessUnitId,
        includeArchived: true
      })
    : null;

  return {
    authContext,
    clientId,
    businessUnit
  };
}

export async function getBusinessUnitsForClient(params: {
  request?: Request;
  clientId: string;
  includeArchived?: boolean;
}) {
  const includeArchived = Boolean(params.includeArchived);
  const access = await assertBusinessUnitAccess({ request: params.request, clientId: params.clientId, canWrite: false });

  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived Business Units.", 403);
  }

  const supabase = createAdminSupabase();
  let query = supabase
    .from("business_units")
    .select("*")
    .eq("client_id", access.clientId)
    .order("created_at", { ascending: true });

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load Business Units: ${error.message}`, 500);
  return (data ?? []).map((row) => normalizeBusinessUnit(row as Record<string, unknown>));
}

export async function getBusinessUnitById(params: {
  request?: Request;
  clientId: string;
  businessUnitId: string;
  includeArchived?: boolean;
}) {
  const includeArchived = Boolean(params.includeArchived);
  const access = await assertBusinessUnitAccess({
    request: params.request,
    clientId: params.clientId,
    businessUnitId: params.businessUnitId,
    canWrite: false
  });

  if (!access.businessUnit) return null;
  if (!includeArchived && access.businessUnit.archived_at) return null;
  return access.businessUnit as BusinessUnit;
}

export async function createBusinessUnit(params: { request?: Request; input: CreateBusinessUnitInput }) {
  const input = params.input;
  const access = await assertBusinessUnitAccess({ request: params.request, clientId: input.clientId, canWrite: true });

  const name = textValue(input.name);
  if (!name) throw new AccessControlError("Business Unit name is required.", 400);
  const code = codeToken(textValue(input.code || ""));
  if (!code) throw new AccessControlError("Business Unit code is required.", 400);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("business_units")
    .insert({
      client_id: access.clientId,
      code,
      name,
      description: textValue(input.description || "") || null,
      status: statusValue(input.status),
      created_by: access.authContext.user_id
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Business Unit code must be unique within the client.", 409);
    }
    throw new AccessControlError(`Could not create Business Unit: ${error.message}`, 500);
  }

  return normalizeBusinessUnit(data as Record<string, unknown>);
}

export async function updateBusinessUnit(params: { request?: Request; input: UpdateBusinessUnitInput }) {
  const input = params.input;
  const access = await assertBusinessUnitAccess({
    request: params.request,
    clientId: input.clientId,
    businessUnitId: input.id,
    canWrite: true
  });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof input.code === "string") updates.code = codeToken(input.code);
  if (typeof input.name === "string") updates.name = textValue(input.name);
  if ("description" in input) updates.description = textValue(input.description || "") || null;
  if (input.status) updates.status = statusValue(input.status);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("business_units")
    .update(updates)
    .eq("id", input.id)
    .eq("client_id", input.clientId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Business Unit code must be unique within the client.", 409);
    }
    throw new AccessControlError(`Could not update Business Unit: ${error.message}`, 500);
  }

  return normalizeBusinessUnit(data as Record<string, unknown>);
}

export async function archiveBusinessUnit(params: {
  request?: Request;
  clientId: string;
  businessUnitId: string;
}) {
  await assertBusinessUnitAccess({
    request: params.request,
    clientId: params.clientId,
    businessUnitId: params.businessUnitId,
    canWrite: true
  });

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("business_units")
    .update({
      archived_at: new Date().toISOString(),
      status: "archived",
      updated_at: new Date().toISOString()
    })
    .eq("id", params.businessUnitId)
    .eq("client_id", params.clientId)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive Business Unit: ${error.message}`, 500);
  return normalizeBusinessUnit(data as Record<string, unknown>);
}
