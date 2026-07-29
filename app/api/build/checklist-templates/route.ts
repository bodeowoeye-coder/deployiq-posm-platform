import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveChecklistTemplate,
  createChecklistTemplate,
  getChecklistTemplateById,
  getChecklistTemplates,
  reorderChecklistTemplates,
  updateChecklistTemplate
} from "@/lib/build/checklists/service";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    const checklistTemplateId = textValue(searchParams.get("checklistTemplateId"));
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";

    if (!projectId || !siteId || !workPackageId || !templateId || !activityTemplateId) {
      return NextResponse.json(
        {
          error:
            "projectId, siteId, workPackageId, templateId, and activityTemplateId are required."
        },
        { status: 400 }
      );
    }

    if (checklistTemplateId) {
      const checklist = await getChecklistTemplateById({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        activityTemplateId,
        checklistTemplateId,
        includeArchived
      });
      if (!checklist) return NextResponse.json({ error: "Checklist template not found." }, { status: 404 });
      return NextResponse.json({ checklist });
    }

    const checklists = await getChecklistTemplates({
      request,
      projectId,
      siteId,
      workPackageId,
      templateId,
      activityTemplateId,
      includeArchived
    });

    return NextResponse.json({ checklists });
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
    const activityTemplateId = textValue(body.activityTemplateId);
    const item = textValue(body.item);

    if (!projectId || !siteId || !workPackageId || !templateId || !activityTemplateId || !item) {
      return NextResponse.json(
        {
          error:
            "projectId, siteId, workPackageId, templateId, activityTemplateId, and item are required."
        },
        { status: 400 }
      );
    }

    const checklist = await createChecklistTemplate({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        templateId,
        activityTemplateId,
        sequence: typeof body.sequence === "number" ? body.sequence : undefined,
        item,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        mandatory: typeof body.mandatory === "boolean" ? body.mandatory : undefined,
        requiresPhoto: typeof body.requiresPhoto === "boolean" ? body.requiresPhoto : undefined,
        requiresComment: typeof body.requiresComment === "boolean" ? body.requiresComment : undefined,
        acceptanceType:
          typeof body.acceptanceType === "string" || body.acceptanceType === null ? body.acceptanceType : undefined
      }
    });

    return NextResponse.json({ checklist }, { status: 201 });
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
    const activityTemplateId = textValue(body.activityTemplateId);
    const id = textValue(body.id);
    const action = textValue(body.action).toLowerCase();

    if (!projectId || !siteId || !workPackageId || !templateId || !activityTemplateId) {
      return NextResponse.json(
        {
          error:
            "projectId, siteId, workPackageId, templateId, and activityTemplateId are required."
        },
        { status: 400 }
      );
    }

    if (action === "reorder") {
      const orderedChecklistTemplateIds = Array.isArray(body.orderedChecklistTemplateIds)
        ? body.orderedChecklistTemplateIds.filter((item: unknown) => typeof item === "string")
        : [];

      if (orderedChecklistTemplateIds.length === 0) {
        return NextResponse.json(
          { error: "orderedChecklistTemplateIds is required for reorder." },
          { status: 400 }
        );
      }

      const checklists = await reorderChecklistTemplates({
        request,
        input: {
          projectId,
          siteId,
          workPackageId,
          templateId,
          activityTemplateId,
          orderedChecklistTemplateIds
        }
      });

      return NextResponse.json({ checklists });
    }

    if (!id) {
      return NextResponse.json({ error: "Checklist template id is required." }, { status: 400 });
    }

    if (body.archived === true || action === "archive") {
      const checklist = await archiveChecklistTemplate({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        checklistTemplateId: id
      });
      return NextResponse.json({ checklist });
    }

    const checklist = await updateChecklistTemplate({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        templateId,
        id,
        sequence: typeof body.sequence === "number" ? body.sequence : undefined,
        item: typeof body.item === "string" ? body.item : undefined,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        mandatory: typeof body.mandatory === "boolean" ? body.mandatory : undefined,
        requiresPhoto: typeof body.requiresPhoto === "boolean" ? body.requiresPhoto : undefined,
        requiresComment: typeof body.requiresComment === "boolean" ? body.requiresComment : undefined,
        acceptanceType:
          typeof body.acceptanceType === "string" || body.acceptanceType === null ? body.acceptanceType : undefined
      }
    });

    return NextResponse.json({ checklist });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
