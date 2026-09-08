import { NextResponse } from "next/server";
import { AccessControlError } from "@/lib/accessControl";
import { getBuildExecutionHistory, getBuildManagementSummary } from "@/lib/build/management/service";
import { resolveCanonicalBuildProject } from "@/lib/build/projects/service";
import { getBuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";
import { composeBuildExecutionHistoryReport, parseExecutionHistoryQuery } from "@/lib/build/reporting/executionHistoryReport";
import { composeBuildManagementReport } from "@/lib/build/reporting/managementReport";
import { renderBuildReportPdf } from "@/lib/build/reporting/pdf";
import { composeBuildWorkPackageReport } from "@/lib/build/reporting/workPackageReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["project_management", "work_package", "project_history", "work_package_history"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: string | null) => value?.trim() ?? "";

function failure(error: unknown) {
  const status = error instanceof AccessControlError ? error.status : 500;
  const message = status === 401 ? "Authentication is required to download this report."
    : status === 403 ? "You do not have access to this Build report."
    : status === 404 ? "The requested Build report scope was not found."
    : status < 500 && error instanceof Error ? error.message
    : "The Build report could not be generated.";
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const type = text(query.get("type")), projectId = text(query.get("projectId")), workPackageId = text(query.get("workPackageId"));
    if (!TYPES.has(type)) throw new AccessControlError("Select a valid Build report type.", 400);
    if (!UUID.test(projectId)) throw new AccessControlError("Select a valid Build Project.", 400);
    const { project } = await resolveCanonicalBuildProject({ request, projectId, requiredPermission: "projects:read" });

    const isWorkPackage = type === "work_package" || type === "work_package_history";
    const isHistory = type === "project_history" || type === "work_package_history";
    if (isWorkPackage !== Boolean(workPackageId)) throw new AccessControlError(isWorkPackage ? "Select a valid Work Package." : "Work Package scope is not valid for this report type.", 400);
    if (workPackageId && !UUID.test(workPackageId)) throw new AccessControlError("Select a valid Work Package.", 400);
    if (!isHistory && ["from", "through", "cadence", "timezone"].some(key => query.has(key))) throw new AccessControlError("Historical filters are not valid for this report type.", 400);

    const overview = isWorkPackage ? await getBuildProjectWorkspaceOverview(project.id) : null;
    const workPackage = workPackageId ? overview?.workPackages.find(row => row.id === workPackageId) : undefined;
    const site = workPackage ? overview?.sites.find(row => row.id === workPackage.siteId) : undefined;
    if (isWorkPackage && (!workPackage || !site)) throw new AccessControlError("The requested Work Package was not found in this Build Project.", 404);

    let report;
    if (!isHistory) {
      const asOf = new Date(), management = await getBuildManagementSummary(project.id, asOf);
      report = type === "project_management"
        ? composeBuildManagementReport({ project, management, asOf, generatedAt: new Date() })
        : composeBuildWorkPackageReport({ project, management, workPackageId, asOf, generatedAt: new Date() });
    } else {
      const period = parseExecutionHistoryQuery({ from: query.get("from") ?? undefined, through: query.get("through") ?? undefined, cadence: query.get("cadence") ?? undefined, timezone: query.get("timezone") ?? undefined });
      if (period.state !== "ready") throw new AccessControlError("Select a valid explicit UTC reporting period.", 400);
      const history = await getBuildExecutionHistory({ projectId: project.id, periodStart: new Date(period.periodStart), periodEnd: new Date(period.periodEnd), cadence: period.cadence });
      report = composeBuildExecutionHistoryReport({ project, history, period, generatedAt: new Date(), workPackage: workPackage && site ? { id: workPackage.id, clientId: project.client_id, projectId: project.id, name: workPackage.name, siteName: site.name } : undefined });
    }

    const artifact = renderBuildReportPdf(report);
    return new NextResponse(artifact.bytes, { status: 200, headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${artifact.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return failure(error); }
}
