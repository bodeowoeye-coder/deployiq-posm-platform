import { NextResponse } from "next/server";
import { accessControlErrorResponse, requireAdmin } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { cleanArray, cleanString, dbErrorPayload, listManagedUsers, upsertUserProfileWithRetry, writeAuditLog } from "@/lib/userManagement";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const roles: UserRole[] = ["admin", "client", "installer"];

function partialResponse(stage: string, dbError: unknown, createdAuthUser: boolean) {
  const payload = dbErrorPayload(dbError as Parameters<typeof dbErrorPayload>[0]);
  return NextResponse.json(
    {
      partial: true,
      message: `${createdAuthUser ? "Auth user created" : "Existing auth user found"}, but failed at ${stage}: ${payload?.message ?? "Unknown error"}`,
      dbError: payload
    },
    { status: 207 }
  );
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ users: await listManagedUsers() });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAdmin(request);
    const body = await request.json();
    const email = cleanString(body.email).toLowerCase();
    const fullName = cleanString(body.fullName);
    const phone = cleanString(body.phone) || null;
    const role = cleanString(body.role) as UserRole;
    const clientId = cleanString(body.clientId) || null;
    const agencyId = cleanString(body.agencyId) || null;
    const status = cleanString(body.status) || "Active";
    const password = cleanString(body.temporaryPassword);
    console.info("[user-management-api] create user request", {
      role,
      email,
      selectedClientId: clientId,
      selectedAgencyId: agencyId,
      assignedProjectCount: Array.isArray(body.assignedProjectIds) ? body.assignedProjectIds.length : 0,
      assignedRegionCount: Array.isArray(body.assignedRegions) ? body.assignedRegions.length : 0,
      assignedStateCount: Array.isArray(body.assignedStates) ? body.assignedStates.length : 0
    });
    if (!email || !fullName || !roles.includes(role) || !password || password.length < 8) {
      return NextResponse.json({ error: "Name, email, role, and an 8+ character temporary password are required." }, { status: 400 });
    }
    if (role === "client" && !clientId) return NextResponse.json({ error: "Client users require an assigned client." }, { status: 400 });

    const supabase = createAdminSupabase();
    if (role === "client" && clientId) {
      const { data: assignedClient, error: assignedClientError } = await supabase
        .schema("public")
        .from("clients")
        .select("id, name")
        .eq("id", clientId)
        .maybeSingle();
      console.info("[user-management-api] assigned client lookup", {
        selectedClientId: clientId,
        found: Boolean(assignedClient?.id),
        clientName: assignedClient?.name ?? null,
        error: assignedClientError?.message ?? null
      });
      if (assignedClientError) {
        return NextResponse.json({ error: `Could not verify assigned client: ${assignedClientError.message}` }, { status: 500 });
      }
      if (!assignedClient) {
        return NextResponse.json({ error: "Selected assigned client was not found. Please reload clients and try again." }, { status: 400 });
      }
    }
    const [{ data: authUsers }, { data: profileByEmail }] = await Promise.all([
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabase.schema("public").from("user_profiles").select("user_id, email").eq("email", email).maybeSingle()
    ]);
    const existingAuthUser = authUsers.users.find((user) => user.email?.toLowerCase() === email);
    let authUser = existingAuthUser ?? null;
    if (!authUser && profileByEmail?.user_id) {
      const { data: authByProfile } = await supabase.auth.admin.getUserById(profileByEmail.user_id);
      authUser = authByProfile.user ?? null;
    }

    const createdAuthUser = !authUser;
    if (!authUser) {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName }
        });
      if (authError || !authData.user) return NextResponse.json({ error: authError?.message || "Could not create auth user." }, { status: 500 });
      authUser = authData.user;
    }

    const profilePayload = {
      user_id: authUser.id,
      full_name: fullName,
      email,
      phone,
      agency_id: agencyId,
      assigned_project_ids: cleanArray(body.assignedProjectIds),
      assigned_regions: cleanArray(body.assignedRegions),
      assigned_states: cleanArray(body.assignedStates),
      status
    };
    const { data: existingProfile, error: existingProfileError } = await supabase
      .schema("public")
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", authUser.id)
      .maybeSingle();

    const profileResult = await upsertUserProfileWithRetry(supabase, profilePayload);
    if (profileResult.error) {
      return partialResponse("profile sync in public.user_profiles", profileResult.error || existingProfileError, createdAuthUser);
    }

    const roleResult = await supabase
      .schema("public")
      .from("user_roles")
      .upsert({ user_id: authUser.id, role, client_id: clientId }, { onConflict: "user_id" })
      .select("user_id, role, client_id")
      .single();
    console.info("[user-management-api] role sync result", {
      ok: !roleResult.error,
      userId: authUser.id,
      role,
      clientId,
      savedClientId: roleResult.data?.client_id ?? null,
      error: roleResult.error?.message ?? null
    });
    if (roleResult.error) {
      return partialResponse("role sync", roleResult.error, createdAuthUser);
    }

    if (role === "installer") {
      const installerResult = await supabase.schema("public").from("installers").upsert({
        user_id: authUser.id,
        installer_name: fullName,
        agency_id: agencyId,
        assigned_regions: profilePayload.assigned_regions,
        assigned_states: profilePayload.assigned_states,
        assigned_project_ids: profilePayload.assigned_project_ids,
        access_status: status === "Suspended" ? "Suspended" : status === "Inactive" ? "Inactive" : "Active"
      });
      if (installerResult.error) return partialResponse("installer sync", installerResult.error, createdAuthUser);
    }

    if (role === "client" && clientId) {
      const clientProfileResult = await supabase
        .schema("public")
        .from("client_profiles")
        .upsert({ client_id: clientId }, { onConflict: "client_id" })
        .select("client_id")
        .single();
      console.info("[user-management-api] client profile mapping sync result", {
        ok: !clientProfileResult.error,
        clientId,
        error: clientProfileResult.error?.message ?? null
      });
      if (clientProfileResult.error) return partialResponse("client mapping sync", clientProfileResult.error, createdAuthUser);
    }
    await writeAuditLog({
      actorUserId: context.user_id,
      targetUserId: authUser.id,
      actionType: createdAuthUser ? "user_created" : "existing_user_synced",
      newValue: { email, fullName, role, clientId, agencyId, status }
    }).catch((error) => {
      console.warn("[user-management] audit log write failed", dbErrorPayload(error));
    });
    return NextResponse.json({
      userId: authUser.id,
      action: createdAuthUser ? "created" : "synced",
      message: createdAuthUser ? "Created successfully." : "Existing user synced successfully.",
      recoveredExistingAuthUser: Boolean(!createdAuthUser && !existingProfile)
    });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireAdmin(request);
    const body = await request.json();
    const userId = cleanString(body.userId);
    if (!userId) return NextResponse.json({ error: "Missing user id." }, { status: 400 });
    const supabase = createAdminSupabase();
    const { data: previousRole } = await supabase.schema("public").from("user_roles").select("*").eq("user_id", userId).maybeSingle();
    const { data: previousProfile } = await supabase.schema("public").from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
    const nextRole = cleanString(body.role) as UserRole;
    const nextStatus = cleanString(body.status);
    if (nextRole && !roles.includes(nextRole)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });

    if (nextRole) {
      await supabase.schema("public").from("user_roles").upsert({ user_id: userId, role: nextRole, client_id: cleanString(body.clientId) || null });
    }
    const { data: authUserData } = await supabase.auth.admin.getUserById(userId);
    const profileEmail = cleanString(previousProfile?.email) || cleanString(authUserData.user?.email).toLowerCase();
    if (!profileEmail) return NextResponse.json({ error: "Could not resolve user email for profile save." }, { status: 400 });
    const profileUpdates = (function() {
      const assignedProjectIds = body.assignedProjectIds !== undefined ? cleanArray(body.assignedProjectIds) : previousProfile?.assigned_project_ids ?? [];
      const assignedRegions = body.assignedRegions !== undefined ? cleanArray(body.assignedRegions) : previousProfile?.assigned_regions ?? [];
      const assignedStates = body.assignedStates !== undefined ? cleanArray(body.assignedStates) : previousProfile?.assigned_states ?? [];

      return {
        user_id: userId,
        full_name: cleanString(body.fullName) || previousProfile?.full_name || "",
        email: profileEmail,
        phone: cleanString(body.phone) || null,
        agency_id: cleanString(body.agencyId) || null,
        assigned_project_ids: assignedProjectIds,
        assigned_regions: assignedRegions,
        assigned_states: assignedStates,
        status: nextStatus || previousProfile?.status || "Active",
        archived_at: nextStatus === "Archived" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };
    })();
    const profileResult = await upsertUserProfileWithRetry(supabase, profileUpdates);
    if (profileResult.error) return NextResponse.json({ error: profileResult.error.message || "Could not save user profile." }, { status: 500 });
    if (previousRole?.role === "installer" || nextRole === "installer") {
      await supabase.schema("public").from("installers").upsert({
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
      await writeAuditLog({ actorUserId: context.user_id, targetUserId: userId, actionType: "password_reset" });
    }
    await writeAuditLog({
      actorUserId: context.user_id,
      targetUserId: userId,
      actionType: nextRole && previousRole?.role !== nextRole ? "role_changed" : "user_updated",
      oldValue: { role: previousRole?.role ?? null, profile: previousProfile ?? null },
      newValue: { role: nextRole || (previousRole?.role ?? null), profile: profileUpdates }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
