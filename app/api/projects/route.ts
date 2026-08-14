import { NextResponse } from "next/server";
import { accessControlErrorResponse, getAuthenticatedUserContext, requireAdmin } from "@/lib/accessControl";
import { createCoreProject, isMissingProjectBrandColumn, updateCoreProject } from "@/lib/core/projects/service";
import { normalizeProjectRecords } from "@/lib/projects";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function coreProjectInput(body: Record<string, unknown>) {
  return {
    projectName: body.projectName,
    clientId: body.clientId,
    brand: body.brand,
    brandName: body.brandName,
    brandId: body.brandId,
    campaignName: body.campaignName,
    projectType: body.projectType,
    projectCode: body.projectCode,
    businessUnitId: body.businessUnitId,
    portfolioId: body.portfolioId,
    clientProjectReference: body.clientProjectReference,
    projectManager: body.projectManager,
    siteSupervisor: body.siteSupervisor,
    consultant: body.consultant,
    contractor: body.contractor,
    targetQuantity: body.targetQuantity,
    status: body.status,
    regionsCovered: body.regionsCovered,
    assignedInstallers: body.assignedInstallers,
    startDate: body.startDate,
    endDate: body.endDate,
    plannedCompletion: body.plannedCompletion,
    actualCompletion: body.actualCompletion,
    budget: body.budget,
    currency: body.currency,
    targetRegion: body.targetRegion,
    targetState: body.targetState,
    targetInstaller: body.targetInstaller,
    targetAgency: body.targetAgency,
  };
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
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = createAdminSupabase();
    try {
      const project = await createCoreProject({
        supabase,
        actorUserId: context.user_id,
        ...coreProjectInput(body),
      });
      return NextResponse.json({ project });
    } catch (error) {
      if (isMissingProjectBrandColumn(error as { code?: string; message?: string; details?: string })) {
        return NextResponse.json(
          {
            error:
              "Project brand assignment is not ready in Supabase yet. Please run the projects.brand_id migration in Supabase SQL Editor, then retry Create Project.",
          },
          { status: 500 },
        );
      }
      throw error;
    }
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const project = await updateCoreProject({
      id: text(body.id),
      supabase: createAdminSupabase(),
      ...coreProjectInput(body),
      archived: body.archived,
    });
    return NextResponse.json({ project });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
