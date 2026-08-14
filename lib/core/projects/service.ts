import { validateProjectHierarchyInput } from "@/lib/core/enterpriseHierarchy";
import { normalizeProjectRecord } from "@/lib/projects";
import type { createAdminSupabase } from "@/lib/supabaseAdmin";

type SupabaseAdmin = ReturnType<typeof createAdminSupabase>;
type Row = Record<string, unknown>;

export type CoreProjectInput = {
  projectName?: unknown;
  clientId?: unknown;
  brand?: unknown;
  brandName?: unknown;
  brandId?: unknown;
  campaignName?: unknown;
  projectType?: unknown;
  projectCode?: unknown;
  businessUnitId?: unknown;
  portfolioId?: unknown;
  clientProjectReference?: unknown;
  projectManager?: unknown;
  siteSupervisor?: unknown;
  consultant?: unknown;
  contractor?: unknown;
  targetQuantity?: unknown;
  status?: unknown;
  regionsCovered?: unknown;
  assignedInstallers?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  plannedCompletion?: unknown;
  actualCompletion?: unknown;
  budget?: unknown;
  currency?: unknown;
  targetRegion?: unknown;
  targetState?: unknown;
  targetInstaller?: unknown;
  targetAgency?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function positiveNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : Number.NaN;
}

export const CORE_PROJECT_INSERT_COLUMNS = [
  "client_id",
  "name",
  "brand",
  "brand_id",
  "campaign",
  "target_quantity",
  "status",
  "regions_covered",
  "assigned_installers",
  "primary_target_region",
  "primary_target_state",
  "start_date",
  "end_date",
  "planned_completion",
  "actual_completion",
] as const;

export function isMissingProjectBrandColumn(error: { code?: string; message?: string; details?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  const details = error?.details?.toLowerCase() ?? "";
  const combined = `${message} ${details}`;
  return combined.includes("brand_id") && (combined.includes("projects") || combined.includes("schema cache") || combined.includes("could not find"));
}

export function buildCoreProjectInsertPayload(input: CoreProjectInput, clientId: string, targetQuantity: number) {
  return {
    client_id: clientId,
    name: text(input.projectName),
    brand: text(input.brand) || text(input.brandName) || null,
    brand_id: text(input.brandId) || null,
    campaign: text(input.campaignName) || null,
    target_quantity: targetQuantity,
    status: text(input.status) || "Planning",
    regions_covered: textArray(input.regionsCovered),
    assigned_installers: textArray(input.assignedInstallers),
    primary_target_region: text(input.targetRegion) || null,
    primary_target_state: text(input.targetState) || null,
    start_date: text(input.startDate) || null,
    end_date: text(input.endDate) || null,
    planned_completion: text(input.plannedCompletion) || null,
    actual_completion: text(input.actualCompletion) || null,
  };
}

function projectPayload(input: CoreProjectInput, clientId: string) {
  const targetQuantity = positiveNumber(input.targetQuantity);
  const businessUnitId = text(input.businessUnitId) || null;
  const portfolioId = text(input.portfolioId) || null;
  return {
    payload: buildCoreProjectInsertPayload(input, clientId, targetQuantity),
    businessUnitId,
    portfolioId,
    targetQuantity,
  };
}

export async function createCoreProject(input: CoreProjectInput & { supabase: SupabaseAdmin; actorUserId: string }) {
  const clientId = text(input.clientId);
  const projectName = text(input.projectName);
  const targetQuantity = positiveNumber(input.targetQuantity);
  if (!projectName || !clientId || !Number.isFinite(targetQuantity) || targetQuantity < 0) {
    throw Object.assign(new Error("Project name, client, and valid target quantity are required."), { status: 400 });
  }

  const { payload, businessUnitId, portfolioId } = projectPayload(input, clientId);
  await validateProjectHierarchyInput({ clientId, businessUnitId, portfolioId });
  if (process.env.NODE_ENV !== "production") {
    console.info("[core-project-write]", { insertKeys: Object.keys(payload) });
  }

  const { data: project, error } = await input.supabase.from("projects").insert(payload).select().single();
  if (error) throw error;

  const setupWrites = await Promise.allSettled([
    input.supabase.from("client_projects").upsert({ client_id: clientId, project_id: project.id }),
    input.supabase.from("deployment_progress").upsert(
      ["production", "warehouse", "in_transit", "installed", "approved"].map((stage_code) => ({
        project_id: project.id,
        stage_code,
        quantity: 0,
        updated_by: input.actorUserId,
      })),
    ),
    targetQuantity > 0
      ? input.supabase.from("project_targets").insert({
          project_id: project.id,
          installer_name: text(input.targetInstaller) || null,
          region: text(input.targetRegion) || null,
          state: text(input.targetState) || null,
          target_quantity: targetQuantity,
          deployment_timeline_start: text(input.startDate) || null,
          deployment_timeline_end: text(input.endDate) || null,
        })
      : Promise.resolve(),
  ]);
  for (const result of setupWrites) {
    if (result.status === "rejected") console.warn("[core-project-write]", { step: "Optional project setup skipped", error: result.reason instanceof Error ? result.reason.message : "Unknown error" });
    if (result.status === "fulfilled" && result.value?.error) console.warn("[core-project-write]", { step: "Optional project setup skipped", error: result.value.error.message });
  }

  return normalizeProjectRecord(project);
}

export async function updateCoreProject(input: CoreProjectInput & { id: string; supabase: SupabaseAdmin; archived?: unknown }) {
  const id = text(input.id);
  if (!id) throw Object.assign(new Error("Missing project id."), { status: 400 });
  if (!text(input.projectName)) throw Object.assign(new Error("Project name is required."), { status: 400 });

  const { data: existingProject, error: existingProjectError } = await input.supabase
    .from("projects")
    .select("id, client_id")
    .eq("id", id)
    .maybeSingle();
  if (existingProjectError) throw existingProjectError;
  if (!existingProject) throw Object.assign(new Error("Project not found."), { status: 404 });

  const { payload, businessUnitId, portfolioId, targetQuantity } = projectPayload(input, text((existingProject as Row).client_id));
  delete (payload as Row).client_id;
  if (input.brandId === undefined) {
    delete (payload as Row).brand_id;
  }
  if (!Number.isFinite(targetQuantity) || targetQuantity < 0) {
    throw Object.assign(new Error("Target quantity must be valid."), { status: 400 });
  }
  await validateProjectHierarchyInput({ clientId: text((existingProject as Row).client_id), businessUnitId, portfolioId });

  const { data: project, error } = await input.supabase
    .from("projects")
    .update({ ...payload, archived_at: (input as { archived?: unknown }).archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return normalizeProjectRecord(project);
}
