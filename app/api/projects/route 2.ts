import { NextResponse } from "next/server";
import { accessControlErrorResponse, getAuthenticatedUserContext, requireAdmin } from "@/lib/accessControl";
import { validateProjectHierarchyInput } from "@/lib/core/enterpriseHierarchy";
import { normalizeProjectRecord, normalizeProjectRecords } from "@/lib/projects";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function isMissingProjectBrandColumn(error: { code?: string; message?: string; details?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  const details = error?.details?.toLowerCase() ?? "";
  const combined = `${message} ${details}`;
  return (
    combined.includes("brand_id") &&
    (combined.includes("projects") || combined.includes("schema cache") || combined.includes("could not find"))
  );
}

export async function GET() {
  try {
    const context = await getAuthenticatedUserContext();
    const supabase = createAdminSupabase();
    let query = supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (context.role === "client") {
      if (!context.client_id) return NextResponse.json({ projects: [] });
      query = query.eq("client_id", context.client_id).is("archived_at", null);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ projects: normalizeProjectRecords(data ?? []) });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAdmin(request);
    const body = await request.json();
    const projectName = stringValue(body.projectName);
    const clientId = stringValue(body.clientId);
    const brandId = stringValue(body.brandId) || null;
    const campaignName = stringValue(body.campaignName) || null;
    const projectType = stringValue(body.projectType) || "Retail Deployment";
    const projectCode = stringValue(body.projectCode) || null;
    const businessUnitId = stringValue(body.businessUnitId) || null;
    const portfolioId = stringValue(body.portfolioId) || null;
    const clientProjectReference = stringValue(body.clientProjectReference) || null;
    const projectManager = stringValue(body.projectManager) || null;
    const siteSupervisor = stringValue(body.siteSupervisor) || null;
    const consultant = stringValue(body.consultant) || null;
    const contractor = stringValue(body.contractor) || null;
    const targetQuantity = Number(body.targetQuantity ?? 0);
    const status = stringValue(body.status) || "Planning";
    const regionsCovered = stringArray(body.regionsCovered);
    const assignedInstallers = stringArray(body.assignedInstallers);
    const startDate = stringValue(body.startDate) || null;
    const endDate = stringValue(body.endDate) || null;
    const plannedCompletion = stringValue(body.plannedCompletion) || null;
    const actualCompletion = stringValue(body.actualCompletion) || null;
    const budget = numberOrNull(body.budget);
    const currency = stringValue(body.currency) || "NGN";
    const targetRegion = stringValue(body.targetRegion) || null;
    const targetState = stringValue(body.targetState) || null;
    const targetInstaller = stringValue(body.targetInstaller) || null;
    const targetAgency = stringValue(body.targetAgency) || null;

    if (!projectName || !clientId || !Number.isFinite(targetQuantity) || targetQuantity < 0) {
      return NextResponse.json({ error: "Project name, client, and valid target quantity are required." }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    await validateProjectHierarchyInput({
      clientId,
      businessUnitId,
      portfolioId
    });

    const { data: selectedBrand } = brandId
      ? await supabase.from("brands").select("brand_name").eq("id", brandId).maybeSingle()
      : { data: null };
    const projectInsertPayload = {
      name: projectName,
      client_id: clientId,
      business_unit_id: businessUnitId,
      portfolio_id: portfolioId,
      brand_id: brandId,
      brand: selectedBrand?.brand_name ?? null,
      campaign: campaignName,
      project_type: projectType,
      project_code: projectCode,
      client_project_reference: clientProjectReference,
      project_manager: projectManager,
      site_supervisor: siteSupervisor,
      consultant,
      contractor,
      target_quantity: targetQuantity,
      status,
      regions_covered: regionsCovered,
      assigned_installers: assignedInstallers,
      primary_target_region: targetRegion,
      primary_target_state: targetState,
      start_date: startDate,
      end_date: endDate,
      planned_completion: plannedCompletion,
      actual_completion: actualCompletion,
      budget,
      currency
    };

    const { data: project, error } = await supabase
      .from("projects")
      .insert(projectInsertPayload)
      .select()
      .single();

    if (error) {
      console.error("[projects] create project insert failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        payloadKeys: Object.keys(projectInsertPayload)
      });

      if (isMissingProjectBrandColumn(error)) {
        return NextResponse.json(
          {
            error:
              "Project brand assignment is not ready in Supabase yet. Please run the projects.brand_id migration in Supabase SQL Editor, then retry Create Project."
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: `Could not create project: ${error.message}` }, { status: 500 });
    }

    await Promise.all([
      supabase.from("client_projects").upsert({ client_id: clientId, project_id: project.id }),
      supabase.from("deployment_progress").upsert(
        ["production", "warehouse", "in_transit", "installed", "approved"].map((stage_code) => ({
          project_id: project.id,
          stage_code,
          quantity: 0,
          updated_by: context.user_id
        }))
      ),
      targetQuantity > 0
        ? supabase.from("project_targets").insert({
            project_id: project.id,
            installer_name: targetInstaller,
            agency_name: targetAgency,
            region: targetRegion,
            state: targetState,
            target_quantity: targetQuantity,
            deployment_timeline_start: startDate,
            deployment_timeline_end: endDate
          })
        : Promise.resolve()
    ]);

    return NextResponse.json({ project: normalizeProjectRecord(project) });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const id = stringValue(body.id);
    if (!id) return NextResponse.json({ error: "Missing project id." }, { status: 400 });
    const projectName = stringValue(body.projectName);
    if (!projectName) return NextResponse.json({ error: "Project name is required." }, { status: 400 });

    const updates = {
      name: projectName,
      campaign: stringValue(body.campaignName) || null,
      business_unit_id: stringValue(body.businessUnitId) || null,
      portfolio_id: stringValue(body.portfolioId) || null,
      project_type: stringValue(body.projectType) || "Retail Deployment",
      project_code: stringValue(body.projectCode) || null,
      client_project_reference: stringValue(body.clientProjectReference) || null,
      project_manager: stringValue(body.projectManager) || null,
      site_supervisor: stringValue(body.siteSupervisor) || null,
      consultant: stringValue(body.consultant) || null,
      contractor: stringValue(body.contractor) || null,
      target_quantity: Number(body.targetQuantity ?? 0),
      start_date: stringValue(body.startDate) || null,
      end_date: stringValue(body.endDate) || null,
      planned_completion: stringValue(body.plannedCompletion) || null,
      actual_completion: stringValue(body.actualCompletion) || null,
      budget: numberOrNull(body.budget),
      currency: stringValue(body.currency) || "NGN",
      status: stringValue(body.status) || "Planning",
      regions_covered: stringArray(body.regionsCovered),
      assigned_installers: stringArray(body.assignedInstallers),
      archived_at: body.archived ? new Date().toISOString() : null
    };
    if (!Number.isFinite(updates.target_quantity) || updates.target_quantity < 0) {
      return NextResponse.json({ error: "Target quantity must be valid." }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: existingProject, error: existingProjectError } = await supabase
      .from("projects")
      .select("id, client_id")
      .eq("id", id)
      .maybeSingle();

    if (existingProjectError) {
      return NextResponse.json({ error: existingProjectError.message }, { status: 500 });
    }
    if (!existingProject) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    await validateProjectHierarchyInput({
      clientId: existingProject.client_id,
      businessUnitId: updates.business_unit_id,
      portfolioId: updates.portfolio_id
    });

    const { data: project, error } = await supabase.from("projects").update(updates).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ project: normalizeProjectRecord(project) });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
