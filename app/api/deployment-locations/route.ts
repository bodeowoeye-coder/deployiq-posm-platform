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

export async function GET(request: Request) {
  try {
    const context = await getAuthenticatedUserContext(request);
    if (!["admin", "installer"].includes(context.role)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const state = new URL(request.url).searchParams.get("state")?.trim() ?? "";
    const supabase = createAdminSupabase();
    let query = supabase
      .from("deployment_locations")
      .select("*")
      .order("state", { ascending: true })
      .order("outlet_name", { ascending: true });

    if (context.role === "installer") {
      const { data: installerRow, error: installerError } = await supabase
        .from("installers")
        .select("assigned_states")
        .eq("user_id", context.user_id)
        .maybeSingle();

      if (installerError) {
        return NextResponse.json({ error: installerError.message }, { status: 500 });
      }

      const assignedStates = Array.isArray(installerRow?.assigned_states)
        ? installerRow.assigned_states.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];

      if (assignedStates.length > 0) {
        if (state && !assignedStates.includes(state)) {
          return NextResponse.json({ error: "You do not have access to this state directory scope." }, { status: 403 });
        }
        query = query.in("state", assignedStates);
      }
    }

    if (state && (NIGERIA_STATES as readonly string[]).includes(state)) {
      query = query.eq("state", state);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ locations: data ?? [] });
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
