import type {
  DependencyActivityIntelligence,
  DependencyEdgeIntelligence,
} from "./dependencyIntelligence.ts";
import type { BuildRuntimeActivity, BuildRuntimeDependencyDetail } from "../runtime/types.ts";

export const DEPENDENCY_TYPE_LABELS = {
  FS: "FS · Finish-to-Start",
  SS: "SS · Start-to-Start",
  FF: "FF · Finish-to-Finish",
  SF: "SF · Start-to-Finish",
} as const;

export const DEPENDENCY_CONDITION_LABELS = {
  milestone_missing: "Waiting for Predecessor",
  waiting_for_lag: "Waiting for Dependency Lag",
  constraint_released: "Constraint Released",
  data_incomplete: "Dependency Data Incomplete",
} as const;

export const ACTUAL_SEQUENCE_LABELS = {
  compliant: "Compliant",
  non_compliant: "Non-compliant",
  not_observable: "Not yet observable",
  data_incomplete: "Data incomplete",
} as const;

export function formatDependencyLag(value: number, unit: "hours" | "days" | "weeks") {
  return `${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`;
}

export function buildDependencyDrilldown(input: {
  edges: ReadonlyArray<DependencyEdgeIntelligence>;
  activities: ReadonlyArray<BuildRuntimeActivity>;
  activityFacts: ReadonlyArray<DependencyActivityIntelligence>;
}) {
  const activities = new Map(input.activities.map((activity) => [activity.id, activity]));
  const dependencies: BuildRuntimeDependencyDetail[] = input.edges.map((edge) => {
    const predecessor = activities.get(edge.predecessorActivityId);
    const successor = activities.get(edge.successorActivityId);
    return {
      ...edge,
      predecessorName: predecessor?.name ?? "Predecessor Activity unavailable",
      successorName: successor?.name ?? "Successor Activity unavailable",
      predecessorPlannedMilestoneAt: edge.requiredPredecessorMilestone === "start"
        ? predecessor?.planned_start_at ?? null
        : predecessor?.planned_finish_at ?? null,
      successorPlannedBoundaryAt: edge.relevantSuccessorBoundary === "start"
        ? successor?.planned_start_at ?? null
        : successor?.planned_finish_at ?? null,
    };
  });
  return { dependencies, activityFacts: [...input.activityFacts] };
}
