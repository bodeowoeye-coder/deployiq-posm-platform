import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import {
  archiveProjectPortfolio,
  createProjectPortfolio,
  getPortfolioById,
  getPortfoliosForClient,
  updateProjectPortfolio
} from "@/lib/core/projectPortfolios";
import type { PortfolioStatus } from "@/lib/types";

function textValue(value: string | null) {
  return (value ?? "").trim();
}

function parsePortfolioStatus(value: unknown): PortfolioStatus | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim() as PortfolioStatus;
  if (["active", "inactive", "archived"].includes(normalized)) return normalized;
  return undefined;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = textValue(searchParams.get("clientId"));
    const portfolioId = textValue(searchParams.get("portfolioId"));
    const businessUnitId = textValue(searchParams.get("businessUnitId"));
    const includeArchived = textValue(searchParams.get("includeArchived")).toLowerCase() === "true";

    if (!clientId) return NextResponse.json({ error: "clientId is required." }, { status: 400 });

    if (portfolioId) {
      const portfolio = await getPortfolioById({ request, clientId, portfolioId, includeArchived });
      if (!portfolio) return NextResponse.json({ error: "Portfolio not found." }, { status: 404 });
      return NextResponse.json({ portfolio });
    }

    const portfolios = await getPortfoliosForClient({ request, clientId, businessUnitId, includeArchived });
    return NextResponse.json({ portfolios });
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

    const portfolio = await createProjectPortfolio({
      request,
      input: {
        clientId,
        businessUnitId: textValue(typeof body.businessUnitId === "string" ? body.businessUnitId : "") || null,
        code,
        name,
        description: textValue(typeof body.description === "string" ? body.description : "") || null,
        portfolioType: textValue(typeof body.portfolioType === "string" ? body.portfolioType : "") || null,
        status: parsePortfolioStatus(body.status),
        plannedStartDate: textValue(typeof body.plannedStartDate === "string" ? body.plannedStartDate : "") || null,
        plannedEndDate: textValue(typeof body.plannedEndDate === "string" ? body.plannedEndDate : "") || null
      }
    });

    return NextResponse.json({ portfolio }, { status: 201 });
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
      const portfolio = await archiveProjectPortfolio({ request, clientId, portfolioId: id });
      return NextResponse.json({ portfolio });
    }

    const portfolio = await updateProjectPortfolio({
      request,
      input: {
        id,
        clientId,
        businessUnitId:
          typeof body.businessUnitId === "string" || body.businessUnitId === null ? body.businessUnitId : undefined,
        code: typeof body.code === "string" ? body.code : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" || body.description === null ? body.description : undefined,
        portfolioType:
          typeof body.portfolioType === "string" || body.portfolioType === null ? body.portfolioType : undefined,
        status: parsePortfolioStatus(body.status),
        plannedStartDate:
          typeof body.plannedStartDate === "string" || body.plannedStartDate === null ? body.plannedStartDate : undefined,
        plannedEndDate:
          typeof body.plannedEndDate === "string" || body.plannedEndDate === null ? body.plannedEndDate : undefined
      }
    });

    return NextResponse.json({ portfolio });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
