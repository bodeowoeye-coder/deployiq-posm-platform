import { NextResponse } from "next/server";
import { accessControlErrorResponse, requireAdmin } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { cleanArray, cleanString, writeAuditLog } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const { data } = await createAdminSupabase().from("installers").select("*").order("installer_name");
    return NextResponse.json({ installers: data ?? [] });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
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
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireAdmin(request);
    const body = await request.json();
    const id = cleanString(body.id);
    if (!id) return NextResponse.json({ error: "Missing installer id." }, { status: 400 });
    const supabase = createAdminSupabase();
    const { data: oldValue } = await supabase.from("installers").select("*").eq("id", id).maybeSingle();
    const updates = (function() {
      const assignedRegions = body.assignedRegions !== undefined ? cleanArray(body.assignedRegions) : oldValue?.assigned_regions ?? [];
      const assignedStates = body.assignedStates !== undefined ? cleanArray(body.assignedStates) : oldValue?.assigned_states ?? [];
      const assignedProjectIds = body.assignedProjectIds !== undefined ? cleanArray(body.assignedProjectIds) : oldValue?.assigned_project_ids ?? [];

      return {
        agency_id: cleanString(body.agencyId) || null,
        assigned_regions: assignedRegions,
        assigned_states: assignedStates,
        assigned_project_ids: assignedProjectIds,
        access_status: cleanString(body.accessStatus) || oldValue?.access_status || "Active"
      };
    })();
    const { data, error } = await supabase.from("installers").update(updates).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAuditLog({
      actorUserId: context.user_id,
      targetUserId: data.user_id ?? null,
      actionType: "installer_assignment_changed",
      oldValue,
      newValue: updates
    });
    return NextResponse.json({ installer: data });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
