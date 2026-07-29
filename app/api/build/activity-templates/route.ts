import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveActivityTemplate,
  createActivityTemplate,
  getActivityTemplateById,
  getActivityTemplates,
  reorderActivityTemplates,
  updateActivityTemplate
} from "@/lib/build/activityTemplates/service";
import type { BuildActivityDurationUnit, BuildActivityTemplateStatus } from "@/lib/build/templates/types";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseStatus(value: unknown): BuildActivityTemplateStatus | undefined {
  const candidate = textValue(value).toLowerCase() as BuildActivityTemplateStatus;
  if (candidate === "draft" || candidate === "active" || candidate === "inactive" || candidate === "archived") {
    return candidate;
  }
  return undefined;
}

function parseDurationUnit(value: unknown): BuildActivityDurationUnit | undefined {
  const candidate = textValue(value).toLowerCase() as BuildActivityDurationUnit;
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
    const activityTemplateId = textValue(searchParams.get("activityTemplateId"));
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";

    if (!projectId || !siteId || !workPackageId || !templateId) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, and templateId are required." },
        { status: 400 }
      );
    }

    if (activityTemplateId) {
      const activity = await getActivityTemplateById({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        activityTemplateId,
        includeArchived
      });
      if (!activity) return NextResponse.json({ error: "Activity template not found." }, { status: 404 });
      return NextResponse.json({ activity });
    }

    const result = await getActivityTemplates({
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
    const activityCategoryId = textValue(body.activityCategoryId);
    const code = textValue(body.code);
    const name = textValue(body.name);

    if (!projectId || !siteId || !workPackageId || !templateId || !activityCategoryId || !code || !name) {
      return NextResponse.json(
        {
          error:
            "projectId, siteId, workPackageId, templateId, activityCategoryId, code, and name are required."
        },
        { status: 400 }
      );
    }

    const activity = await createActivityTemplate({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        templateId,
        activityCategoryId,
        sequence: typeof body.sequence === "number" ? body.sequence : undefined,
        code,
        name,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        estimatedDuration:
          typeof body.estimatedDuration === "number" || body.estimatedDuration === null
            ? body.estimatedDuration
            : undefined,
        durationUnit: parseDurationUnit(body.durationUnit),
        mandatory: typeof body.mandatory === "boolean" ? body.mandatory : undefined,
        requiresPhoto: typeof body.requiresPhoto === "boolean" ? body.requiresPhoto : undefined,
        requiresGps: typeof body.requiresGps === "boolean" ? body.requiresGps : undefined,
        requiresApproval: typeof body.requiresApproval === "boolean" ? body.requiresApproval : undefined,
        status: parseStatus(body.status),
        notes: typeof body.notes === "string" || body.notes === null ? body.notes : undefined
      }
    });

    return NextResponse.json({ activity }, { status: 201 });
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
    const action = textValue(body.action).toLowerCase();

    if (!projectId || !siteId || !workPackageId || !templateId) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, and templateId are required." },
        { status: 400 }
      );
    }

    if (action === "reorder") {
      const activityCategoryId = textValue(body.activityCategoryId);
      const orderedActivityTemplateIds = Array.isArray(body.orderedActivityTemplateIds)
        ? body.orderedActivityTemplateIds.filter((item: unknown) => typeof item === "string")
        : [];

      if (!activityCategoryId || orderedActivityTemplateIds.length === 0) {
        return NextResponse.json(
          { error: "activityCategoryId and orderedActivityTemplateIds are required for reorder." },
          { status: 400 }
        );
      }

      const result = await reorderActivityTemplates({
        request,
        input: {
          projectId,
          siteId,
          workPackageId,
          templateId,
          activityCategoryId,
          orderedActivityTemplateIds
        }
      });

      return NextResponse.json(result);
    }

    if (!id) {
      return NextResponse.json({ error: "Activity template id is required." }, { status: 400 });
    }

    if (body.archived === true || action === "archive") {
      const activity = await archiveActivityTemplate({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        activityTemplateId: id
      });
      return NextResponse.json({ activity });
    }

    const activity = await updateActivityTemplate({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        templateId,
        id,
        activityCategoryId: typeof body.activityCategoryId === "string" ? body.activityCategoryId : undefined,
        sequence: typeof body.sequence === "number" ? body.sequence : undefined,
        code: typeof body.code === "string" ? body.code : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        estimatedDuration:
          typeof body.estimatedDuration === "number" || body.estimatedDuration === null
            ? body.estimatedDuration
            : undefined,
        durationUnit: parseDurationUnit(body.durationUnit),
        mandatory: typeof body.mandatory === "boolean" ? body.mandatory : undefined,
        requiresPhoto: typeof body.requiresPhoto === "boolean" ? body.requiresPhoto : undefined,
        requiresGps: typeof body.requiresGps === "boolean" ? body.requiresGps : undefined,
        requiresApproval: typeof body.requiresApproval === "boolean" ? body.requiresApproval : undefined,
        status: parseStatus(body.status),
        notes: typeof body.notes === "string" || body.notes === null ? body.notes : undefined
      }
    });

    return NextResponse.json({ activity });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
