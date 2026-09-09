import type { BuildManagementAttentionPreview } from "../management/managementAttentionPreview.ts";
import type { DependencyEdgeIntelligence } from "../management/dependencyIntelligence.ts";
import type { BuildManagementReport } from "../reporting/managementReport.ts";
import type { BuildWorkPackageReport } from "../reporting/workPackageReport.ts";
import type { BuildExecutionHistoryReport } from "../reporting/executionHistoryReport.ts";
import type { BuildUnsupportedConclusion } from "./constraints.ts";

export type BuildIntelligenceDetailLevel = "summary" | "work_package" | "activity";
export type BuildIntelligenceCollection<T> = { items: T[]; total: number; returned: number; truncated: false; continuationToken: null };
export type BuildIntelligenceOwner = { assignmentState: "assigned" | "unassigned" | "unknown" | "unavailable"; role: "activity_owner" | "assigned_supervisor" | "expected_next_actor" | "exception_owner" | "actual_reviewer"; displayName?: string };
export type BuildIntelligenceProvenance = { key: string; sourceKind: "project" | "work_package" | "activity" | "exception" | "runtime_dependency" | "derived_contract"; sourceIds: string[]; derivation: "A.3" | "A.4" | "A.5" | "B.1" | "B.2" | "B.3" | "B.4" | "B.5"; evaluatedAt?: string; observedAt?: string; periodStart?: string; periodEnd?: string };

export type BuildIntelligenceAttention = Omit<BuildManagementAttentionPreview, "ownerUserId" | "ownerDisplayName" | "expectedActorUserId" | "expectedActorDisplayName"> & {
  activityOwner: BuildIntelligenceOwner;
  expectedNextActor: BuildIntelligenceOwner;
  provenance: BuildIntelligenceProvenance;
};

export type BuildIntelligenceException = {
  id: string; title: string; status: string; severity: string; dueAt: string | null; overdue: boolean;
  activityId: string; activityName: string; workPackageId: string; workPackageName: string; siteId: string; siteName: string;
  exceptionOwner: BuildIntelligenceOwner; provenance: BuildIntelligenceProvenance;
};

export type BuildIntelligenceDependency = DependencyEdgeIntelligence & { provenance: BuildIntelligenceProvenance };

export type BuildIntelligenceActivity = {
  id: string; name: string; projectId: string; siteId: string; workPackageId: string; workPlanId: string;
  lifecycleStatus: string; mandatory: boolean; approvalRequired: boolean;
  plannedStartAt: string | null; plannedFinishAt: string | null; actualStartAt: string | null; actualFinishAt: string | null;
  scheduleClassification: string; scheduleDataQuality: string; operationallyCompleted: boolean; accepted: boolean; reviewStatus: string;
  activityOwner: BuildIntelligenceOwner; assignedSupervisor: BuildIntelligenceOwner; expectedNextActors: BuildIntelligenceOwner[];
  actualReviewer: BuildIntelligenceOwner;
  attention: BuildIntelligenceCollection<BuildIntelligenceAttention>;
  dependencies: BuildIntelligenceCollection<BuildIntelligenceDependency>;
  exceptions: BuildIntelligenceCollection<BuildIntelligenceException>;
  provenance: BuildIntelligenceProvenance;
};

export type BuildIntelligenceDatasetV1 = {
  schemaVersion: "1.0";
  contract: { name: "deployiq.build.intelligence"; detailLevel: BuildIntelligenceDetailLevel };
  scope: { kind: "project" | "work_package" | "activity"; projectId: string; workPackageId?: string; activityId?: string };
  timing: {
    generatedAt: string; currentState: { asOf: string; mutableAfterAsOf: true };
    recentExecution: { periodStart: string; periodEnd: string; interval: "half_open"; timezone: string };
    requestedHistory?: BuildExecutionHistoryReport["timing"]["period"] & { interval: "half_open" };
  };
  project: BuildManagementReport["project"] & { workspaceName?: string; workspaceReference?: string };
  workPackageContext?: {
    site: { id: string; name: string };
    workPackage: { id: string; name: string };
    workPlan: {
      availability: "available" | "missing" | "ambiguous" | "unavailable";
      sourceState: BuildWorkPackageReport["workPlan"]["state"];
      id: string | null;
      reason: BuildWorkPackageReport["workPlan"]["reason"];
    };
  };
  currentState: BuildManagementReport["status"] | BuildWorkPackageReport["status"];
  progress: BuildManagementReport["progress"] | BuildWorkPackageReport["progress"];
  plannedPosition: { operationalShortfall: number | null; acceptedShortfall: number | null; durationExpected: BuildManagementReport["progress"]["durationExpected"]; durationCompleted: BuildManagementReport["progress"]["durationCompleted"]; durationAccepted: BuildManagementReport["progress"]["durationAccepted"] };
  schedule: BuildManagementReport["schedule"] | BuildWorkPackageReport["schedule"];
  attention: { summary: BuildManagementReport["attention"]["summary"] | Pick<BuildWorkPackageReport["attention"], "outstanding" | "overdue" | "activitiesAffected">; preview: BuildIntelligenceCollection<BuildIntelligenceAttention> };
  quality: BuildManagementReport["quality"] | BuildWorkPackageReport["quality"];
  dependencies: { summary: BuildManagementReport["dependencies"] | BuildWorkPackageReport["dependencies"]; records: BuildIntelligenceCollection<BuildIntelligenceDependency> };
  exceptions: { summary: BuildManagementReport["exceptions"]["counts"] | Omit<BuildWorkPackageReport["exceptions"], "preview">; preview: BuildIntelligenceCollection<BuildIntelligenceException> };
  recentExecution: (BuildManagementReport["recentExecution"] | BuildWorkPackageReport["recentExecution"]) & { interval: "half_open" };
  workPackages: BuildIntelligenceCollection<BuildManagementReport["workPackages"][number]>;
  activities?: BuildIntelligenceCollection<BuildIntelligenceActivity>;
  history?: BuildExecutionHistoryReport;
  coverage: BuildManagementReport["coverage"] | BuildWorkPackageReport["coverage"];
  constraints: { unsupportedConclusions: readonly BuildUnsupportedConclusion[]; notices: string[] };
  provenance: { authority: "deployiq_deterministic_build_intelligence"; groups: BuildIntelligenceProvenance[] };
};
