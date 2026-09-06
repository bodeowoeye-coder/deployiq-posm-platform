import { derivePlannedPosition, type PlannedPositionActivity, type PlannedPositionResult } from "./plannedPosition.ts";

export type ProgressRollupSite = { id: string; clientId: string; projectId: string; name: string; active?: boolean; archivedAt?: string | null };
export type ProgressRollupWorkPackage = { id: string; clientId: string; projectId: string; siteId: string; name: string; active?: boolean; archivedAt?: string | null };
export type ProgressRollupWorkPlan = { id: string; clientId: string; projectId: string; siteId: string; workPackageId: string; active?: boolean; archivedAt?: string | null };
export type ProgressRollupActivity = PlannedPositionActivity & { clientId: string; projectId: string; siteId: string; workPackageId: string; workPlanId: string };
export type ProgressRollupContext = { workPackageId: string; overdueActivities: number; blockedActivities: number; reviewPendingActivities: number; changesRequiredActivities: number; activeExceptions: number; managementAttentionObligations: number; unreleasedDependencyConstraints: number };
export type MeasurementAvailability = "measurable" | "partially_measurable" | "unavailable";

export type WorkPackageProgressRollup = {
  id: string;
  name: string;
  siteId: string;
  siteName: string;
  activeWorkPlanId: string | null;
  measurementAvailability: MeasurementAvailability;
  unavailableReason: "work_plan_not_available" | "multiple_active_work_plans" | "empty_activity_scope" | "invalid_measurement" | null;
  measurement: Extract<PlannedPositionResult, { ok: true }> | null;
  context: ProgressRollupContext;
};

export type ProjectProgressRollup = {
  ok: true;
  projectId: string;
  clientId: string;
  asOf: string;
  dataQuality: "complete" | "partial" | "unavailable" | "invalid";
  scope: {
    sitesTotal: number;
    workPackagesTotal: number;
    workPackagesWithActiveWorkPlan: number;
    workPackagesWithoutActiveWorkPlan: number;
    workPackagesWithAmbiguousActivePlans: number;
    workPackagesWithIncompleteMeasurement: number;
    totalActivities: number;
  };
  measurement: Extract<PlannedPositionResult, { ok: true }> | null;
  managementContext: {
    workPackagesWithOverdueWork: number;
    workPackagesWithBlockedWork: number;
    workPackagesWithManagementAttention: number;
    workPackagesWithDependencyExceptions: number;
  };
  workPackages: WorkPackageProgressRollup[];
} | {
  ok: false;
  projectId: string;
  clientId: string;
  dataQuality: "invalid";
  reason: "invalid_as_of" | "invalid_scope" | "duplicate_identifier" | "cross_tenant_scope" | "cross_project_scope" | "invalid_ancestry" | "invalid_context";
  recordId: string | null;
  workPackages: [];
};

const active = (row: { active?: boolean; archivedAt?: string | null }) => row.active !== false && !row.archivedAt;
const nonNegativeInteger = (value: number) => Number.isInteger(value) && value >= 0;
const emptyContext = (workPackageId: string): ProgressRollupContext => ({ workPackageId, overdueActivities: 0, blockedActivities: 0,
  reviewPendingActivities: 0, changesRequiredActivities: 0, activeExceptions: 0, managementAttentionObligations: 0,
  unreleasedDependencyConstraints: 0 });

function duplicateId(rows: ReadonlyArray<{ id: string }>) {
  const seen = new Set<string>();
  for (const row of rows) { if (!row.id || seen.has(row.id)) return row.id || null; seen.add(row.id); }
  return null;
}

