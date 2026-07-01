import { NextResponse } from "next/server";
import { accessControlErrorResponse, requireAdmin } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const projectId = clean(body.projectId);
    const targetQuantity = Number(body.targetQuantity ?? 0);
    if (!projectId || !Number.isFinite(targetQuantity) || targetQuantity < 0) {
      return NextResponse.json({ error: "Project and valid quantity are required." }, { status: 400 });
    }
    const supabase = createAdminSupabase();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, archived_at")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
    if (!project || project.archived_at) return NextResponse.json({ error: "Target must be assigned to an active project." }, { status: 400 });

    const state = clean(body.state) || null;
    const region = clean(body.region) || null;
    let duplicateQuery = supabase
      .from("project_targets")
      .select("id")
      .eq("project_id", projectId);
    duplicateQuery = state ? duplicateQuery.eq("state", state) : duplicateQuery.is("state", null);
    duplicateQuery = region ? duplicateQuery.eq("region", region) : duplicateQuery.is("region", null);
    const { data: existingTarget, error: existingError } = await duplicateQuery.maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (existingTarget) {
      return NextResponse.json({ error: "An allocation already exists for this project, state, and region." }, { status: 409 });
    }
    const { data: target, error } = await supabase
      .from("project_targets")
      .insert({
        project_id: projectId,
        state,
        region,
        installer_name: clean(body.installerName) || null,
        agency_name: clean(body.agencyName) || null,
        target_quantity: targetQuantity
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ target });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
