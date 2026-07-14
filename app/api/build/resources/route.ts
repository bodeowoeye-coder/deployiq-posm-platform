import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveResource,
  createResource,
  getResourceById,
  getResources,
  updateResource
} from "@/lib/build/resources/service";
import type { BuildResourceStatus, BuildResourceType } from "@/lib/build/resources/types";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseResourceType(value: unknown): BuildResourceType | undefined {
  const candidate = textValue(value).toLowerCase() as BuildResourceType;
  if (
    candidate === "labour" ||
    candidate === "material" ||
    candidate === "equipment" ||
    candidate === "vehicle" ||
    candidate === "contractor" ||
    candidate === "service"
  ) {
    return candidate;
  }
  return undefined;
}

function parseStatus(value: unknown): BuildResourceStatus | undefined {
  const candidate = textValue(value).toLowerCase() as BuildResourceStatus;
  if (candidate === "draft" || candidate === "active" || candidate === "inactive" || candidate === "archived") {
    return candidate;
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
    const resourceId = textValue(searchParams.get("resourceId"));
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";
    const includeGlobal = textValue(searchParams.get("includeGlobal")).toLowerCase() !== "false";

    if (!projectId || !siteId || !workPackageId) {
      return NextResponse.json({ error: "projectId, siteId, and workPackageId are required." }, { status: 400 });
    }

    if (resourceId) {
      const resource = await getResourceById({
        request,
        projectId,
        siteId,
        workPackageId,
        resourceId,
        includeArchived
      });
      if (!resource) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
      return NextResponse.json({ resource });
    }

    const resources = await getResources({
      request,
      projectId,
      siteId,
      workPackageId,
      includeArchived,
      includeGlobal
    });

    return NextResponse.json({ resources });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectId = textValue(body.projectId);
    const siteId = textValue(body.siteId);
    const workPackageId = textValue(body.workPackageId);
    const code = textValue(body.code);
    const name = textValue(body.name);
    const resourceType = parseResourceType(body.resourceType);

    if (!projectId || !siteId || !workPackageId || !code || !name || !resourceType) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, code, name, and valid resourceType are required." },
        { status: 400 }
      );
    }

    const resource = await createResource({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        code,
        name,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        resourceType,
        category: typeof body.category === "string" || body.category === null ? body.category : undefined,
        unitOfMeasure: typeof body.unitOfMeasure === "string" || body.unitOfMeasure === null ? body.unitOfMeasure : undefined,
        specification:
          typeof body.specification === "string" || body.specification === null ? body.specification : undefined,
        defaultRate: typeof body.defaultRate === "number" ? body.defaultRate : undefined,
        currency: typeof body.currency === "string" || body.currency === null ? body.currency : undefined,
        isGlobal: body.isGlobal === true,
        status: parseStatus(body.status)
      }
    });

    return NextResponse.json({ resource }, { status: 201 });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const projectId = textValue(body.projectId);
    const siteId = textValue(body.siteId);
    const workPackageId = textValue(body.workPackageId);
    const id = textValue(body.id);

    if (!projectId || !siteId || !workPackageId || !id) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, and id are required." },
        { status: 400 }
      );
    }

    if (body.archived === true || textValue(body.action).toLowerCase() === "archive") {
      const resource = await archiveResource({
        request,
        projectId,
        siteId,
        workPackageId,
        resourceId: id
      });
      return NextResponse.json({ resource });
    }

    const resource = await updateResource({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        id,
        code: typeof body.code === "string" ? body.code : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        resourceType: parseResourceType(body.resourceType),
        category: typeof body.category === "string" || body.category === null ? body.category : undefined,
        unitOfMeasure: typeof body.unitOfMeasure === "string" || body.unitOfMeasure === null ? body.unitOfMeasure : undefined,
        specification:
          typeof body.specification === "string" || body.specification === null ? body.specification : undefined,
        defaultRate: typeof body.defaultRate === "number" || body.defaultRate === null ? body.defaultRate : undefined,
        currency: typeof body.currency === "string" || body.currency === null ? body.currency : undefined,
        status: parseStatus(body.status)
      }
    });

    return NextResponse.json({ resource });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