export function deriveProjectProgressRollup(input: {
  projectId: string;
  clientId: string;
  asOf: Date;
  sites: ReadonlyArray<ProgressRollupSite>;
  workPackages: ReadonlyArray<ProgressRollupWorkPackage>;
  workPlans: ReadonlyArray<ProgressRollupWorkPlan>;
  activities: ReadonlyArray<ProgressRollupActivity>;
  context?: ReadonlyArray<ProgressRollupContext>;
}): ProjectProgressRollup {
  const invalid = (reason: Extract<ProjectProgressRollup, { ok: false }>["reason"], recordId: string | null = null): ProjectProgressRollup =>
    ({ ok: false, projectId: input.projectId, clientId: input.clientId, dataQuality: "invalid", reason, recordId, workPackages: [] });
  if (!input.projectId || !input.clientId) return invalid("invalid_scope");
  if (!(input.asOf instanceof Date) || !Number.isFinite(input.asOf.getTime())) return invalid("invalid_as_of");
  for (const rows of [input.sites, input.workPackages, input.workPlans, input.activities]) {
    const duplicate = duplicateId(rows); if (duplicate !== null) return invalid("duplicate_identifier", duplicate);
  }
  const allRows = [...input.sites, ...input.workPackages, ...input.workPlans, ...input.activities];
  const crossTenant = allRows.find((row) => row.clientId !== input.clientId); if (crossTenant) return invalid("cross_tenant_scope", crossTenant.id);
  const crossProject = allRows.find((row) => row.projectId !== input.projectId); if (crossProject) return invalid("cross_project_scope", crossProject.id);

  const allSiteById = new Map(input.sites.map((site) => [site.id, site]));
  const allPackageById = new Map(input.workPackages.map((item) => [item.id, item]));
  const allPlanById = new Map(input.workPlans.map((item) => [item.id, item]));
  for (const wp of input.workPackages.filter(active)) {
    if (!allSiteById.has(wp.siteId)) return invalid("invalid_ancestry", wp.id);
  }
  for (const plan of input.workPlans.filter(active)) {
    const wp = allPackageById.get(plan.workPackageId);
    if (!wp || plan.siteId !== wp.siteId) return invalid("invalid_ancestry", plan.id);
  }
  for (const activity of input.activities.filter(active)) {
    const plan = allPlanById.get(activity.workPlanId);
    if (!plan || activity.workPackageId !== plan.workPackageId || activity.siteId !== plan.siteId) {
      return invalid("invalid_ancestry", activity.id);
    }
  }

  const sites = input.sites.filter(active);
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const packages = input.workPackages.filter((item) => active(item) && siteById.has(item.siteId));
  const packageById = new Map(packages.map((item) => [item.id, item]));
  const plans = input.workPlans.filter((item) => active(item) && packageById.has(item.workPackageId));
  const planById = new Map(plans.map((item) => [item.id, item]));
  const activities = input.activities.filter((item) => active(item) && planById.has(item.workPlanId));

  const contextByPackage = new Map<string, ProgressRollupContext>();
  for (const context of input.context ?? []) {
    if (contextByPackage.has(context.workPackageId) || !packageById.has(context.workPackageId) ||
      ![context.overdueActivities, context.blockedActivities, context.reviewPendingActivities, context.changesRequiredActivities,
        context.activeExceptions, context.managementAttentionObligations, context.unreleasedDependencyConstraints].every(nonNegativeInteger)) {
      return invalid("invalid_context", context.workPackageId);
    }
    contextByPackage.set(context.workPackageId, context);
  }

  const includedProjectActivities: ProgressRollupActivity[] = [];
  let hasAmbiguousPlans = false;
  const workPackageRollups: WorkPackageProgressRollup[] = packages.map((wp) => {
    const packagePlans = plans.filter((plan) => plan.workPackageId === wp.id);
    const context = contextByPackage.get(wp.id) ?? emptyContext(wp.id);
    const base = { id: wp.id, name: wp.name, siteId: wp.siteId, siteName: siteById.get(wp.siteId)!.name, context };
    if (packagePlans.length === 0) return { ...base, activeWorkPlanId: null, measurementAvailability: "unavailable" as const,
      unavailableReason: "work_plan_not_available" as const, measurement: null };
    if (packagePlans.length > 1) { hasAmbiguousPlans = true; return { ...base, activeWorkPlanId: null,
      measurementAvailability: "unavailable" as const, unavailableReason: "multiple_active_work_plans" as const, measurement: null }; }
    const plan = packagePlans[0];
    const packageActivities = activities.filter((activity) => activity.workPlanId === plan.id);
    if (packageActivities.length === 0) return { ...base, activeWorkPlanId: plan.id, measurementAvailability: "unavailable" as const,
      unavailableReason: "empty_activity_scope" as const, measurement: derivePlannedPosition([], input.asOf) as Extract<PlannedPositionResult, { ok: true }> };
    const measurement = derivePlannedPosition(packageActivities, input.asOf);
    if (!measurement.ok) return { ...base, activeWorkPlanId: plan.id,
      measurementAvailability: "unavailable" as const, unavailableReason: "invalid_measurement" as const, measurement: null };
    includedProjectActivities.push(...packageActivities);
    if (measurement.dataQuality === "invalid") return { ...base, activeWorkPlanId: plan.id,
      measurementAvailability: "unavailable" as const, unavailableReason: "invalid_measurement" as const, measurement };
    return { ...base, activeWorkPlanId: plan.id,
      measurementAvailability: measurement.dataQuality === "complete" ? "measurable" as const : "partially_measurable" as const,
      unavailableReason: null, measurement };
  });

  const projectMeasurementResult = derivePlannedPosition(includedProjectActivities, input.asOf);
  const measurement = includedProjectActivities.length > 0 && projectMeasurementResult.ok ? projectMeasurementResult : null;
  const incomplete = workPackageRollups.filter((item) => item.measurementAvailability !== "measurable").length;
  const dataQuality = hasAmbiguousPlans || workPackageRollups.some((item) => item.unavailableReason === "invalid_measurement") ? "invalid"
    : includedProjectActivities.length === 0 ? "unavailable"
      : incomplete > 0 || measurement?.dataQuality === "partial" ? "partial" : "complete";
  return { ok: true, projectId: input.projectId, clientId: input.clientId, asOf: input.asOf.toISOString(), dataQuality,
    scope: { sitesTotal: sites.length, workPackagesTotal: packages.length,
      workPackagesWithActiveWorkPlan: workPackageRollups.filter((item) => item.activeWorkPlanId !== null).length,
      workPackagesWithoutActiveWorkPlan: workPackageRollups.filter((item) => item.unavailableReason === "work_plan_not_available").length,
      workPackagesWithAmbiguousActivePlans: workPackageRollups.filter((item) => item.unavailableReason === "multiple_active_work_plans").length,
      workPackagesWithIncompleteMeasurement: incomplete, totalActivities: measurement?.counts.totalActivities ?? 0 },
    measurement,
    managementContext: {
      workPackagesWithOverdueWork: workPackageRollups.filter((item) => item.context.overdueActivities > 0).length,
      workPackagesWithBlockedWork: workPackageRollups.filter((item) => item.context.blockedActivities > 0).length,
      workPackagesWithManagementAttention: workPackageRollups.filter((item) => item.context.managementAttentionObligations > 0).length,
      workPackagesWithDependencyExceptions: workPackageRollups.filter((item) => item.context.unreleasedDependencyConstraints > 0).length },
    workPackages: workPackageRollups };
}
