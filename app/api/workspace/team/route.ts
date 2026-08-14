import { NextResponse } from "next/server";
import {
  inviteWorkspaceUser,
  precheckWorkspaceInvitation,
  removeWorkspaceMember,
  resendWorkspaceInvitation,
  teamPerformanceLog,
  updateWorkspaceMemberRole,
  updateWorkspaceRolePermissions,
} from "@/lib/workspace/team";

export const dynamic = "force-dynamic";

function statusFor(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Unable to process workspace team request.";
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
    if (body.action === "change_role") {
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
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}
