import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const supabase = createAdminSupabase();
  let query = supabase.from("projects").select("*").order("created_at", { ascending: false });
  if (context.role.role === "client") {
    if (!context.role.client_id) return NextResponse.json({ projects: [] });
    query = query.eq("client_id", context.role.client_id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context || context.role.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const projectName = stringValue(body.projectName);
  const clientId = stringValue(body.clientId);
  const brandId = stringValue(body.brandId) || null;
  const campaignName = stringValue(body.campaignName) || null;
  const targetQuantity = Number(body.targetQuantity ?? 0);
  const status = stringValue(body.status) || "Planning";
  const regionsCovered = stringArray(body.regionsCovered);
  const assignedInstallers = stringArray(body.assignedInstallers);
  const startDate = stringValue(body.startDate) || null;
  const endDate = stringValue(body.endDate) || null;
  const targetRegion = stringValue(body.targetRegion) || null;
  const targetState = stringValue(body.targetState) || null;
  const targetInstaller = stringValue(body.targetInstaller) || null;
  const targetAgency = stringValue(body.targetAgency) || null;

  if (!projectName || !clientId || !Number.isFinite(targetQuantity) || targetQuantity < 0) {
    return NextResponse.json({ error: "Project name, client, and valid target quantity are required." }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      project_name: projectName,
      client_id: clientId,
      brand_id: brandId,
      campaign_name: campaignName,
      target_quantity: targetQuantity,
      status,
      regions_covered: regionsCovered,
      assigned_installers: assignedInstallers,
      start_date: startDate,
      end_date: endDate
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await Promise.all([
    supabase.from("client_projects").upsert({ client_id: clientId, project_id: project.id }),
    supabase.from("deployment_progress").upsert(
      ["production", "warehouse", "in_transit", "installed", "approved"].map((stage_code) => ({
        project_id: project.id,
        stage_code,
        quantity: 0,
        updated_by: context.user.id
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

  return NextResponse.json({ project });
}

export async function PATCH(request: Request) {
  const context = await getCurrentUserContext();
  if (!context || context.role.role !== "admin") return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json();
  const id = stringValue(body.id);
  if (!id) return NextResponse.json({ error: "Missing project id." }, { status: 400 });

  const updates = {
    campaign_name: stringValue(body.campaignName) || null,
    target_quantity: Number(body.targetQuantity ?? 0),
    start_date: stringValue(body.startDate) || null,
    end_date: stringValue(body.endDate) || null,
    status: stringValue(body.status) || "Planning",
    regions_covered: stringArray(body.regionsCovered),
    assigned_installers: stringArray(body.assignedInstallers),
    archived_at: body.archived ? new Date().toISOString() : null
  };
  if (!Number.isFinite(updates.target_quantity) || updates.target_quantity < 0) {
    return NextResponse.json({ error: "Target quantity must be valid." }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const { data: project, error } = await supabase.from("projects").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project });
}
