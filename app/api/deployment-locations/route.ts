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

const STATE_CODE_MAP: Record<string, string> = {
  Lagos: "LAG",
  Ogun: "OGU",
  Enugu: "ENU",
  Abuja: "FCT",
  FCT: "FCT",
  "Federal Capital Territory": "FCT"
};

function clean(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function stateCodeFor(state: string) {
  return STATE_CODE_MAP[state] ?? state.slice(0, 3).toUpperCase();
}

function outletUidPrefix(state: string) {
  return `DQ-GOD-${stateCodeFor(state)}`;
}

function extractOutletSerial(outletCode: string | null, prefix: string) {
  if (!outletCode?.startsWith(`${prefix}-`)) return 0;
  const serial = Number(outletCode.slice(prefix.length + 1));
  return Number.isFinite(serial) ? serial : 0;
}

function formatOutletUid(state: string, serial: number) {
  return `${outletUidPrefix(state)}-${String(serial).padStart(4, "0")}`;
}

function normalizeProvidedOutletCode(outletCode: string) {
  const normalized = outletCode.trim();
  if (!normalized) return null;
  return normalized.replace(/^(\d+)\.0+$/, "$1");
}

function normalizeRow(row: ImportLocationRow): { data: LocationPayload } | { error: string } {
  const state = clean(row.state);
  const outletName = clean(row.outlet_name ?? row.outletName);
  const outletCode = clean(row.outlet_code ?? row.outletCode);

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
      outlet_code: normalizeProvidedOutletCode(outletCode),
      updated_at: new Date().toISOString()
    }
  };
}

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

  const payload: LocationPayload[] = normalized
    .map((item) => ("data" in item ? item.data : null))
    .filter((item): item is LocationPayload => Boolean(item));

  const supabase = createAdminSupabase();
  const nextSerialByState = new Map<string, number>();
  const payloadWithCodes: Array<LocationPayload & { outlet_code: string }> = [];

  for (const row of payload) {
    if (row.outlet_code) {
      payloadWithCodes.push({ ...row, outlet_code: row.outlet_code });
      continue;
    }

    if (!nextSerialByState.has(row.state)) {
      const prefix = outletUidPrefix(row.state);
      const { data: existingCodes, error: serialError } = await supabase
        .from("deployment_locations")
        .select("outlet_code")
        .eq("state", row.state)
        .like("outlet_code", `${prefix}-%`);

      if (serialError) return NextResponse.json({ error: serialError.message }, { status: 500 });

      const currentMax = (existingCodes ?? []).reduce(
        (max, item) => Math.max(max, extractOutletSerial(item.outlet_code, prefix)),
        0
      );
      nextSerialByState.set(row.state, currentMax + 1);
    }

    const nextSerial = nextSerialByState.get(row.state) ?? 1;
    payloadWithCodes.push({ ...row, outlet_code: formatOutletUid(row.state, nextSerial) });
    nextSerialByState.set(row.state, nextSerial + 1);
  }

  const rowsWithCode = payloadWithCodes;
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

  return NextResponse.json({ imported });
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
