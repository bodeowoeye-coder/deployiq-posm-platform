import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveBusinessUnit,
  createBusinessUnit,
  getBusinessUnitById,
  getBusinessUnitsForClient,
  updateBusinessUnit
} from "@/lib/core/businessUnits";
import type { BusinessUnitStatus } from "@/lib/types";

function textValue(value: string | null) {
  return (value ?? "").trim();
}

function parseBusinessUnitStatus(value: unknown): BusinessUnitStatus | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim() as BusinessUnitStatus;
  if (["active", "inactive", "archived"].includes(normalized)) return normalized;
  return undefined;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = textValue(searchParams.get("clientId"));
    const businessUnitId = textValue(searchParams.get("businessUnitId"));
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";

    if (!clientId) return NextResponse.json({ error: "clientId is required." }, { status: 400 });

    if (businessUnitId) {
      const businessUnit = await getBusinessUnitById({ request, clientId, businessUnitId, includeArchived });
      if (!businessUnit) return NextResponse.json({ error: "Business Unit not found." }, { status: 404 });
      return NextResponse.json({ businessUnit });
    }

    const businessUnits = await getBusinessUnitsForClient({ request, clientId, includeArchived });
    return NextResponse.json({ businessUnits });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const clientId = textValue(typeof body.clientId === "string" ? body.clientId : "");
    const name = textValue(typeof body.name === "string" ? body.name : "");
    const code = textValue(typeof body.code === "string" ? body.code : "");

    if (!clientId || !name || !code) {
      return NextResponse.json({ error: "clientId, code, and name are required." }, { status: 400 });
    }

    const businessUnit = await createBusinessUnit({
      request,
      input: {
        clientId,
        code,
        name,
        description: textValue(typeof body.description === "string" ? body.description : "") || null,
        status: parseBusinessUnitStatus(body.status)
      }
    });

    return NextResponse.json({ businessUnit }, { status: 201 });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const clientId = textValue(typeof body.clientId === "string" ? body.clientId : "");
    const id = textValue(typeof body.id === "string" ? body.id : "");
    if (!clientId || !id) {
      return NextResponse.json({ error: "clientId and id are required." }, { status: 400 });
    }

    if (body.archived === true) {
      const businessUnit = await archiveBusinessUnit({ request, clientId, businessUnitId: id });
      return NextResponse.json({ businessUnit });
    }

    const businessUnit = await updateBusinessUnit({
      request,
      input: {
        id,
        clientId,
        code: typeof body.code === "string" ? body.code : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        status: parseBusinessUnitStatus(body.status)
      }
    });

    return NextResponse.json({ businessUnit });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
