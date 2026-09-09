import type { BuildManagementSummary } from "../management/service.ts";
import type { DependencyEdgeIntelligence } from "../management/dependencyIntelligence.ts";
import type { BuildManagementReport } from "../reporting/managementReport.ts";
import type { BuildWorkPackageReport } from "../reporting/workPackageReport.ts";
import type { BuildExecutionHistoryReport } from "../reporting/executionHistoryReport.ts";
import { BUILD_INTELLIGENCE_UNSUPPORTED_CONCLUSIONS } from "./constraints.ts";
import type { BuildIntelligenceActivity, BuildIntelligenceAttention, BuildIntelligenceCollection, BuildIntelligenceDatasetV1, BuildIntelligenceDependency, BuildIntelligenceException, BuildIntelligenceOwner, BuildIntelligenceProvenance } from "./types.ts";

const collection = <T>(items: T[]): BuildIntelligenceCollection<T> => ({ items, total: items.length, returned: items.length, truncated: false, continuationToken: null });
const instant = (value: string, label: string) => { const date = new Date(value); if (!value || !Number.isFinite(date.getTime())) throw new Error(`Invalid Build intelligence ${label}`); return date.toISOString(); };
const unique = <T extends { id: string }>(rows: T[], label: string) => { if (rows.some(row => !row.id) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error(`Invalid Build intelligence ${label}`); return rows; };
const uniqueBy = <T>(rows:T[], key:(row:T)=>string, label:string) => { const keys=rows.map(key);if(keys.some(value=>!value)||new Set(keys).size!==keys.length)throw new Error(`Invalid Build intelligence ${label}`);return rows; };
function validRatio(value:{numerator:number;denominator:number;ratio:number|null;state?:string},label:string){
  if(!Number.isInteger(value.numerator)||!Number.isInteger(value.denominator)||value.numerator<0||value.denominator<0||value.numerator>value.denominator)throw new Error(`Invalid Build intelligence ${label}`);
  if(value.denominator===0){if(value.ratio!==null||(value.state&&value.state!=="unavailable"))throw new Error(`Invalid Build intelligence ${label}`);return;}
  if(value.ratio===null||!Number.isFinite(value.ratio)||Math.abs(value.ratio-value.numerator/value.denominator)>1e-9||(value.state&&value.state!=="available"))throw new Error(`Invalid Build intelligence ${label}`);
}
const assigned = (role: BuildIntelligenceOwner["role"], id: string | null | undefined, displayName?: string | null, includeName=false): BuildIntelligenceOwner => id ? { assignmentState: "assigned", role, ...(includeName && displayName ? { displayName } : {}) } : { assignmentState: "unassigned", role };
const provenance = (key: string, sourceKind: BuildIntelligenceProvenance["sourceKind"], sourceIds: string[], derivation: BuildIntelligenceProvenance["derivation"], evaluatedAt?: string): BuildIntelligenceProvenance => ({ key, sourceKind, sourceIds, derivation, ...(evaluatedAt ? { evaluatedAt } : {}) });

function attentionRecord(row: BuildManagementSummary["managementAttentionItems"][number], includeNames: boolean): BuildIntelligenceAttention {
  const { ownerUserId, ownerDisplayName, expectedActorUserId, expectedActorDisplayName, ...facts } = row;
  return { ...facts, activityOwner: assigned("activity_owner", ownerUserId, ownerDisplayName, includeNames), expectedNextActor: expectedActorUserId
    ? assigned("expected_next_actor", expectedActorUserId, expectedActorDisplayName, includeNames)
    : { assignmentState: row.expectedActor ? "unknown" : "unassigned", role: "expected_next_actor" },
    provenance: {...provenance(`attention:${row.key}`, row.sourceRecordType === "runtime_dependency" ? "runtime_dependency" : row.sourceRecordType === "runtime_exception" ? "exception" : "activity", [row.sourceRecordId], "A.5"),...(row.observedAt?{observedAt:row.observedAt}:{})} };
}

function exceptionRecord(row: BuildManagementSummary["exceptionsRegister"][number], includeNames: boolean): BuildIntelligenceException {
  return { id: row.id, title: row.title, status: row.status, severity: row.severity, dueAt: row.dueAt, overdue: row.overdue,
    activityId: row.activityId, activityName: row.activityName, workPackageId: row.workPackageId, workPackageName: row.workPackageName,
    siteId: row.siteId, siteName: row.siteName, exceptionOwner: assigned("exception_owner", row.ownerUserId || null, row.ownerName, includeNames),
    provenance: provenance(`exception:${row.id}`, "exception", [row.id], "A.5") };
}

function dependencyRecord(row: DependencyEdgeIntelligence): BuildIntelligenceDependency {
  return { ...row, provenance: provenance(`dependency:${row.dependencyId}`, "runtime_dependency", [row.dependencyId, row.predecessorActivityId, row.successorActivityId], "A.4") };
}

function workPlanContext(workPlan:BuildWorkPackageReport["workPlan"]){
  const availability = workPlan.state === "ambiguous" ? "ambiguous"
    : workPlan.reason === "work_plan_not_available" ? "missing"
    : workPlan.id && (workPlan.state === "available" || workPlan.state === "empty") ? "available"
    : "unavailable";
  if ((availability === "available") !== Boolean(workPlan.id) || (availability === "ambiguous" && workPlan.id)) throw new Error("Invalid Build intelligence Work Plan identity");
  return {availability,sourceState:workPlan.state,id:workPlan.id,reason:workPlan.reason} as const;
}

function activityRecord(input:{row:BuildManagementSummary["activityDetails"][number];report:BuildWorkPackageReport;management:BuildManagementSummary;dependencies:DependencyEdgeIntelligence[]}):BuildIntelligenceActivity{
  const {row,report,management}=input;
  const presented=report.activities.find(item=>item.id===row.id);if(!presented)throw new Error("Invalid Build intelligence Activity presentation");
  const attentionRows=management.managementAttentionItems.filter(item=>item.activityId===row.id).map(item=>attentionRecord(item,true));
  const exceptionRows=management.exceptionsRegister.filter(item=>item.activityId===row.id).map(item=>exceptionRecord(item,true));
  const dependencyRows=input.dependencies.filter(item=>item.predecessorActivityId===row.id||item.successorActivityId===row.id).map(dependencyRecord);
  const expectedNextActors=[...new Map(attentionRows.map(item=>[`${item.expectedNextActor.role}:${item.expectedNextActor.assignmentState}:${item.expectedNextActor.displayName??""}`,item.expectedNextActor])).values()];
  return {id:row.id,name:row.name,projectId:row.projectId,siteId:row.siteId,workPackageId:row.workPackageId,workPlanId:row.workPlanId,lifecycleStatus:row.status,mandatory:row.mandatory,approvalRequired:row.requiresApproval,plannedStartAt:row.plannedStartAt,plannedFinishAt:row.plannedFinishAt,actualStartAt:row.actualStartAt,actualFinishAt:row.actualFinishAt,scheduleClassification:row.schedule.state,scheduleDataQuality:row.schedule.dataQuality,operationallyCompleted:row.status==="completed"||row.status==="approved",accepted:row.status==="approved",reviewStatus:presented.reviewStatus,activityOwner:assigned("activity_owner",row.ownerUserId,row.ownerName,true),assignedSupervisor:assigned("assigned_supervisor",row.supervisorUserId,row.supervisorName,true),expectedNextActors,actualReviewer:{assignmentState:"unavailable",role:"actual_reviewer"},attention:collection(attentionRows),dependencies:collection(dependencyRows),exceptions:collection(exceptionRows),provenance:provenance(`activity:${row.id}`,"activity",[row.id],"B.3",report.timing.asOf)};
}

function base(input: { report: BuildManagementReport | BuildWorkPackageReport; detailLevel: "summary" | "work_package" | "activity"; scope: BuildIntelligenceDatasetV1["scope"]; workspace?: { name?: string; reference?: string }; attention: BuildIntelligenceAttention[]; exceptions: BuildIntelligenceException[]; dependencies?: BuildIntelligenceDependency[]; workPackages: BuildManagementReport["workPackages"]; activities?: BuildIntelligenceActivity[] }): BuildIntelligenceDatasetV1 {
  const { report } = input;
  const generatedAt=instant(report.timing.generatedAt,"generatedAt"), asOf=instant(report.timing.asOf,"asOf");
  const periodStart=instant(report.timing.recentExecution.periodStart,"recent periodStart"), periodEnd=instant(report.timing.recentExecution.periodEnd,"recent periodEnd");
  if (periodStart >= periodEnd || periodEnd !== asOf || report.timing.recentExecution.timezone !== "UTC" || report.project.id !== input.scope.projectId) throw new Error("Invalid Build intelligence scope or timing");
  const project = "type" in report.project ? report.project : { ...report.project, clientReference: null, type: "unavailable", status: "unavailable" };
  const progress = report.progress;
  for(const [label,value] of [["duration expected",progress.durationExpected],["duration completed",progress.durationCompleted],["duration accepted",progress.durationAccepted],["schedule coverage","coverage" in report.schedule?report.schedule.coverage:report.coverage.schedule],["review coverage","reviewCoverage" in report.quality?report.quality.reviewCoverage:report.coverage.review]] as const)validRatio(value,label);
  uniqueBy(input.attention,row=>row.key,"attention identifiers");unique(input.exceptions,"Exception identifiers");uniqueBy(input.dependencies??[],row=>row.dependencyId,"dependency identifiers");
  return {
    schemaVersion:"1.0", contract:{name:"deployiq.build.intelligence",detailLevel:input.detailLevel}, scope:input.scope,
    timing:{generatedAt,currentState:{asOf,mutableAfterAsOf:true},recentExecution:{periodStart,periodEnd,interval:"half_open",timezone:"UTC"}},
    project:{...project,...(input.workspace?.name?{workspaceName:input.workspace.name}:{}),...(input.workspace?.reference?{workspaceReference:input.workspace.reference}:{})},
    currentState:report.status, progress, plannedPosition:{operationalShortfall:progress.operationalShortfall,acceptedShortfall:progress.acceptedShortfall,durationExpected:progress.durationExpected,durationCompleted:progress.durationCompleted,durationAccepted:progress.durationAccepted},
    schedule:report.schedule,
    attention:{summary:"summary" in report.attention?report.attention.summary:{outstanding:report.attention.outstanding,overdue:report.attention.overdue,activitiesAffected:report.attention.activitiesAffected},preview:collection(input.attention)},
    quality:report.quality, dependencies:{summary:report.dependencies,records:collection(input.dependencies??[])},
    exceptions:{summary:"counts" in report.exceptions?report.exceptions.counts:{open:report.exceptions.open,inRemediation:report.exceptions.inRemediation,overdue:report.exceptions.overdue,high:report.exceptions.high,critical:report.exceptions.critical},preview:collection(input.exceptions)},
    recentExecution:{...report.recentExecution,interval:"half_open"},workPackages:collection(unique(input.workPackages,"Work Package identifiers")),...(input.activities?{activities:collection(input.activities)}:{}),coverage:report.coverage,
    constraints:{unsupportedConclusions:BUILD_INTELLIGENCE_UNSUPPORTED_CONCLUSIONS,notices:["DeployIQ establishes deterministic facts; interpretation must not be presented as operational truth.","Current-state facts may change after asOf."]},
    provenance:{authority:"deployiq_deterministic_build_intelligence",groups:[provenance("schedule","project",[report.project.id],"A.3",asOf),provenance("dependencies","project",[report.project.id],"A.4",asOf),provenance("attention","project",[report.project.id],"A.5",asOf),provenance("progress","project",[report.project.id],"B.1",asOf),provenance("plannedPosition","project",[report.project.id],"B.2",asOf),provenance("workPackages","project",[report.project.id],"B.3",asOf),provenance("recentExecution","project",[report.project.id],"B.4",asOf),provenance("quality","project",[report.project.id],"B.5",asOf)]},
  };
}

export function composeBuildProjectIntelligenceV1(input:{report:BuildManagementReport;workspace?:{name?:string;reference?:string}}):BuildIntelligenceDatasetV1 {
  const report=input.report;
  if(report.scope.kind!=="project"||report.scope.projectId!==report.project.id||report.scope.clientId!==report.project.clientId)throw new Error("Invalid Build intelligence Project scope");
  return base({report,detailLevel:"summary",scope:{kind:"project",projectId:report.project.id},workspace:input.workspace,attention:report.attention.preview.slice(0,6).map(row=>attentionRecord(row,false)),exceptions:report.exceptions.preview.slice(0,5).map(row=>exceptionRecord(row,false)),workPackages:report.workPackages});
}

export function composeBuildWorkPackageIntelligenceV1(input:{report:BuildWorkPackageReport;management:BuildManagementSummary;dependencies?:DependencyEdgeIntelligence[];workspace?:{name?:string;reference?:string}}):BuildIntelligenceDatasetV1 {
  const {report,management}=input;
  if(report.scope.projectId!==report.project.id||report.scope.clientId!==report.project.clientId||management.projectId!==report.project.id)throw new Error("Invalid Build intelligence Work Package scope");
  const details=unique(management.activityDetails.filter(row=>row.workPackageId===report.scope.workPackageId),"Activity identifiers");
  if(details.some(row=>row.projectId!==report.project.id||row.clientId!==report.project.clientId||row.siteId!==report.scope.siteId))throw new Error("Invalid Build intelligence Work Package ancestry");
  const attention=report.attention.preview.slice(0,6).map(row=>attentionRecord(row,true)), exceptions=report.exceptions.preview.slice(0,5).map(row=>exceptionRecord(row,true));
  const dependencies=(input.dependencies??[]).filter(row=>row.workPackageId===report.scope.workPackageId).map(dependencyRecord);
  const activities=details.map(row=>activityRecord({row,report,management,dependencies:input.dependencies??[]}));
  return {...base({report,detailLevel:"work_package",scope:{kind:"work_package",projectId:report.project.id,workPackageId:report.scope.workPackageId},workspace:input.workspace,attention,exceptions,dependencies,workPackages:[],activities}),workPackageContext:{site:{id:report.scope.siteId,name:report.scope.siteName},workPackage:{id:report.scope.workPackageId,name:report.scope.workPackageName},workPlan:workPlanContext(report.workPlan)}};
}

export function composeBuildActivityIntelligenceV1(input:{report:BuildWorkPackageReport;management:BuildManagementSummary;activityId:string;dependencies?:DependencyEdgeIntelligence[];workspace?:{name?:string;reference?:string}}):BuildIntelligenceDatasetV1 {
  const {report,management,activityId}=input;
  if(report.scope.projectId!==report.project.id||management.projectId!==report.project.id)throw new Error("Invalid Build intelligence Activity scope");
  const matches=management.activityDetails.filter(row=>row.id===activityId);if(matches.length!==1)throw new Error("Invalid Build intelligence Activity identifier");
  const row=matches[0];if(row.clientId!==report.project.clientId||row.projectId!==report.project.id||row.siteId!==report.scope.siteId||row.workPackageId!==report.scope.workPackageId)throw new Error("Invalid Build intelligence Activity ancestry");
  const activity=activityRecord({row,report,management,dependencies:input.dependencies??[]});
  return {...base({report,detailLevel:"activity",scope:{kind:"activity",projectId:report.project.id,workPackageId:report.scope.workPackageId,activityId},workspace:input.workspace,attention:activity.attention.items,exceptions:activity.exceptions.items,dependencies:activity.dependencies.items,workPackages:[],activities:[activity]}),workPackageContext:{site:{id:report.scope.siteId,name:report.scope.siteName},workPackage:{id:report.scope.workPackageId,name:report.scope.workPackageName},workPlan:workPlanContext(report.workPlan)}};
}

export function attachBuildExecutionHistoryV1(dataset:BuildIntelligenceDatasetV1,history:BuildExecutionHistoryReport):BuildIntelligenceDatasetV1 {
  if(history.project.id!==dataset.project.id||history.project.clientId!==dataset.project.clientId)throw new Error("Invalid Build intelligence history scope");
  if(history.scope.kind==="work_package"&&history.scope.workPackageId!==dataset.scope.workPackageId)throw new Error("Invalid Build intelligence history Work Package ancestry");
  const period=history.timing.period;const start=instant(period.periodStart,"history periodStart"),end=instant(period.periodEnd,"history periodEnd");
  if(start>=end||period.timezone!=="UTC"||!(["daily","weekly"] as const).includes(period.cadence))throw new Error("Invalid Build intelligence history period");
  return {...dataset,timing:{...dataset.timing,requestedHistory:{...period,periodStart:start,periodEnd:end,interval:"half_open"}},history,provenance:{...dataset.provenance,groups:[...dataset.provenance.groups,{key:"history",sourceKind:"derived_contract",sourceIds:[dataset.project.id],derivation:"B.4",periodStart:start,periodEnd:end}]}};
}
