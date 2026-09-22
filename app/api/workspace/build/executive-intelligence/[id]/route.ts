import { NextResponse } from "next/server";
import { AccessControlError } from "@/lib/accessControl";
import { createBuildExecutiveServiceFromOrchestration } from "@/lib/build/ai/executiveService";
import { composeExecutiveIntelligenceViewModel } from "@/lib/build/ai/executivePresentation";
import { createConfiguredBuildAIProvider } from "@/lib/build/ai/providers/openai";
import { resolveCanonicalBuildProject } from "@/lib/build/projects/service";
import { isBuildProjectType } from "@/lib/build/projects/types";
import { CustomerWorkspaceRedirect, requireCustomerWorkspace } from "@/lib/workspace/customerAdmin";
import { getCustomerWorkspaceProjectScope } from "@/lib/workspace/projectScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const noStore = { "Cache-Control": "private, no-store" };

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function hasSameRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") return false;
    const suppliedOrigin = new URL(origin);
    const effectiveOrigin = new URL(`${requestUrl.protocol}//${host}`);
    // Host is the HTTP request authority. Do not trust forwarded-host headers or
    // Next's rewritten request URL hostname as the browser-visible authority.
    return origin === suppliedOrigin.origin
      && (suppliedOrigin.protocol === "http:" || suppliedOrigin.protocol === "https:")
      && effectiveOrigin.host === host.toLowerCase()
      && !effectiveOrigin.username
      && !effectiveOrigin.password
      && suppliedOrigin.origin === effectiveOrigin.origin;
  } catch {
    return false;
  }
}

function parseHistory(body: unknown) {
  if (!body || typeof body !== "object" || Object.getPrototypeOf(body) !== Object.prototype || Reflect.ownKeys(body).length !== 1 || !Object.hasOwn(body, "history")) return null;
  const history = (body as { history: unknown }).history;
  if (!history || typeof history !== "object" || Object.getPrototypeOf(history) !== Object.prototype) return null;
  const fields = history as Record<string, unknown>;
  if (Reflect.ownKeys(fields).length !== 4 || !["from", "through", "timezone", "cadence"].every((key) => Object.hasOwn(fields, key)) || !validDate(fields.from) || !validDate(fields.through) || fields.timezone !== "UTC" || (fields.cadence !== "daily" && fields.cadence !== "weekly")) return null;
  const days = (Date.parse(`${fields.through}T00:00:00.000Z`) - Date.parse(`${fields.from}T00:00:00.000Z`)) / 86_400_000 + 1;
  if (days < 1 || days > 366) return null;
  return { from: fields.from, through: fields.through, timezone: "UTC" as const, cadence: fields.cadence };
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    if (!UUID.test(params.id)) return NextResponse.json({ error: "Invalid Build project." }, { status: 400, headers: noStore });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Invalid intelligence request." }, { status: 415, headers: noStore });
    if (!hasSameRequestOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: noStore });
    const workspace = await requireCustomerWorkspace();
    const scope = await getCustomerWorkspaceProjectScope(workspace, params.id);
    if (!scope.selectedProject || !isBuildProjectType(scope.selectedProject.project_type)) return NextResponse.json({ error: "Build project not found." }, { status: 404, headers: noStore });
    const { project } = await resolveCanonicalBuildProject({ request, projectId: params.id, requiredPermission: "projects:read", requestedClientId: workspace.clientId });
    if (project.client_id !== workspace.clientId || project.id !== scope.selectedProject.id) return NextResponse.json({ error: "Build project not found." }, { status: 404, headers: noStore });
    const raw = await request.text();
    if (raw.length > 512) return NextResponse.json({ error: "Invalid intelligence request." }, { status: 400, headers: noStore });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { body = null; }
    const history = parseHistory(body);
    if (!history) return NextResponse.json({ error: "Select a valid UTC history period." }, { status: 400, headers: noStore });
    const configured = createConfiguredBuildAIProvider();
    if (configured.status !== "ready") return NextResponse.json({ error: "AI interpretation is unavailable. Project information remains accessible." }, { status: 503, headers: noStore });
    const service = createBuildExecutiveServiceFromOrchestration({ provider: configured.provider, providerTimeoutMs: configured.config.timeoutMs });
    const result = await service({ projectId: project.id, sections: ["executive_position", "current_management_attention", "material_execution_changes"], history });
    const view = composeExecutiveIntelligenceViewModel(result, project.id);
    if (!view) return NextResponse.json({ error: "Executive interpretation is unavailable." }, { status: 503, headers: noStore });
    return NextResponse.json({ view }, { headers: noStore });
  } catch (error) {
    const status = error instanceof AccessControlError ? error.status : error instanceof CustomerWorkspaceRedirect ? 403 : 500;
    const message = status === 401 ? "Authentication is required." : status === 403 ? "You do not have access to this Build project." : status === 404 ? "Build project not found." : "Executive intelligence is unavailable.";
    return NextResponse.json({ error: message }, { status, headers: noStore });
  }
}
