import { NextResponse } from "next/server";
import { accessControlErrorResponse, getAuthenticatedUserContext, requireAdmin } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { NIGERIA_STATES } from "@/lib/geography";
import {
  ImportLocationRow,
  LocationPayload,
  normalizeRow,
  compileDeploymentLocationImport
} from "@/lib/deploymentLocationsImport";

export const dynamic = "force-dynamic";

const CANONICAL_STATE_BY_NORMALIZED = new Map(
  (NIGERIA_STATES as readonly string[]).map((state) => [normalizeStateToken(state), state])
);

function normalizeStateToken(value: unknown) {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s+state$/i, "")
        .toLowerCase()
    : "";
}

function parseStateAssignments(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    // Legacy non-JSON text values are handled below.
  }

  if (trimmed.includes(",")) {
    return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [trimmed];
}

function canonicalizeStates(values: string[]) {
  const canonical = values
    .map((value) => CANONICAL_STATE_BY_NORMALIZED.get(normalizeStateToken(value)) ?? "")
    .filter(Boolean);
  return Array.from(new Set(canonical));
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    const context = await getAuthenticatedUserContext(request);
    if (!["admin", "installer"].includes(context.role)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const state = url.searchParams.get("state")?.trim() ?? "";
    const projectId = url.searchParams.get("projectId")?.trim() ?? "";
    const requestedState = CANONICAL_STATE_BY_NORMALIZED.get(normalizeStateToken(state)) ?? "";
    const supabase = createAdminSupabase();
    let query = supabase
      .from("deployment_locations")
      .select("*")
      .order("state", { ascending: true })
      .order("outlet_name", { ascending: true });

    let installerAssignedStates: string[] = [];

    if (context.role === "installer") {
      const { data: installerRow, error: installerError } = await supabase
        .from("installers")
        .select("*")
        .eq("user_id", context.user_id)
        .maybeSingle();

      const { data: profileRow, error: profileError } = await supabase
        .schema("public")
        .from("user_profiles")
        .select("email, full_name")
        .eq("user_id", context.user_id)
        .maybeSingle();

      if (installerError) {
        return NextResponse.json({ error: installerError.message }, { status: 500 });
      }
      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }

      // Installer assignment is the source-of-truth for outlet directory scope.
      // If an installer record has no explicit assigned states, preserve legacy pilot behavior (no state restriction).
      const rawAssignedStates = parseStateAssignments(installerRow?.assigned_states);
      const rawInstallerState = safeString((installerRow as Record<string, unknown> | null)?.state);
      const assignedStates = canonicalizeStates([
        ...rawAssignedStates,
        // Legacy compatibility: some historical installer rows used a single `state` field.
        rawInstallerState
      ]);
      installerAssignedStates = assignedStates;

      if (assignedStates.length > 0) {
        if (requestedState && !assignedStates.includes(requestedState)) {
          console.warn("[deployment-locations] installer state access denied", {
            finalDecision: "deny",
            userId: context.user_id,
            email: safeString(context.email),
            authClientId: context.client_id,
            authAllowedProjectIds: context.allowed_project_ids,
            projectId: projectId || null,
            installerFound: Boolean(installerRow),
            installerId: typeof installerRow?.id === "string" ? installerRow.id : null,
            installerEmail: safeString(profileRow?.email),
            installerName: safeString(profileRow?.full_name),
            installerUserId: safeString((installerRow as Record<string, unknown> | null)?.user_id),
            installerStatus: safeString((installerRow as Record<string, unknown> | null)?.status),
            installerAccessStatus: safeString((installerRow as Record<string, unknown> | null)?.access_status),
            rawAssignedStates,
            rawInstallerState: rawInstallerState || null,
            requestedStateRaw: state || null,
            requestedStateNormalized: requestedState || null,
            assignedStatesNormalized: assignedStates,
            reason: "requested_state_not_in_effective_installer_state_scope"
          });
          return NextResponse.json({ error: "You do not have access to this state directory scope." }, { status: 403 });
        }
      }
    }

    if (requestedState) {
      query = query.ilike("state", requestedState);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const locations = (data ?? []) as Array<Record<string, unknown>>;
    if (context.role === "installer" && installerAssignedStates.length > 0) {
      const assigned = new Set(installerAssignedStates.map((value) => normalizeStateToken(value)));
      const filteredLocations = locations.filter((row) => assigned.has(normalizeStateToken(row.state)));
      return NextResponse.json({ locations: filteredLocations });
    }

    return NextResponse.json({ locations });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);

    const body = (await request.json().catch(() => null)) as { rows?: ImportLocationRow[] } | null;
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "Please import at least one outlet row." }, { status: 400 });
    }

    const normalized = rows.map(normalizeRow);
    const firstError = normalized.find((item) => "error" in item);
    if (firstError && "error" in firstError) {
      return NextResponse.json({ error: firstError.error }, { status: 400 });
    }

    const payload = normalized
      .map((item) => ("data" in item ? item.data : null))
      .filter((item): item is LocationPayload => Boolean(item));

    const supabase = createAdminSupabase();
    const states = Array.from(new Set(payload.map((row) => row.state))).filter(Boolean);

    const { data: existingRows, error: existingError } = await supabase
      .from("deployment_locations")
      .select("state,outlet_name,address,outlet_code")
      .in("state", states);

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const { rowsToInsert, skippedExactDuplicates, outletCodeCollisionsRetained } = compileDeploymentLocationImport(
      payload,
      existingRows ?? []
    );

    let imported = 0;
    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("deployment_locations")
        .insert(rowsToInsert);

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      imported = rowsToInsert.length;
    }

    return NextResponse.json({
      imported,
      skippedExactDuplicates,
      outletCodeCollisionsRetained
    });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function DELETE() {
  try {
    await requireAdmin();

    const { count, error } = await createAdminSupabase()
      .from("deployment_locations")
      .delete({ count: "exact" })
      .not("id", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ removed: count ?? 0 });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
