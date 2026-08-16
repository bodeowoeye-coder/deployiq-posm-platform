import { NextResponse } from "next/server";
import {
  inviteWorkspaceUser,
  precheckWorkspaceInvitation,
  removeWorkspaceMember,
  resendWorkspaceInvitation,
  simulateWorkspaceInvitationAcceptance,
  teamPerformanceLog,
  updateWorkspaceMemberAssignments,
  updateWorkspaceMemberRole,
  updateWorkspaceRolePermissions,
} from "@/lib/workspace/team";

export const dynamic = "force-dynamic";

function statusFor(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

// Supabase returns plain PostgrestError objects, not Error instances.
function messageFor(error: unknown) {
  const message = typeof (error as { message?: unknown })?.message === "string" ? (error as { message: string }).message : "";
  return message || "Unable to process workspace team request.";
}

function logTeamRouteError(method: string, error: unknown) {
  const detail = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  console.error("[workspace-team-api]", {
    method,
    message: typeof detail?.message === "string" ? detail.message : String(error),
    code: detail?.code ?? null,
    details: detail?.details ?? null,
    hint: detail?.hint ?? null,
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await precheckWorkspaceInvitation({
      name: searchParams.get("name") ?? "",
      email: searchParams.get("email") ?? "",
    });
    return NextResponse.json(result);
  } catch (error) {
    logTeamRouteError("GET", error);
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await inviteWorkspaceUser({
      name: typeof body.name === "string" ? body.name : "",
      email: typeof body.email === "string" ? body.email : "",
      roleKey: typeof body.roleKey === "string" ? body.roleKey : "viewer",
      sendEmail: body.sendEmail !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    logTeamRouteError("POST", error);
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

export async function PATCH(request: Request) {
  const totalStartedAt = performance.now();
  try {
    const parseStartedAt = performance.now();
    const body = await request.json();
    const operation = body.action === "update_permissions" ? "permission-save" : typeof body.action === "string" ? body.action : "unknown";
    teamPerformanceLog({
      operation,
      step: "Request parse",
      elapsedMs: Math.round((performance.now() - parseStartedAt) * 10) / 10,
      totalElapsedMs: Math.round((performance.now() - totalStartedAt) * 10) / 10,
    });
    let result;
    if (body.action === "update_assignments") {
      result = await updateWorkspaceMemberAssignments({
        membershipId: typeof body.membershipId === "string" ? body.membershipId : "",
        projectIds: Array.isArray(body.projectIds) ? body.projectIds.filter((value: unknown): value is string => typeof value === "string") : [],
        regions: Array.isArray(body.regions) ? body.regions.filter((value: unknown): value is string => typeof value === "string") : [],
      });
    } else if (body.action === "change_role") {
      result = await updateWorkspaceMemberRole({
        membershipId: typeof body.membershipId === "string" ? body.membershipId : "",
        roleKey: typeof body.roleKey === "string" ? body.roleKey : "viewer",
      });
    } else if (body.action === "update_permissions") {
      result = await updateWorkspaceRolePermissions({
        roleKey: typeof body.roleKey === "string" ? body.roleKey : "viewer",
        permissions: Array.isArray(body.permissions) ? body.permissions.filter((permission: unknown): permission is string => typeof permission === "string") : [],
      });
    } else if (body.action === "resend_invitation") {
      result = await resendWorkspaceInvitation({
        membershipId: typeof body.membershipId === "string" ? body.membershipId : "",
      });
    } else if (body.action === "simulate_invitation_acceptance") {
      result = await simulateWorkspaceInvitationAcceptance({
        membershipId: typeof body.membershipId === "string" ? body.membershipId : "",
      });
    } else {
      throw Object.assign(new Error("Unsupported team action."), { status: 400 });
    }
    teamPerformanceLog({
      operation,
      step: "PATCH total",
      elapsedMs: Math.round((performance.now() - totalStartedAt) * 10) / 10,
      totalElapsedMs: Math.round((performance.now() - totalStartedAt) * 10) / 10,
    });
    return NextResponse.json(result);
  } catch (error) {
    logTeamRouteError("PATCH", error);
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await removeWorkspaceMember({
      membershipId: searchParams.get("membershipId") ?? "",
    });
    return NextResponse.json(result);
  } catch (error) {
    logTeamRouteError("DELETE", error);
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}
