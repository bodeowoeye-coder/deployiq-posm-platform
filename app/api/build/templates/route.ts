import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveTemplate,
  assignTemplateToWorkPackage,
  createTemplate,
  getTemplate,
  getTemplates,
  instantiateTemplate,
  updateTemplate
} from "@/lib/build/templates/service";
import type { BuildWorkPackageTemplateStatus } from "@/lib/build/templates/types";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseStatus(value: unknown): BuildWorkPackageTemplateStatus | undefined {
  const status = textValue(value).toLowerCase() as BuildWorkPackageTemplateStatus;
  if (status === "draft" || status === "active" || status === "archived") return status;
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
    const templateId = textValue(searchParams.get("templateId"));
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";
    const includeGlobal = textValue(searchParams.get("includeGlobal")).toLowerCase() !== "false";
    const instantiate = textValue(searchParams.get("instantiate")).toLowerCase() === "true";

    if (!projectId || !siteId || !workPackageId) {
      return NextResponse.json({ error: "projectId, siteId, and workPackageId are required." }, { status: 400 });
    }

    if (templateId && instantiate) {
      const preview = await instantiateTemplate({ request, projectId, siteId, workPackageId, templateId });
      return NextResponse.json(preview);
    }

    if (templateId) {
      const template = await getTemplate({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        includeArchived,
        includeGlobal
      });
      return NextResponse.json({ template });
    }

    const templates = await getTemplates({
      request,
      projectId,
      siteId,
      workPackageId,
      includeArchived,
      includeGlobal
    });

    return NextResponse.json({ templates });
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

    if (!projectId || !siteId || !workPackageId || !code || !name) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, code, and name are required." },
        { status: 400 }
      );
    }

    const template = await createTemplate({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        code,
        name,
        description: textValue(body.description) || null,
        workPackageType: textValue(body.workPackageType) || null,
        category: textValue(body.category) || null,
        version: typeof body.version === "number" ? body.version : undefined,
        isGlobal: body.isGlobal === true,
        status: parseStatus(body.status)
      }
    });

    return NextResponse.json({ template }, { status: 201 });
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
    const action = textValue(body.action).toLowerCase();

    if (!projectId || !siteId || !workPackageId) {
      return NextResponse.json({ error: "projectId, siteId, and workPackageId are required." }, { status: 400 });
    }

    if (action === "assign") {
      const workPackage = await assignTemplateToWorkPackage({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId: textValue(body.templateId) || null
      });
      return NextResponse.json({ workPackage });
    }

    if (!id) {
      return NextResponse.json({ error: "Template id is required." }, { status: 400 });
    }

    if (body.archived === true || action === "archive") {
      const template = await archiveTemplate({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId: id
      });
      return NextResponse.json({ template });
    }

    const template = await updateTemplate({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        id,
        code: typeof body.code === "string" ? body.code : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        workPackageType:
          typeof body.workPackageType === "string" || body.workPackageType === null
            ? body.workPackageType
            : undefined,
        category: typeof body.category === "string" || body.category === null ? body.category : undefined,
        version: typeof body.version === "number" ? body.version : undefined,
        status: parseStatus(body.status)
      }
    });

    return NextResponse.json({ template });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
