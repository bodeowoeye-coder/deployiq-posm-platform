import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { cleanArray, cleanString, listManagedUsers, requireAdminContext, writeAuditLog } from "@/lib/userManagement";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const roles: UserRole[] = ["admin", "client", "installer"];

export async function GET() {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ users: await listManagedUsers() });
}

export async function POST(request: Request) {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json();
  const email = cleanString(body.email).toLowerCase();
  const fullName = cleanString(body.fullName);
  const phone = cleanString(body.phone) || null;
  const role = cleanString(body.role) as UserRole;
  const clientId = cleanString(body.clientId) || null;
  const agencyId = cleanString(body.agencyId) || null;
  const status = cleanString(body.status) || "Active";
  const password = cleanString(body.temporaryPassword);
  if (!email || !fullName || !roles.includes(role) || !password || password.length < 8) {
    return NextResponse.json({ error: "Name, email, role, and an 8+ character temporary password are required." }, { status: 400 });
  }
  if (role === "client" && !clientId) return NextResponse.json({ error: "Client users require an assigned client." }, { status: 400 });

  const supabase = createAdminSupabase();
  const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authUsers.users.some((user) => user.email?.toLowerCase() === email)) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });
  if (error || !data.user) return NextResponse.json({ error: error?.message || "Could not create auth user." }, { status: 500 });

  const profilePayload = {
    user_id: data.user.id,
    full_name: fullName,
    email,
    phone,
    agency_id: agencyId,
    assigned_project_ids: cleanArray(body.assignedProjectIds),
    assigned_regions: cleanArray(body.assignedRegions),
    assigned_states: cleanArray(body.assignedStates),
    status
  };
  const [{ error: roleError }, { error: profileError }] = await Promise.all([
    supabase.from("user_roles").upsert({ user_id: data.user.id, role, client_id: clientId }),
    supabase.from("user_profiles").upsert(profilePayload)
  ]);
  if (roleError || profileError) return NextResponse.json({ error: roleError?.message || profileError?.message }, { status: 500 });

  if (role === "installer") {
    await supabase.from("installers").upsert({
      user_id: data.user.id,
      installer_name: fullName,
      agency_id: agencyId,
      assigned_regions: profilePayload.assigned_regions,
      assigned_states: profilePayload.assigned_states,
      assigned_project_ids: profilePayload.assigned_project_ids,
      access_status: status === "Suspended" ? "Suspended" : status === "Inactive" ? "Inactive" : "Active"
    });
  }
  await writeAuditLog({
    actorUserId: context.user.id,
    targetUserId: data.user.id,
    actionType: "user_created",
    newValue: { email, fullName, role, clientId, agencyId, status }
  });
  return NextResponse.json({ userId: data.user.id });
}

export async function PATCH(request: Request) {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json();
  const userId = cleanString(body.userId);
  if (!userId) return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data: previousRole } = await supabase.from("user_roles").select("*").eq("user_id", userId).maybeSingle();
  const { data: previousProfile } = await supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
  const nextRole = cleanString(body.role) as UserRole;
  const nextStatus = cleanString(body.status);
  if (nextRole && !roles.includes(nextRole)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });

  if (nextRole) {
    await supabase.from("user_roles").update({ role: nextRole, client_id: cleanString(body.clientId) || null }).eq("user_id", userId);
  }
  const profileUpdates = {
    full_name: cleanString(body.fullName) || previousProfile?.full_name || "",
    phone: cleanString(body.phone) || null,
    agency_id: cleanString(body.agencyId) || null,
    assigned_project_ids: cleanArray(body.assignedProjectIds),
    assigned_regions: cleanArray(body.assignedRegions),
    assigned_states: cleanArray(body.assignedStates),
    status: nextStatus || previousProfile?.status || "Active",
    archived_at: nextStatus === "Archived" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };
  await supabase.from("user_profiles").update(profileUpdates).eq("user_id", userId);
  if (previousRole?.role === "installer" || nextRole === "installer") {
    await supabase.from("installers").upsert({
      user_id: userId,
      installer_name: profileUpdates.full_name,
      agency_id: profileUpdates.agency_id,
      assigned_regions: profileUpdates.assigned_regions,
      assigned_states: profileUpdates.assigned_states,
      assigned_project_ids: profileUpdates.assigned_project_ids,
      access_status: profileUpdates.status === "Suspended" ? "Suspended" : profileUpdates.status === "Inactive" || profileUpdates.status === "Archived" ? "Inactive" : "Active"
    });
  }
  if (body.resetPassword) {
    const password = cleanString(body.temporaryPassword);
    if (password.length < 8) return NextResponse.json({ error: "Temporary password must be at least 8 characters." }, { status: 400 });
    await supabase.auth.admin.updateUserById(userId, { password });
    await writeAuditLog({ actorUserId: context.user.id, targetUserId: userId, actionType: "password_reset" });
  }
  await writeAuditLog({
    actorUserId: context.user.id,
    targetUserId: userId,
    actionType: nextRole && previousRole?.role !== nextRole ? "role_changed" : "user_updated",
    oldValue: { role: previousRole?.role ?? null, profile: previousProfile ?? null },
    newValue: { role: nextRole || (previousRole?.role ?? null), profile: profileUpdates }
  });
  return NextResponse.json({ ok: true });
}
