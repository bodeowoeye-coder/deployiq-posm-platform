import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveDependency,
  createDependency,
  getDependencies,
  getDependency,
  updateDependency
} from "@/lib/build/dependencies/service";
import type { BuildActivityDependencyLagUnit, BuildActivityDependencyType } from "@/lib/build/dependencies/types";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDependencyType(value: unknown): BuildActivityDependencyType | undefined {
  const candidate = textValue(value).toUpperCase() as BuildActivityDependencyType;
  if (candidate === "FS" || candidate === "SS" || candidate === "FF" || candidate === "SF") return candidate;
  return undefined;
}

function parseLagUnit(value: unknown): BuildActivityDependencyLagUnit | undefined {
  const candidate = textValue(value).toLowerCase() as BuildActivityDependencyLagUnit;
  if (candidate === "hours" || candidate === "days" || candidate === "weeks") return candidate;
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
    const dependencyId = textValue(searchParams.get("dependencyId"));
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";

    if (!projectId || !siteId || !workPackageId || !templateId) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, and templateId are required." },
        { status: 400 }
      );
    }

    if (dependencyId) {
      const dependency = await getDependency({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        dependencyId,
        includeArchived
      });
      if (!dependency) return NextResponse.json({ error: "Dependency not found." }, { status: 404 });
      return NextResponse.json({ dependency });
    }

    const result = await getDependencies({
      request,
      projectId,
      siteId,
      workPackageId,
      templateId,
      includeArchived
    });

    return NextResponse.json(result);
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
    const templateId = textValue(body.templateId);
    const predecessorActivityTemplateId = textValue(body.predecessorActivityTemplateId);
    const successorActivityTemplateId = textValue(body.successorActivityTemplateId);

    if (!projectId || !siteId || !workPackageId || !templateId || !predecessorActivityTemplateId || !successorActivityTemplateId) {
      return NextResponse.json(
        {
          error:
            "projectId, siteId, workPackageId, templateId, predecessorActivityTemplateId, and successorActivityTemplateId are required."
        },
        { status: 400 }
      );
    }

    const result = await createDependency({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        templateId,
        predecessorActivityTemplateId,
        successorActivityTemplateId,
        dependencyType: parseDependencyType(body.dependencyType),
        lagValue: typeof body.lagValue === "number" ? body.lagValue : undefined,
        lagUnit: parseLagUnit(body.lagUnit),
        mandatory: typeof body.mandatory === "boolean" ? body.mandatory : undefined,
        notes: typeof body.notes === "string" || body.notes === null ? body.notes : undefined
      }
    });

    return NextResponse.json(result, { status: 201 });
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
    const templateId = textValue(body.templateId);
    const id = textValue(body.id);

    if (!projectId || !siteId || !workPackageId || !templateId || !id) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, templateId, and id are required." },
        { status: 400 }
      );
    }

    if (body.archived === true || textValue(body.action).toLowerCase() === "archive") {
      const result = await archiveDependency({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        dependencyId: id
      });
      return NextResponse.json(result);
    }

    const result = await updateDependency({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        templateId,
        id,
        predecessorActivityTemplateId:
          typeof body.predecessorActivityTemplateId === "string" ? body.predecessorActivityTemplateId : undefined,
        successorActivityTemplateId:
          typeof body.successorActivityTemplateId === "string" ? body.successorActivityTemplateId : undefined,
        dependencyType: parseDependencyType(body.dependencyType),
        lagValue: typeof body.lagValue === "number" ? body.lagValue : undefined,
        lagUnit: parseLagUnit(body.lagUnit),
        mandatory: typeof body.mandatory === "boolean" ? body.mandatory : undefined,
        notes: typeof body.notes === "string" || body.notes === null ? body.notes : undefined
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
