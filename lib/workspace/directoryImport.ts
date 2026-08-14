import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import {
  directoryTemplateCsv,
  previewDeploymentLocationImport,
  templateForProduct,
  type DirectoryImportPreview,
  type ImportLocationRow,
  type LocationPayload,
} from "@/lib/deploymentLocationsImport";
import {
  CustomerWorkspaceRedirect,
  resolveCustomerWorkspaceContext,
  type CustomerWorkspaceContext,
} from "@/lib/workspace/customerAdmin";

export type DirectoryDashboard = {
  totalRecords: number;
  recentlyImported: number;
  statesCovered: number;
  duplicateRecords: number;
  lastImport: string | null;
  importHealth: "Not Started" | "Ready" | "Needs Review";
  history: DirectoryImportHistoryItem[];
};

export type DirectoryImportHistoryItem = {
  id: string;
  importDate: string;
  importedBy: string | null;
  recordsImported: number;
  duplicates: number;
  errors: number;
  warnings: number;
  status: string;
  summary: Record<string, unknown>;
  errorReport: unknown[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function publicError(error: unknown) {
  if (error instanceof CustomerWorkspaceRedirect) {
    return Object.assign(new Error("Customer workspace access is required."), { status: 401 });
  }
  return error;
}

async function customerWorkspace() {
  try {
    return await resolveCustomerWorkspaceContext();
  } catch (error) {
    throw publicError(error);
  }
}

function sheetRows(buffer: ArrayBuffer): ImportLocationRow[] {
  const workbook = XLSX.read(Buffer.from(buffer), {
    type: "buffer",
    raw: false,
    cellDates: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: false,
  });
  return rows as ImportLocationRow[];
}

function payloadRows(rows: LocationPayload[]) {
  return rows.map((row) => ({
    state: row.state,
    outlet_name: row.outlet_name,
    owner_name: row.owner_name,
    address: row.address,
    brand_type: row.brand_type,
    outlet_code: row.outlet_code,
    external_id: row.external_id ?? row.outlet_code,
    directory_record_type: row.directory_record_type,
    latitude: row.latitude,
    longitude: row.longitude,
    raw_data: row.raw_data ?? {},
  }));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function importSourceHash(input: {
  workspace: CustomerWorkspaceContext;
  rows: ImportLocationRow[];
  source: string;
}) {
  return createHash("sha256")
    .update(stableJson({
      clientId: input.workspace.clientId,
      workspaceId: input.workspace.clientId,
      productKey: input.workspace.productKey,
      source: input.source || "upload",
      rows: input.rows,
    }))
    .digest("hex");
}

async function existingTenantDirectoryRows(workspace: CustomerWorkspaceContext) {
  const { data, error } = await createAdminSupabase()
    .from("deployment_locations")
    .select("state,outlet_name,address,outlet_code,external_id")
    .eq("client_id", workspace.clientId)
    .eq("product_key", workspace.productKey);

  if (error) throw error;
  return (data ?? []) as Array<Pick<LocationPayload, "state" | "outlet_name" | "address" | "outlet_code" | "external_id">>;
}

export async function buildDirectoryTemplateResponse() {
  const workspace = await customerWorkspace();
  const template = templateForProduct(workspace.productKey);
  return {
    workspace,
    template,
    csv: directoryTemplateCsv(workspace.productKey),
  };
}

export async function previewWorkspaceDirectoryImport(input: {
  file: File;
}): Promise<{ workspace: CustomerWorkspaceContext; preview: DirectoryImportPreview; rows: ImportLocationRow[] }> {
  const workspace = await customerWorkspace();
  const buffer = await input.file.arrayBuffer();
  const rows = sheetRows(buffer);
  const existingRows = await existingTenantDirectoryRows(workspace);
  const preview = previewDeploymentLocationImport(rows, existingRows, workspace.productKey);
  return { workspace, preview, rows };
}

export async function commitWorkspaceDirectoryImport(input: {
  rows: ImportLocationRow[];
  source: string;
}) {
  const workspace = await customerWorkspace();
  const existingRows = await existingTenantDirectoryRows(workspace);
  const preview = previewDeploymentLocationImport(input.rows, existingRows, workspace.productKey);
  if (preview.errors.length > 0 || preview.duplicates > 0) {
    const message = preview.errors.length > 0 && preview.duplicates > 0
      ? "Resolve the duplicate and validation errors before committing."
      : preview.errors.length > 0
        ? "Resolve the validation errors before committing."
        : "Resolve the duplicate records before committing.";
    throw Object.assign(new Error(message), { status: 400, preview });
  }

  const summary = {
    imported: preview.imported,
    skipped: preview.skipped,
    duplicateCount: preview.duplicates,
    errorCount: preview.errors.length,
    warningCount: preview.warnings.length,
    informationCount: preview.information.length,
  };
  const sourceFileHash = importSourceHash({
    workspace,
    rows: input.rows,
    source: input.source || "upload",
  });

  const { data, error } = await createAdminSupabase().rpc("commit_workspace_directory_import", {
    p_client_id: workspace.clientId,
    p_workspace_id: workspace.clientId,
    p_product_key: workspace.productKey,
    p_directory_label: preview.template.directoryLabel,
    p_imported_by: workspace.userId,
    p_import_source: input.source || "upload",
    p_rows: payloadRows(preview.rowsToInsert),
    p_summary: summary,
    p_error_report: preview.errorReport,
    p_idempotency_key: sourceFileHash,
    p_source_file_hash: sourceFileHash,
    p_preview_token_hash: null,
  });

  if (error) throw error;
  return {
    workspace,
    batchId: String(data ?? ""),
    preview,
    summary,
  };
}

export async function getWorkspaceDirectoryDashboard(): Promise<{ workspace: CustomerWorkspaceContext; dashboard: DirectoryDashboard }> {
  const workspace = await customerWorkspace();
  const supabase = createAdminSupabase();
  const [{ count: totalRecords }, { data: states }, { data: historyRows }] = await Promise.all([
    supabase
      .from("deployment_locations")
      .select("id", { count: "exact", head: true })
      .eq("client_id", workspace.clientId)
      .eq("product_key", workspace.productKey),
    supabase
      .from("deployment_locations")
      .select("state")
      .eq("client_id", workspace.clientId)
      .eq("product_key", workspace.productKey),
    supabase
      .from("workspace_directory_import_batches")
      .select("id,imported_at,imported_by,records_imported,duplicate_count,error_count,warning_count,status,summary,error_report")
      .eq("client_id", workspace.clientId)
      .eq("product_key", workspace.productKey)
      .order("imported_at", { ascending: false })
      .limit(10),
  ]);

  const history: DirectoryImportHistoryItem[] = ((historyRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: text(row.id),
    importDate: text(row.imported_at),
    importedBy: text(row.imported_by) || null,
    recordsImported: numberValue(row.records_imported),
    duplicates: numberValue(row.duplicate_count),
    errors: numberValue(row.error_count),
    warnings: numberValue(row.warning_count),
    status: text(row.status) || "completed",
    summary: (row.summary as Record<string, unknown>) ?? {},
    errorReport: Array.isArray(row.error_report) ? row.error_report : [],
  }));

  const coveredStates = new Set((states ?? []).map((row) => text((row as { state?: unknown }).state)).filter(Boolean));
  const duplicateRecords = history.reduce((total, item) => total + item.duplicates, 0);
  const lastImport = history[0]?.importDate ?? null;
  const importHealth = (totalRecords ?? 0) === 0 ? "Not Started" : duplicateRecords > 0 ? "Needs Review" : "Ready";

  return {
    workspace,
    dashboard: {
      totalRecords: totalRecords ?? 0,
      recentlyImported: history[0]?.recordsImported ?? 0,
      statesCovered: coveredStates.size,
      duplicateRecords,
      lastImport,
      importHealth,
      history,
    },
  };
}
