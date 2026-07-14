import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveCategory,
  createCategory,
  getCategories,
  getCategory,
  updateCategory
} from "@/lib/build/activityCategories/service";
import type { BuildActivityCategoryStatus, BuildActivityCategoryType } from "@/lib/build/templates/types";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCategoryType(value: unknown): BuildActivityCategoryType | undefined {
  const candidate = textValue(value).toLowerCase().replace(/[\s-]+/g, "_") as BuildActivityCategoryType;
  if (
    candidate === "preparation" ||
    candidate === "execution" ||
    candidate === "inspection" ||
    candidate === "testing" ||
    candidate === "commissioning" ||
    candidate === "close_out" ||
    candidate === "general"
  ) {
    return candidate;
  }
  return undefined;
}

function parseStatus(value: unknown): BuildActivityCategoryStatus | undefined {
  const candidate = textValue(value).toLowerCase() as BuildActivityCategoryStatus;
  if (candidate === "active" || candidate === "archived") return candidate;
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
    const categoryId = textValue(searchParams.get("categoryId"));
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";

    if (!projectId || !siteId || !workPackageId || !templateId) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, and templateId are required." },
        { status: 400 }
      );
    }

    if (categoryId) {
      const category = await getCategory({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        categoryId,
        includeArchived
      });
      if (!category) return NextResponse.json({ error: "Activity Category not found." }, { status: 404 });
      return NextResponse.json({ category });
    }

    const categories = await getCategories({
      request,
      projectId,
      siteId,
      workPackageId,
      templateId,
      includeArchived
    });

    return NextResponse.json({ categories });
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
    const code = textValue(body.code);
    const name = textValue(body.name);

    if (!projectId || !siteId || !workPackageId || !templateId || !code || !name) {
      return NextResponse.json(
        { error: "projectId, siteId, workPackageId, templateId, code, and name are required." },
        { status: 400 }
      );
    }

    const category = await createCategory({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        templateId,
        sequence: typeof body.sequence === "number" ? body.sequence : undefined,
        code,
        name,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        categoryType: parseCategoryType(body.categoryType),
        estimatedDuration: typeof body.estimatedDuration === "number" ? body.estimatedDuration : undefined,
        status: parseStatus(body.status)
      }
    });

    return NextResponse.json({ category }, { status: 201 });
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
      const category = await archiveCategory({
        request,
        projectId,
        siteId,
        workPackageId,
        templateId,
        categoryId: id
      });
      return NextResponse.json({ category });
    }

    const category = await updateCategory({
      request,
      input: {
        projectId,
        siteId,
        workPackageId,
        templateId,
        id,
        sequence: typeof body.sequence === "number" ? body.sequence : undefined,
        code: typeof body.code === "string" ? body.code : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        categoryType: parseCategoryType(body.categoryType),
        estimatedDuration: typeof body.estimatedDuration === "number" || body.estimatedDuration === null ? body.estimatedDuration : undefined,
        status: parseStatus(body.status)
      }
    });

    return NextResponse.json({ category });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
