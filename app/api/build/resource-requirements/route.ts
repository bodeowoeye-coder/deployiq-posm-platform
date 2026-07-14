import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveTemplateResourceRequirement,
  createTemplateResourceRequirement,
  getTemplateResourceRequirementById,
  getTemplateResourceRequirements,
  updateTemplateResourceRequirement
} from "@/lib/build/resources/service";
import type { BuildResourceRequirementType } from "@/lib/build/resources/types";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseRequirementType(value: unknown): BuildResourceRequirementType | undefined {
  const candidate = textValue(value).toLowerCase() as BuildResourceRequirementType;
  if (candidate === "estimated" || candidate === "mandatory" || candidate === "optional") return candidate;
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
    const requirementId = textValue(searchParams.get("requirementId"));
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";

    if (!projectId || !siteId || !workPackageId || !templateId) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, and templateId are required." },
        { status: 400 }
      );
    }

    if (requirementId) {
      const requirement = await getTemplateResourceRequirementById({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        requirementId,
        includeArchived
      });
      if (!requirement) return NextResponse.json({ error: "Template resource requirement not found." }, { status: 404 });
      return NextResponse.json({ requirement });
    }

    const requirements = await getTemplateResourceRequirements({
      request,
      projectId,
      siteId,
      workPackageId,
      templateId,
      includeArchived
    });

    return NextResponse.json({ requirements });
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
    const resourceId = textValue(body.resourceId);
    const quantity = Number(body.quantity);

    if (!projectId || !siteId || !workPackageId || !templateId || !resourceId || !Number.isFinite(quantity)) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, templateId, resourceId, and quantity are required." },
        { status: 400 }
      );
    }

    const requirement = await createTemplateResourceRequirement({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        templateId,
        activityCategoryId:
          typeof body.activityCategoryId === "string" || body.activityCategoryId === null
            ? body.activityCategoryId
            : undefined,
        activityTemplateId:
          typeof body.activityTemplateId === "string" || body.activityTemplateId === null
            ? body.activityTemplateId
            : undefined,
        resourceId,
        sequence: typeof body.sequence === "number" ? body.sequence : undefined,
        quantity,
        unitOfMeasure:
          typeof body.unitOfMeasure === "string" || body.unitOfMeasure === null ? body.unitOfMeasure : undefined,
        requirementType: parseRequirementType(body.requirementType),
        requiredStage:
          typeof body.requiredStage === "string" || body.requiredStage === null ? body.requiredStage : undefined,
        mandatory: typeof body.mandatory === "boolean" ? body.mandatory : undefined,
        notes: typeof body.notes === "string" || body.notes === null ? body.notes : undefined
      }
    });

    return NextResponse.json({ requirement }, { status: 201 });
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
      const requirement = await archiveTemplateResourceRequirement({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        requirementId: id
      });
      return NextResponse.json({ requirement });
    }

    const requirement = await updateTemplateResourceRequirement({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        templateId,
        id,
        activityCategoryId:
          typeof body.activityCategoryId === "string" || body.activityCategoryId === null
            ? body.activityCategoryId
            : undefined,
        activityTemplateId:
          typeof body.activityTemplateId === "string" || body.activityTemplateId === null
            ? body.activityTemplateId
            : undefined,
        resourceId: typeof body.resourceId === "string" ? body.resourceId : undefined,
        sequence: typeof body.sequence === "number" ? body.sequence : undefined,
        quantity: typeof body.quantity === "number" ? body.quantity : undefined,
        unitOfMeasure:
          typeof body.unitOfMeasure === "string" || body.unitOfMeasure === null ? body.unitOfMeasure : undefined,
        requirementType: parseRequirementType(body.requirementType),
        requiredStage:
          typeof body.requiredStage === "string" || body.requiredStage === null ? body.requiredStage : undefined,
        mandatory: typeof body.mandatory === "boolean" ? body.mandatory : undefined,
        notes: typeof body.notes === "string" || body.notes === null ? body.notes : undefined
      }
    });

    return NextResponse.json({ requirement });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
