export type BuildWorkPlanStatus = "not_started" | "in_progress" | "completed" | "blocked" | "archived";

export type BuildRuntimeActivity = {
  id: string;
  source_activity_template_id: string;
  source_category_id: string;
  category_code: string;
  category_name: string;
  sequence: number;
  code: string;
  name: string;
  description: string | null;
  planned_duration: number | null;
  duration_unit: "hours" | "days" | "weeks";
  planned_start_at: string | null;
  planned_finish_at: string | null;
  status: "not_started" | "in_progress" | "completed" | "blocked" | "submitted_for_review" | "changes_required" | "approved";
  requires_approval: boolean;
  activity_owner_user_id: string | null;
  supervisor_user_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  blocked_at: string | null;
  blocker_reason: string | null;
  checklist_count: number;
  checklist_resolved_count: number;
  evidence_count: number;
  active_exception_count: number;
  overdue_exception_count: number;
  resource_requirement_count: number;
  predecessor_count: number;
  schedule_performance: import("../management/schedulePerformance").SchedulePerformance;
};

export type BuildRuntimePerson = { userId: string; name: string; roleLabel: string };
export type BuildRuntimeActivityEvent = {
  id: string; event_type: string; previous_status: string | null; resulting_status: string | null;
  actor_user_id: string; activity_owner_user_id: string | null; supervisor_user_id: string | null;
  note: string | null; occurred_at: string; event_sequence: number | null;
};
export type BuildRuntimeActivityExecution = {
  activity: BuildRuntimeActivity;
  owner: BuildRuntimePerson | null;
  supervisor: BuildRuntimePerson | null;
  eligibleOwners: BuildRuntimePerson[];
  eligibleSupervisors: BuildRuntimePerson[];
  events: Array<BuildRuntimeActivityEvent & { actorName: string }>;
  dependencyTypes: string[];
  predecessors: Array<{ id: string; name: string; status: BuildRuntimeActivity["status"]; dependencyType: string }>;
  incomingDependencies: BuildRuntimeDependencyDetail[];
  outgoingDependencies: BuildRuntimeDependencyDetail[];
  dependencyContext: import("../management/dependencyIntelligence").DependencyActivityIntelligence | null;
  attentionItems: import("../management/managementAttention").ManagementAttentionItem[];
  checklistItems: Array<{
    id: string; item: string; description: string | null; mandatory: boolean;
    requiresPhoto: boolean; requiresComment: boolean; acceptanceType: string | null;
    status: "pending" | "passed" | "failed" | "not_applicable";
    resultNote: string | null; resolvedBy: string | null; resolvedAt: string | null;
  }>;
  evidence: BuildRuntimeEvidence[];
  inspections: BuildRuntimeInspection[];
  exceptions: BuildRuntimeException[];
  resourceRequirements: Array<{ id: string; name: string; type: string; quantity: number; unit: string | null; mandatory: boolean }>;
  hasLegacyAmbiguousOrder: boolean;
};

export type BuildRuntimeDependencyDetail = import("../management/dependencyIntelligence").DependencyEdgeIntelligence & {
  predecessorName: string;
  successorName: string;
  predecessorPlannedMilestoneAt: string | null;
  successorPlannedBoundaryAt: string | null;
};

export type BuildRuntimeInspection = {
  id: string;
  reviewerUserId: string;
  reviewerName: string;
  outcome: "accepted" | "changes_required";
  comments: string | null;
  reviewedAt: string;
};

export type BuildRuntimeExceptionStatus = "open" | "in_remediation" | "resolved" | "verified";
export type BuildRuntimeException = {
  id: string; runtimeInspectionId: string; title: string; description: string;
  severity: "low" | "medium" | "high" | "critical"; status: BuildRuntimeExceptionStatus;
  ownerUserId: string; ownerName: string; dueAt: string | null;
  raisedByUserId: string; raisedByName: string; raisedAt: string;
  remediationStartedAt: string | null; resolutionNote: string | null; resolvedAt: string | null;
  verifiedAt: string | null; verificationNote: string | null;
};

export type BuildRuntimeEvidenceType = "photo" | "video" | "document" | "note";
export type BuildRuntimeEvidence = {
  id: string;
  evidenceType: BuildRuntimeEvidenceType;
  runtimeChecklistItemId: string | null;
  runtimeExceptionId: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  note: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  uploadedBy: string;
  uploaderName: string;
  createdAt: string;
  signedUrl: string | null;
};

export type BuildEvidenceUploadAuthorization = {
  authorizationId: string;
  bucket: "build-runtime-evidence";
  path: string;
  token: string;
};

export type BuildWorkPlan = {
  id: string;
  client_id: string;
  project_id: string;
  site_id: string;
  work_package_id: string;
  source_template_id: string;
  source_template_code: string;
  source_template_name: string;
  source_template_version: number;
  source_fingerprint: string;
  status: BuildWorkPlanStatus;
  instantiated_at: string;
  instantiated_by: string | null;
  schedule_baselined_at: string | null;
  archived_at: string | null;
  counts: {
    activities: number;
    checklists: number;
    dependencies: number;
    resourceRequirements: number;
    notStarted: number;
    inProgress: number;
    completed: number;
    blocked: number;
    submittedForReview: number;
    changesRequired: number;
    approved: number;
  };
  activities: BuildRuntimeActivity[];
  dependencies: BuildRuntimeDependencyDetail[];
  dependencyActivityFacts: import("../management/dependencyIntelligence").DependencyActivityIntelligence[];
};

export type BuildWorkPlanScheduleActivity = {
  activityId: string;
  plannedStartAt: string;
  plannedFinishAt: string;
};

export type BuildWorkPlanSchedulePreview = {
  workPlanId: string;
  baselineStart: string;
  scheduleBaselinedAt: string | null;
  persisted: boolean;
  activities: BuildWorkPlanScheduleActivity[];
};

export type BuildWorkPlanDisplayStatus = "not_started" | "in_progress" | "completed";
export function deriveBuildWorkPlanDisplayStatus(activities: ReadonlyArray<Pick<BuildRuntimeActivity, "status">>): BuildWorkPlanDisplayStatus {
  if (activities.length === 0 || activities.every((activity) => activity.status === "not_started")) return "not_started";
  if (activities.every((activity) => activity.status === "completed" || activity.status === "approved")) return "completed";
  return "in_progress";
}
