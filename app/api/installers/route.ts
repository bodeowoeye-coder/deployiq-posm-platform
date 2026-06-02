import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { cleanArray, cleanString, requireAdminContext, writeAuditLog } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data } = await createAdminSupabase().from("installers").select("*").order("installer_name");
  return NextResponse.json({ installers: data ?? [] });
}

export async function POST(request: Request) {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json();
  const installerName = cleanString(body.installerName);
  if (!installerName) return NextResponse.json({ error: "Installer name is required." }, { status: 400 });
  const { data, error } = await createAdminSupabase()
    .from("installers")
    .insert({
      installer_name: installerName,
      agency_id: cleanString(body.agencyId) || null,
      assigned_regions: cleanArray(body.assignedRegions),
      assigned_states: cleanArray(body.assignedStates),
      assigned_project_ids: cleanArray(body.assignedProjectIds),
      access_status: cleanString(body.accessStatus) || "Active"
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ installer: data });
}

export async function PATCH(request: Request) {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json();
  const id = cleanString(body.id);
  if (!id) return NextResponse.json({ error: "Missing installer id." }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data: oldValue } = await supabase.from("installers").select("*").eq("id", id).maybeSingle();
  const updates = {
    agency_id: cleanString(body.agencyId) || null,
    assigned_regions: cleanArray(body.assignedRegions),
    assigned_states: cleanArray(body.assignedStates),
    assigned_project_ids: cleanArray(body.assignedProjectIds),
    access_status: cleanString(body.accessStatus) || oldValue?.access_status || "Active"
  };
  const { data, error } = await supabase.from("installers").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAuditLog({
    actorUserId: context.user.id,
    targetUserId: data.user_id ?? null,
    actionType: "installer_assignment_changed",
    oldValue,
    newValue: updates
  });
  return NextResponse.json({ installer: data });
}
