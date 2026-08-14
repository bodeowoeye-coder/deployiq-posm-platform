import { NextResponse } from "next/server";
import {
  createCustomerProject,
  getCustomerProjectDashboard,
  updateCustomerProjectStatus,
} from "@/lib/workspace/projects";

export const dynamic = "force-dynamic";

function statusFor(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

function errorRecord(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return {};
  return error as Record<string, unknown>;
}

function errorText(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function diagnosticFor(error: unknown) {
  const record = errorRecord(error);
  const nested = errorRecord(record.error) ?? {};
  const response = errorRecord(record.response);
  const body = errorRecord(response.body);
  const source = Object.keys(nested).length > 0 ? nested : Object.keys(body).length > 0 ? body : record;
  return {
    message: error instanceof Error ? error.message : errorText(source.message) ?? errorText(record.message) ?? String(error),
    code: errorText(source.code) ?? errorText(record.code),
    details: errorText(source.details) ?? errorText(record.details),
    hint: errorText(source.hint) ?? errorText(record.hint),
    status: typeof source.status === "number" ? source.status : typeof record.status === "number" ? record.status : undefined,
    statusCode: typeof source.statusCode === "number" ? source.statusCode : typeof record.statusCode === "number" ? record.statusCode : undefined,
  };
}

function messageFor(error: unknown) {
  const status = statusFor(error);
  if (status >= 500) return "Project could not be created. Please review the highlighted information and try again.";
  return error instanceof Error ? error.message : "Project could not be created. Please review the highlighted information and try again.";
}

function logProjectError(scope: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.error("[workspace-projects]", scope, diagnosticFor(error));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dashboard = await getCustomerProjectDashboard({
      search: searchParams.get("search"),
      status: searchParams.get("status"),
      product: searchParams.get("product"),
      state: searchParams.get("state"),
      deploymentType: searchParams.get("deploymentType"),
      sort: searchParams.get("sort"),
      page: Number(searchParams.get("page") ?? 1),
    });
    return NextResponse.json({ projects: dashboard.filteredProjects, kpis: dashboard.kpis, pagination: dashboard.pagination });
  } catch (error) {
    logProjectError("GET", error);
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const project = await createCustomerProject(body);
    return NextResponse.json({ project });
  } catch (error) {
    logProjectError("POST", error);
    return NextResponse.json({ error: messageFor(error), readiness: (error as { readiness?: unknown })?.readiness }, { status: statusFor(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const project = await updateCustomerProjectStatus({
      projectId: typeof body.projectId === "string" ? body.projectId : "",
      action: typeof body.action === "string" ? body.action : "",
    });
    return NextResponse.json({ project });
  } catch (error) {
    logProjectError("PATCH", error);
    return NextResponse.json({ error: messageFor(error), readiness: (error as { readiness?: unknown })?.readiness }, { status: statusFor(error) });
  }
}
