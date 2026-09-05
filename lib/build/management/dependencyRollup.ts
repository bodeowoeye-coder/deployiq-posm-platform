import type { DependencyEdgeIntelligence } from "./dependencyIntelligence.ts";

export type DependencyManagementCounts = {
  totalConstraints: number;
  unreleasedConstraints: number;
  downstreamActivitiesExposed: number;
  overdueSuccessorsWithUnreleasedConstraints: number;
  latePredecessorActivities: number;
  workPackagesWithDependencyExceptions: number;
  dataIncompleteConstraints: number;
  baselineControllingConstraints: number;
};

export type WorkPackageDependencyCounts = Omit<DependencyManagementCounts, "workPackagesWithDependencyExceptions"> & {
  workPackageId: string;
  hasDependencyExceptions: boolean;
};

const lateScheduleStates = new Set(["overdue_to_start", "overdue_to_complete", "completed_late"]);

function summarizeEdges(edges: ReadonlyArray<DependencyEdgeIntelligence>) {
  const uniqueEdges = [...new Map(edges.map((edge) => [edge.dependencyId, edge])).values()];
  const unreleased = uniqueEdges.filter((edge) => edge.condition !== "constraint_released");
  const latePredecessors = new Set(uniqueEdges
    .filter((edge) => lateScheduleStates.has(edge.predecessorScheduleState))
    .map((edge) => edge.predecessorActivityId));
  return {
    totalConstraints: uniqueEdges.length,
    unreleasedConstraints: unreleased.length,
    downstreamActivitiesExposed: new Set(unreleased.map((edge) => edge.successorActivityId)).size,
    overdueSuccessorsWithUnreleasedConstraints: new Set(unreleased
      .filter((edge) => edge.overdueSuccessorWithUnreleasedConstraint)
      .map((edge) => edge.successorActivityId)).size,
    latePredecessorActivities: latePredecessors.size,
    dataIncompleteConstraints: uniqueEdges.filter((edge) => edge.condition === "data_incomplete").length,
    baselineControllingConstraints: uniqueEdges.filter((edge) => edge.baselineControlling === true).length,
    hasDependencyExceptions: unreleased.length > 0 || latePredecessors.size > 0,
  };
}

export function deriveDependencyManagementRollup(edges: ReadonlyArray<DependencyEdgeIntelligence>): {
  project: DependencyManagementCounts;
  workPackages: WorkPackageDependencyCounts[];
} {
  const uniqueEdges = [...new Map(edges.map((edge) => [edge.dependencyId, edge])).values()];
  const byWorkPackage = new Map<string, DependencyEdgeIntelligence[]>();
  for (const edge of uniqueEdges) byWorkPackage.set(edge.workPackageId, [...(byWorkPackage.get(edge.workPackageId) ?? []), edge]);
  const workPackages = [...byWorkPackage.entries()].map(([workPackageId, workPackageEdges]) => ({
    workPackageId,
    ...summarizeEdges(workPackageEdges),
  })).sort((left, right) => left.workPackageId.localeCompare(right.workPackageId));
  const project = summarizeEdges(uniqueEdges);
  return {
    project: {
      totalConstraints: project.totalConstraints,
      unreleasedConstraints: project.unreleasedConstraints,
      downstreamActivitiesExposed: project.downstreamActivitiesExposed,
      overdueSuccessorsWithUnreleasedConstraints: project.overdueSuccessorsWithUnreleasedConstraints,
      latePredecessorActivities: project.latePredecessorActivities,
      workPackagesWithDependencyExceptions: workPackages.filter((item) => item.hasDependencyExceptions).length,
      dataIncompleteConstraints: project.dataIncompleteConstraints,
      baselineControllingConstraints: project.baselineControllingConstraints,
    },
    workPackages,
  };
}
