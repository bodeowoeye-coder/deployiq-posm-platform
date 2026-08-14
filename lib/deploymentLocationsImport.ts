import { NIGERIA_STATES } from "./geography.ts";

export type ImportLocationRow = {
  state?: unknown;
  outlet_name?: unknown;
  outletName?: unknown;
  name?: unknown;
  vehicle_id?: unknown;
  vehicleId?: unknown;
  site_name?: unknown;
  siteName?: unknown;
  facility_name?: unknown;
  facilityName?: unknown;
  owner_name?: unknown;
  ownerName?: unknown;
  address?: unknown;
  brand_type?: unknown;
  brandType?: unknown;
  type?: unknown;
  outlet_code?: unknown;
  outletCode?: unknown;
  code?: unknown;
  external_id?: unknown;
  externalId?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

export type LocationPayload = {
  state: string;
  outlet_name: string;
  owner_name: string | null;
  address: string | null;
  brand_type: string | null;
  outlet_code: string | null;
  external_id?: string | null;
  directory_record_type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  raw_data?: Record<string, unknown>;
  updated_at: string;
};

export type DeploymentLocationImportSummary = {
  rowsToInsert: LocationPayload[];
  skippedExactDuplicates: number;
  outletCodeCollisionsRetained: number;
};

export type DirectoryProductKey = "retail" | "fleet" | "build" | "healthcare" | string;

export type DirectoryTemplate = {
  productKey: DirectoryProductKey;
  directoryLabel: string;
  recordLabel: string;
  headers: string[];
  sampleRows: ImportLocationRow[];
};

export type ImportIssueSeverity = "error" | "warning" | "info";

export type ImportIssue = {
  rowNumber: number;
  field: string;
  severity: ImportIssueSeverity;
  message: string;
};

export type ImportPreviewRow = {
  rowNumber: number;
  state: string;
  outlet_name: string;
  address: string | null;
  outlet_code: string | null;
  status: "ready" | "duplicate" | "invalid";
  duplicateReason?: string;
  duplicateOf?: string;
  errorMessage?: string;
};

export type DirectoryImportPreview = {
  template: DirectoryTemplate;
  previewRows: ImportPreviewRow[];
  rowsToInsert: LocationPayload[];
  imported: number;
  skipped: number;
  duplicates: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  information: ImportIssue[];
  errorReport: ImportIssue[];
};

const PRODUCT_TEMPLATES: Record<string, DirectoryTemplate> = {
  retail: {
    productKey: "retail",
    directoryLabel: "Outlet Directory",
    recordLabel: "outlet",
    headers: ["state", "outlet_name", "owner_name", "address", "brand_type", "outlet_code", "latitude", "longitude"],
    sampleRows: [
      { state: "Lagos", outlet_name: "Victoria Island Flagship", owner_name: "Store Manager", address: "1 Example Street, Victoria Island", brand_type: "Retail", outlet_code: "RET-001", latitude: "6.4281", longitude: "3.4219" },
      { state: "Abuja", outlet_name: "Wuse Service Point", owner_name: "Operations Lead", address: "2 Example Avenue, Wuse", brand_type: "Retail", outlet_code: "RET-002", latitude: "9.0765", longitude: "7.3986" },
    ],
  },
  fleet: {
    productKey: "fleet",
    directoryLabel: "Vehicle Directory",
    recordLabel: "vehicle",
    headers: ["state", "vehicle_id", "owner_name", "address", "brand_type", "external_id", "latitude", "longitude"],
    sampleRows: [
      { state: "Lagos", vehicle_id: "Fleet Van 001", owner_name: "Fleet Lead", address: "Ikeja Depot", brand_type: "Van", external_id: "VEH-001", latitude: "6.6018", longitude: "3.3515" },
    ],
  },
  build: {
    productKey: "build",
    directoryLabel: "Property / Site Directory",
    recordLabel: "site",
    headers: ["state", "site_name", "owner_name", "address", "type", "external_id", "latitude", "longitude"],
    sampleRows: [
      { state: "Lagos", site_name: "Lekki Phase 1 Site", owner_name: "Site Manager", address: "Lekki Phase 1", type: "Commercial", external_id: "SITE-001", latitude: "6.4698", longitude: "3.5852" },
    ],
  },
  healthcare: {
    productKey: "healthcare",
    directoryLabel: "Facility Directory",
    recordLabel: "facility",
    headers: ["state", "facility_name", "owner_name", "address", "type", "external_id", "latitude", "longitude"],
    sampleRows: [
      { state: "Lagos", facility_name: "Example Primary Care", owner_name: "Facility Lead", address: "Yaba", type: "Clinic", external_id: "FAC-001", latitude: "6.5158", longitude: "3.3841" },
    ],
  },
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

export function templateForProduct(productKey: DirectoryProductKey): DirectoryTemplate {
  return PRODUCT_TEMPLATES[clean(productKey).toLowerCase()] ?? PRODUCT_TEMPLATES.retail;
}

export function directoryTemplateCsv(productKey: DirectoryProductKey) {
  const template = templateForProduct(productKey);
  const lines = [
    template.headers.join(","),
    ...template.sampleRows.map((row) => template.headers.map((header) => JSON.stringify(row[header as keyof ImportLocationRow] ?? "")).join(",")),
  ];
  return lines.join("\n");
}

function numberOrNull(value: unknown) {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function importedName(row: ImportLocationRow) {
  return clean(row.outlet_name ?? row.outletName ?? row.name ?? row.vehicle_id ?? row.vehicleId ?? row.site_name ?? row.siteName ?? row.facility_name ?? row.facilityName);
}

export function normalizeRow(row: ImportLocationRow, productKey: DirectoryProductKey = "retail"): { data: LocationPayload } | { error: string } {
  const template = templateForProduct(productKey);
  const state = clean(row.state);
  const outletName = importedName(row);
  const outletCode = clean(row.outlet_code ?? row.outletCode ?? row.code ?? row.external_id ?? row.externalId);
  const latitude = numberOrNull(row.latitude);
  const longitude = numberOrNull(row.longitude);

  if (!state || !(NIGERIA_STATES as readonly string[]).includes(state)) {
    return { error: `Invalid or missing state for ${template.recordLabel} "${outletName || `Unnamed ${template.recordLabel}`}".` };
  }

  if (!outletName) {
    return { error: `Missing ${template.recordLabel} name for ${state}.` };
  }

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return { error: `Invalid coordinates for ${template.recordLabel} "${outletName}".` };
  }

  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    return { error: `Invalid latitude for ${template.recordLabel} "${outletName}".` };
  }

  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    return { error: `Invalid longitude for ${template.recordLabel} "${outletName}".` };
  }

  return {
    data: {
      state,
      outlet_name: outletName,
      owner_name: clean(row.owner_name ?? row.ownerName) || null,
      address: clean(row.address) || null,
      brand_type: clean(row.brand_type ?? row.brandType ?? row.type) || null,
      outlet_code: normalizeProvidedOutletCode(outletCode),
      external_id: clean(row.external_id ?? row.externalId ?? outletCode) || null,
      directory_record_type: template.recordLabel,
      latitude,
      longitude,
      raw_data: row as Record<string, unknown>,
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

export function previewDeploymentLocationImport(
  rows: ImportLocationRow[],
  existingRows: Array<Pick<LocationPayload, "state" | "outlet_name" | "address" | "outlet_code" | "external_id">>,
  productKey: DirectoryProductKey = "retail"
): DirectoryImportPreview {
  const template = templateForProduct(productKey);
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const information: ImportIssue[] = [];
  const previewRows: ImportPreviewRow[] = [];
  const rowsToInsert: LocationPayload[] = [];
  const existingKeys = new Map(existingRows.map((row) => [locationKey(row), `${row.outlet_name} in ${row.state}`]));
  const existingCodes = new Map<string, string>();
  for (const row of existingRows) {
    const code = normalizeProvidedOutletCode(row.external_id ?? row.outlet_code);
    if (code) existingCodes.set(code, `${row.outlet_name} in ${row.state}`);
  }
  const seenPayloadKeys = new Map<string, { rowNumber: number; label: string }>();
  const seenCodes = new Map<string, { rowNumber: number; label: string }>(
    Array.from(existingCodes.entries()).map(([code, label]) => [code, { rowNumber: 0, label }])
  );
  const seenNames = new Map<string, { rowNumber: number; label: string }>();
  let duplicateCount = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const normalized = normalizeRow(row, productKey);
    const name = importedName(row);
    const code = normalizeProvidedOutletCode(clean(row.outlet_code ?? row.outletCode ?? row.code ?? row.external_id ?? row.externalId));
    const state = clean(row.state);
    const duplicateDetails: string[] = [];
    let duplicateOf: string | undefined;
    if (name) {
      const key = normalizeForKey(`${clean(row.state)}:${name}`);
      const duplicateName = seenNames.get(key);
      if (duplicateName) {
        const duplicateReference = duplicateName.rowNumber > 0 ? `row ${duplicateName.rowNumber}` : duplicateName.label;
        duplicateDetails.push(`Outlet Name (${name})`);
        duplicateOf ??= duplicateReference;
      } else {
        seenNames.set(key, { rowNumber, label: `${name} in ${state || "unknown state"}` });
      }
    }
    if (code) {
      const duplicateCode = seenCodes.get(code);
      if (duplicateCode) {
        const duplicateReference = duplicateCode.rowNumber > 0 ? `row ${duplicateCode.rowNumber}` : duplicateCode.label;
        duplicateDetails.push(`Outlet Code (${code})`);
        duplicateOf ??= duplicateReference;
      } else {
        seenCodes.set(code, { rowNumber, label: `${code} for ${name || template.recordLabel}` });
      }
    }
    if (!clean(row.address)) {
      warnings.push({ rowNumber, field: "address", severity: "warning", message: "Missing address; routing and map quality may be reduced." });
    }
    if ("error" in normalized) {
      errors.push({ rowNumber, field: "row", severity: "error", message: normalized.error });
      previewRows.push({
        rowNumber,
        state,
        outlet_name: name || `Unnamed ${template.recordLabel}`,
        address: clean(row.address) || null,
        outlet_code: code,
        status: "invalid",
        errorMessage: normalized.error,
      });
      return;
    }

    const key = locationKey(normalized.data);
    const existingDuplicate = existingKeys.get(key);
    const fileDuplicate = seenPayloadKeys.get(key);
    if (existingDuplicate) {
      duplicateDetails.push("Location details");
      duplicateOf ??= existingDuplicate;
    } else if (fileDuplicate) {
      const duplicateReference = `row ${fileDuplicate.rowNumber}`;
      duplicateDetails.push("Location details");
      duplicateOf ??= duplicateReference;
    } else {
      seenPayloadKeys.set(key, { rowNumber, label: `${normalized.data.outlet_name} in ${normalized.data.state}` });
    }

    if (duplicateDetails.length > 0) {
      const duplicateLabel = duplicateOf?.replace(/^row /, "Row ") ?? "an existing record";
      const sameDetails = duplicateDetails.length === 1
        ? `Same ${duplicateDetails[0]}.`
        : `Same ${duplicateDetails.slice(0, -1).join(", ")} and ${duplicateDetails[duplicateDetails.length - 1]}.`;
      const duplicateReason = `Row ${rowNumber} duplicates ${duplicateLabel}. ${sameDetails} This row will not be imported.`;
      duplicateCount += 1;
      warnings.push({ rowNumber, field: "duplicate", severity: "warning", message: duplicateReason });
      previewRows.push({
        rowNumber,
        state: normalized.data.state,
        outlet_name: normalized.data.outlet_name,
        address: normalized.data.address,
        outlet_code: normalized.data.outlet_code,
        status: "duplicate",
        duplicateReason,
        duplicateOf,
      });
      return;
    }

    rowsToInsert.push(normalized.data);
    previewRows.push({
      rowNumber,
      state: normalized.data.state,
      outlet_name: normalized.data.outlet_name,
      address: normalized.data.address,
      outlet_code: normalized.data.outlet_code,
      status: "ready",
    });
  });

  if (rowsToInsert.length > 0) {
    information.push({
      rowNumber: 0,
      field: "import",
      severity: "info",
      message: `${rowsToInsert.length} ${template.recordLabel} record${rowsToInsert.length === 1 ? "" : "s"} ready to import.`,
    });
  }

  return {
    template,
    previewRows,
    rowsToInsert,
    imported: rowsToInsert.length,
    skipped: duplicateCount,
    duplicates: duplicateCount,
    errors,
    warnings,
    information,
    errorReport: [...errors, ...warnings],
  };
}
