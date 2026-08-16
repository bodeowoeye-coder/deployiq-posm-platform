import { NextResponse } from "next/server";
import { accessControlErrorResponse, requireAdmin } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { cleanArray, cleanString, writeAuditLog } from "@/lib/userManagement";
import { INSTALLER_CREATION_MOVED_MESSAGE } from "@/lib/workspace/fieldResources";

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
    // This legacy route created untenanted installer identities with no invitation.
    return NextResponse.json({ error: INSTALLER_CREATION_MOVED_MESSAGE }, { status: 405 });
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
