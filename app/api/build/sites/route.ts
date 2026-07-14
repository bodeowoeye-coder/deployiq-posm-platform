import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveBuildSite,
  createBuildSite,
  getBuildSiteById,
  getBuildSitesForProject,
  updateBuildSite
} from "@/lib/build/sites/service";
import type { BuildSiteStatus } from "@/lib/build/sites/types";

function textValue(value: string | null) {
  return (value ?? "").trim();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBuildSiteStatus(value: unknown): BuildSiteStatus | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim() as BuildSiteStatus;
  if (!normalized) return undefined;
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
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }

    if (siteId) {
      const site = await getBuildSiteById({ request, projectId, siteId, includeArchived });
      if (!site) {
        return NextResponse.json({ error: "Site not found." }, { status: 404 });
      }
      return NextResponse.json({ site });
    }

    const sites = await getBuildSitesForProject({ request, projectId, includeArchived });
    return NextResponse.json({ sites });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectId = textValue(typeof body.projectId === "string" ? body.projectId : "");
    const name = textValue(typeof body.name === "string" ? body.name : "");

    if (!projectId || !name) {
      return NextResponse.json({ error: "projectId and name are required." }, { status: 400 });
    }

    const site = await createBuildSite({
      request,
      input: {
        projectId,
        clientId: textValue(typeof body.clientId === "string" ? body.clientId : "") || null,
        siteCode: textValue(typeof body.siteCode === "string" ? body.siteCode : "") || null,
        name,
        description: textValue(typeof body.description === "string" ? body.description : "") || null,
        siteType: textValue(typeof body.siteType === "string" ? body.siteType : "") || null,
        address: textValue(typeof body.address === "string" ? body.address : "") || null,
        state: textValue(typeof body.state === "string" ? body.state : "") || null,
        lga: textValue(typeof body.lga === "string" ? body.lga : "") || null,
        latitude: numberOrNull(body.latitude),
        longitude: numberOrNull(body.longitude),
        status: parseBuildSiteStatus(body.status),
        plannedStartDate: textValue(typeof body.plannedStartDate === "string" ? body.plannedStartDate : "") || null,
        plannedEndDate: textValue(typeof body.plannedEndDate === "string" ? body.plannedEndDate : "") || null,
        actualStartDate: textValue(typeof body.actualStartDate === "string" ? body.actualStartDate : "") || null,
        actualEndDate: textValue(typeof body.actualEndDate === "string" ? body.actualEndDate : "") || null
      }
    });

    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const projectId = textValue(typeof body.projectId === "string" ? body.projectId : "");
    const id = textValue(typeof body.id === "string" ? body.id : "");
    if (!projectId || !id) {
      return NextResponse.json({ error: "projectId and id are required." }, { status: 400 });
    }

    if (body.archived === true) {
      const site = await archiveBuildSite({
        request,
        projectId,
        siteId: id,
        clientId: textValue(typeof body.clientId === "string" ? body.clientId : "") || null
      });
      return NextResponse.json({ site });
    }

    const site = await updateBuildSite({
      request,
      input: {
        id,
        projectId,
        clientId: textValue(typeof body.clientId === "string" ? body.clientId : "") || null,
        siteCode: typeof body.siteCode === "string" ? body.siteCode : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        siteType: typeof body.siteType === "string" || body.siteType === null ? body.siteType : undefined,
        address: typeof body.address === "string" || body.address === null ? body.address : undefined,
        state: typeof body.state === "string" || body.state === null ? body.state : undefined,
        lga: typeof body.lga === "string" || body.lga === null ? body.lga : undefined,
        latitude: body.latitude === null || typeof body.latitude === "number" ? body.latitude : undefined,
        longitude: body.longitude === null || typeof body.longitude === "number" ? body.longitude : undefined,
        status: parseBuildSiteStatus(body.status),
        plannedStartDate: typeof body.plannedStartDate === "string" || body.plannedStartDate === null ? body.plannedStartDate : undefined,
        plannedEndDate: typeof body.plannedEndDate === "string" || body.plannedEndDate === null ? body.plannedEndDate : undefined,
        actualStartDate: typeof body.actualStartDate === "string" || body.actualStartDate === null ? body.actualStartDate : undefined,
        actualEndDate: typeof body.actualEndDate === "string" || body.actualEndDate === null ? body.actualEndDate : undefined
      }
    });

    return NextResponse.json({ site });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
