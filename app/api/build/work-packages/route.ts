import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveWorkPackage,
  createWorkPackage,
  getWorkPackage,
  getWorkPackages,
  updateWorkPackage
} from "@/lib/build/workPackages/service";
import type { BuildWorkPackageStatus } from "@/lib/build/workPackages/types";

function textValue(value: string | null) {
  return (value ?? "").trim();
}

function parseWorkPackageStatus(value: unknown): BuildWorkPackageStatus | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim() as BuildWorkPackageStatus;
  if (["planned", "active", "on_hold", "completed", "archived"].includes(normalized)) {
    return normalized;
  }
  return undefined;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = textValue(searchParams.get("projectId"));
    const siteId = textValue(searchParams.get("siteId"));
    const workPackageId = textValue(searchParams.get("workPackageId"));
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";

    if (!projectId || !siteId) {
      return NextResponse.json({ error: "projectId and siteId are required." }, { status: 400 });
    }

    if (workPackageId) {
      const workPackage = await getWorkPackage({ request, projectId, siteId, workPackageId, includeArchived });
      if (!workPackage) {
        return NextResponse.json({ error: "Work Package not found." }, { status: 404 });
      }
      return NextResponse.json({ workPackage });
    }

    const workPackages = await getWorkPackages({ request, projectId, siteId, includeArchived });
    return NextResponse.json({ workPackages });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectId = textValue(typeof body.projectId === "string" ? body.projectId : "");
    const siteId = textValue(typeof body.siteId === "string" ? body.siteId : "");
    const name = textValue(typeof body.name === "string" ? body.name : "");

    if (!projectId || !siteId || !name) {
      return NextResponse.json({ error: "projectId, siteId, and name are required." }, { status: 400 });
    }

    const workPackage = await createWorkPackage({
      request,
      input: {
        clientId: textValue(typeof body.clientId === "string" ? body.clientId : "") || null,
        projectId,
        siteId,
        code: textValue(typeof body.code === "string" ? body.code : "") || null,
        name,
        description: textValue(typeof body.description === "string" ? body.description : "") || null,
        workPackageType: textValue(typeof body.workPackageType === "string" ? body.workPackageType : "") || null,
        contractor: textValue(typeof body.contractor === "string" ? body.contractor : "") || null,
        plannedStart: textValue(typeof body.plannedStart === "string" ? body.plannedStart : "") || null,
        plannedFinish: textValue(typeof body.plannedFinish === "string" ? body.plannedFinish : "") || null,
        actualStart: textValue(typeof body.actualStart === "string" ? body.actualStart : "") || null,
        actualFinish: textValue(typeof body.actualFinish === "string" ? body.actualFinish : "") || null,
        status: parseWorkPackageStatus(body.status)
      }
    });

    return NextResponse.json({ workPackage }, { status: 201 });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const projectId = textValue(typeof body.projectId === "string" ? body.projectId : "");
    const siteId = textValue(typeof body.siteId === "string" ? body.siteId : "");
    const id = textValue(typeof body.id === "string" ? body.id : "");

    if (!projectId || !siteId || !id) {
      return NextResponse.json({ error: "projectId, siteId, and id are required." }, { status: 400 });
    }

    if (body.archived === true) {
      const workPackage = await archiveWorkPackage({
        request,
        projectId,
        siteId,
        workPackageId: id,
        clientId: textValue(typeof body.clientId === "string" ? body.clientId : "") || null
      });
      return NextResponse.json({ workPackage });
    }

    const workPackage = await updateWorkPackage({
      request,
      input: {
        id,
        clientId: textValue(typeof body.clientId === "string" ? body.clientId : "") || null,
        projectId,
        siteId,
        code: typeof body.code === "string" || body.code === null ? body.code : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        workPackageType:
          typeof body.workPackageType === "string" || body.workPackageType === null
            ? body.workPackageType
            : undefined,
        contractor: typeof body.contractor === "string" || body.contractor === null ? body.contractor : undefined,
        plannedStart: typeof body.plannedStart === "string" || body.plannedStart === null ? body.plannedStart : undefined,
        plannedFinish:
          typeof body.plannedFinish === "string" || body.plannedFinish === null ? body.plannedFinish : undefined,
        actualStart: typeof body.actualStart === "string" || body.actualStart === null ? body.actualStart : undefined,
        actualFinish:
          typeof body.actualFinish === "string" || body.actualFinish === null ? body.actualFinish : undefined,
        status: parseWorkPackageStatus(body.status)
      }
    });

    return NextResponse.json({ workPackage });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
