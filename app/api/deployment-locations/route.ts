import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { NIGERIA_STATES } from "@/lib/geography";

export const dynamic = "force-dynamic";

type ImportLocationRow = {
  state?: unknown;
  outlet_name?: unknown;
  outletName?: unknown;
  owner_name?: unknown;
  ownerName?: unknown;
  address?: unknown;
  brand_type?: unknown;
  brandType?: unknown;
  outlet_code?: unknown;
  outletCode?: unknown;
};

type LocationPayload = {
  state: string;
  outlet_name: string;
  owner_name: string | null;
  address: string | null;
  brand_type: string | null;
  outlet_code: string | null;
  updated_at: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRow(row: ImportLocationRow): { data: LocationPayload } | { error: string } {
  const state = clean(row.state);
  const outletName = clean(row.outlet_name ?? row.outletName);

  if (!state || !(NIGERIA_STATES as readonly string[]).includes(state)) {
    return { error: `Invalid or missing state for outlet "${outletName || "Unnamed outlet"}".` };
  }

  if (!outletName) {
    return { error: `Missing outlet name for ${state}.` };
  }

  return {
    data: {
      state,
      outlet_name: outletName,
      owner_name: clean(row.owner_name ?? row.ownerName) || null,
      address: clean(row.address) || null,
      brand_type: clean(row.brand_type ?? row.brandType) || null,
      outlet_code: clean(row.outlet_code ?? row.outletCode) || null,
      updated_at: new Date().toISOString()
    }
  };
}

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context || !["admin", "installer"].includes(context.role.role)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await createAdminSupabase()
    .from("deployment_locations")
    .select("*")
    .order("state", { ascending: true })
    .order("outlet_name", { ascending: true });

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

  const payload: LocationPayload[] = normalized
    .map((item) => ("data" in item ? item.data : null))
    .filter((item): item is LocationPayload => Boolean(item));

  const rowsWithCode = payload.filter((item): item is LocationPayload & { outlet_code: string } => Boolean(item.outlet_code));
  const rowsWithoutCode = payload.filter((item) => !item.outlet_code);
  const supabase = createAdminSupabase();
  let imported = 0;

  if (rowsWithCode.length > 0) {
    for (const row of rowsWithCode) {
      const { data: existing, error: lookupError } = await supabase
        .from("deployment_locations")
        .select("id")
        .eq("outlet_code", row.outlet_code)
        .maybeSingle();

      if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

      const result = existing?.id
        ? await supabase.from("deployment_locations").update(row).eq("id", existing.id).select("id").single()
        : await supabase.from("deployment_locations").insert(row).select("id").single();

      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      imported += 1;
    }
  }

  if (rowsWithoutCode.length > 0) {
    const { data, error } = await supabase
      .from("deployment_locations")
      .insert(rowsWithoutCode)
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    imported += data?.length ?? rowsWithoutCode.length;
  }

  return NextResponse.json({ imported });
}
