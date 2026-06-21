import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth";
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
  const context = await getCurrentUserContext();
  if (!context || !["admin", "installer"].includes(context.role.role)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const state = new URL(request.url).searchParams.get("state")?.trim() ?? "";
  let query = createAdminSupabase()
    .from("deployment_locations")
    .select("*")
    .order("state", { ascending: true })
    .order("outlet_name", { ascending: true });

  if (state && (NIGERIA_STATES as readonly string[]).includes(state)) {
    query = query.eq("state", state);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ locations: data ?? [] });
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context || context.role.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
}

export async function DELETE() {
  const context = await getCurrentUserContext();
  if (!context || context.role.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { count, error } = await createAdminSupabase()
    .from("deployment_locations")
    .delete({ count: "exact" })
    .not("id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ removed: count ?? 0 });
}
