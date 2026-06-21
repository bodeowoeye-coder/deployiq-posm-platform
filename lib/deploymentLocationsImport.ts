import { NIGERIA_STATES } from "@/lib/geography";

export type ImportLocationRow = {
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

export type LocationPayload = {
  state: string;
  outlet_name: string;
  owner_name: string | null;
  address: string | null;
  brand_type: string | null;
  outlet_code: string | null;
  updated_at: string;
};

export type DeploymentLocationImportSummary = {
  rowsToInsert: LocationPayload[];
  skippedExactDuplicates: number;
  outletCodeCollisionsRetained: number;
};

export function clean(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeForKey(value: string | null | undefined) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

export function locationKey(location: {
  state: string;
  outlet_name: string;
  address: string | null;
}) {
  return `${normalizeForKey(location.outlet_name)}||${normalizeForKey(location.address)}||${normalizeForKey(location.state)}`;
}

export function normalizeProvidedOutletCode(outletCode: string | null) {
  const cleaned = clean(outletCode);
  if (!cleaned) return null;
  return cleaned.replace(/^([0-9]+)\.0+$/, "$1");
}

export function normalizeRow(row: ImportLocationRow): { data: LocationPayload } | { error: string } {
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

export function compileDeploymentLocationImport(
  payload: LocationPayload[],
  existingRows: Array<Pick<LocationPayload, "state" | "outlet_name" | "address" | "outlet_code">>
): DeploymentLocationImportSummary {
  const existingKeys = new Set(existingRows.map((row) => locationKey(row)));
  const existingCodes = new Set(
    existingRows
      .map((row) => normalizeProvidedOutletCode(row.outlet_code))
      .filter((code): code is string => Boolean(code))
  );

  const seenPayloadKeys = new Set<string>();
  const seenCodes = new Set(existingCodes);
  const rowsToInsert: LocationPayload[] = [];
  let skippedExactDuplicates = 0;
  let outletCodeCollisionsRetained = 0;

  for (const row of payload) {
    const key = locationKey(row);
    if (seenPayloadKeys.has(key) || existingKeys.has(key)) {
      skippedExactDuplicates += 1;
      continue;
    }

    seenPayloadKeys.add(key);

    const normalizedCode = normalizeProvidedOutletCode(row.outlet_code);
    if (normalizedCode) {
      if (seenCodes.has(normalizedCode)) {
        outletCodeCollisionsRetained += 1;
      }
      seenCodes.add(normalizedCode);
    }

    rowsToInsert.push({ ...row, outlet_code: normalizedCode });
  }

  return {
    rowsToInsert,
    skippedExactDuplicates,
    outletCodeCollisionsRetained
  };
}
