import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { composeBuildWorkPackageReport } from "../lib/build/reporting/workPackageReport.ts";

const project = { id:"project-1",client_id:"client-1",project_name:"Build Project",project_code:"BLD-1",client_project_reference:null,project_type:"Construction",status:"active",archived_at:null };
const ratio = (numerator,denominator)=>({numerator,denominator,ratio:denominator?numerator/denominator:null});
const schedule = { state:"overdue_to_complete",actualStartedAt:"2026-09-01T09:00:00Z",actualWorkFinishedAt:null,submittedForReviewAt:null,inspectionAcceptedAt:null,startVarianceMs:0,finishVarianceMs:null,submissionVarianceMs:null,currentStartDelayMs:null,currentCompletionDelayMs:1000,dataQuality:"complete" };
function fixture() {
  const measurement={dataQuality:"complete",asOf:"2026-09-06T12:00:00.000Z",counts:{totalActivities:2,operationallyCompletedActivities:1,acceptedActivities:0},finishPosition:{activitiesExpectedFinished:2,operationalCompletionShortfallActivities:1,acceptedCompletionShortfallActivities:2},durationPosition:{totalValidPlannedDurationHours:16,plannedDurationExpectedCompleteHours:16,plannedDurationExpectedCompleteRatio:1,operationalDurationCompletedHours:8,operationalDurationCompletionRatio:.5,acceptedDurationCompletedHours:0,acceptedDurationCompletionRatio:0},coverage:{totalActivities:2,duration:{status:"complete",validDurationActivities:2}}};
  const counts={total:2,not_started:0,in_progress:1,completed:1,blocked:0,submitted_for_review:0,changes_required:0,approved:0};
  const dependency={workPackageId:"wp-1",totalConstraints:1,unreleasedConstraints:1,downstreamActivitiesExposed:1,overdueSuccessorsWithUnreleasedConstraints:0,latePredecessorActivities:1,dataIncompleteConstraints:0,baselineControllingConstraints:1,hasDependencyExceptions:true};
  const attention={key:"attention-1",type:"schedule_overdue",condition:"Activity overdue",overdue:true,dueAt:"2026-09-05T12:00:00Z",activityId:"activity-1",workPackageId:"wp-1",siteId:"site-1",ownerDisplayName:"Owner",expectedNextAction:"Complete Activity",activityName:"Activity One"};
  return {projectId:"project-1",hasWorkPlans:true,activities:counts,
    exceptions:{total:1,open:1,in_remediation:0,resolved:0,verified:0,active:1,overdue:1,critical:0,high:1},
    schedule:{scheduled:2,currentlyOverdue:1,completedOnTime:1,completedLate:0,workPackagesOverdue:1,blockedOverdue:0,changesRequiredOverdue:0,dataIncomplete:0},
    workPackages:[{id:"wp-1",name:"Package One",siteId:"site-1",siteName:"Site One",activities:counts,activeExceptions:1,overdueExceptions:1,schedule:{scheduled:2,notYetDue:0,onSchedule:0,overdue:1,completedOnTime:1,completedLate:0},dependencies:dependency}],scheduleResponsibility:[],
    dependencyFacts:{...dependency,workPackagesWithDependencyExceptions:1},
    exceptionsRegister:[{id:"exception-1",title:"Correction",severity:"high",status:"open",ownerUserId:"owner-1",ownerName:"Owner",dueAt:"2026-09-05T12:00:00Z",overdue:true,siteId:"site-1",siteName:"Site One",workPackageId:"wp-1",workPackageName:"Package One",activityId:"activity-1",activityName:"Activity One",inspectionOutcome:"changes_required",inspectionReviewedAt:"2026-09-04T12:00:00Z",correctiveEvidenceCount:0}],
    managementAttention:{outstandingObligations:1,overdueObligations:1,activitiesAffected:1,workPackagesAffected:1,explicitOwnersAffected:1,unassignedObligations:0,categoryCounts:{scheduleOverdue:1,executionBlocks:0,correctiveActionsRequired:0,activeExceptions:0,overdueExceptions:0,reviewsPending:0,assignmentsMissing:0,dependencyAttention:0,dataIncomplete:0},owners:[]},
    managementAttentionItems:[attention],managementAttentionPreview:[attention],
    activityDetails:[{id:"activity-1",clientId:"client-1",projectId:"project-1",siteId:"site-1",workPackageId:"wp-1",workPlanId:"plan-1",name:"Activity One",status:"in_progress",mandatory:true,requiresApproval:true,plannedStartAt:"2026-09-01T09:00:00Z",plannedFinishAt:"2026-09-05T17:00:00Z",actualStartAt:"2026-09-01T09:00:00Z",actualFinishAt:null,schedule,ownerUserId:"owner-1",ownerName:"Owner",supervisorUserId:"supervisor-1",supervisorName:"Supervisor"},{id:"activity-2",clientId:"client-1",projectId:"project-1",siteId:"site-1",workPackageId:"wp-1",workPlanId:"plan-1",name:"Activity Two",status:"completed",mandatory:true,requiresApproval:false,plannedStartAt:"2026-09-01T09:00:00Z",plannedFinishAt:"2026-09-02T17:00:00Z",actualStartAt:"2026-09-01T09:00:00Z",actualFinishAt:"2026-09-02T16:00:00Z",schedule:{...schedule,state:"completed_on_time",actualWorkFinishedAt:"2026-09-02T16:00:00Z"},ownerUserId:null,ownerName:null,supervisorUserId:null,supervisorName:null}],
    progressPerformance:{ok:true,projectId:"project-1",clientId:"client-1",asOf:"2026-09-06T12:00:00.000Z",dataQuality:"complete",scope:{sitesTotal:1,workPackagesTotal:1,workPackagesWithActiveWorkPlan:1,workPackagesWithoutActiveWorkPlan:0,workPackagesWithAmbiguousActivePlans:0,workPackagesWithIncompleteMeasurement:0,totalActivities:2},measurement,managementContext:{},workPackages:[{id:"wp-1",name:"Package One",siteId:"site-1",siteName:"Site One",activeWorkPlanId:"plan-1",measurementAvailability:"measurable",unavailableReason:null,measurement,context:{overdueActivities:1,managementAttentionObligations:1}}]},
    recentExecution:{ok:true,dataQuality:"complete",projectId:"project-1",clientId:"client-1",periodStart:"2026-08-30T12:00:00.000Z",periodEnd:"2026-09-06T12:00:00.000Z",timezone:"UTC",counts:{},reviewTurnaround:{},activityReviews:[{activityId:"activity-1",workPackageId:"wp-1",reviewCycles:2}],buckets:[],workPackages:[{id:"wp-1",name:"Package One",operationalCompletions:1,acceptedActivities:0,submissions:1,changesRequiredOutcomes:1,reviewCyclesMeasured:1,medianReviewTurnaroundHours:4}]},
    qualityAdherence:{ok:true,projectId:"project-1",clientId:"client-1",schedule:{finishAdherence:ratio(1,1),scheduleCoverage:ratio(2,2),scheduleCoverageState:"complete"},quality:{firstPassAcceptance:ratio(0,1),activitiesRequiringCorrection:1,currentlyChangesRequiredActivities:0,reviewCoverage:ratio(1,1),medianReviewTurnaroundHours:4,reviewCoverageState:"complete"},workPackages:[{id:"wp-1",name:"Package One",historicalOnly:false,schedule:{finishAdherence:ratio(1,1),scheduleCoverage:ratio(2,2),scheduleCoverageState:"complete"},quality:{firstPassAcceptance:ratio(0,1),activitiesRequiringCorrection:1,currentlyChangesRequiredActivities:0,reviewCoverage:ratio(1,1),medianReviewTurnaroundHours:4,reviewCoverageState:"complete"}}]}};
}
const input=(management=fixture(),extra={})=>({project,management,workPackageId:"wp-1",generatedAt:new Date("2026-09-06T12:00:01Z"),asOf:new Date("2026-09-06T12:00:00Z"),...extra});

test("C.3 composes one authoritative Work Package with factual timing and accepted intelligence",()=>{
  const report=composeBuildWorkPackageReport(input());
  assert.equal(report.report.title,"Work Package Report"); assert.equal(report.project.name,"Build Project"); assert.equal(report.scope.siteName,"Site One"); assert.equal(report.scope.workPackageName,"Package One");
  assert.equal(report.timing.asOf,"2026-09-06T12:00:00.000Z"); assert.equal(report.timing.recentExecution.timezone,"UTC"); assert.equal(report.workPlan.id,"plan-1");
  assert.deepEqual(report.status,{activitiesCompleted:1,activitiesAccepted:0,activitiesExpectedComplete:2,currentOverdue:1,managementAttention:1,openExceptions:1});
  assert.equal(report.progress.operationalShortfall,1); assert.equal(report.schedule.overdue,1); assert.equal(report.attention.preview.length,1);
  assert.deepEqual(report.quality.firstPassAcceptance,{numerator:0,denominator:1,ratio:0,state:"available"}); assert.equal(report.recentExecution.submissions,1);
  assert.equal(report.dependencies.unreleasedConstraints,1); assert.equal(report.exceptions.high,1); assert.equal(report.activities.length,2);
  assert.equal(report.activities[0].ownerName,"Owner"); assert.equal(report.activities[0].supervisorName,"Supervisor"); assert.equal(report.activities[0].reviewStatus,"not_submitted");
});

test("C.3 is deterministic, bounds attention and preserves numerator denominator and coverage",()=>{
  const source=fixture(); source.managementAttentionItems=Array.from({length:8},(_,index)=>({...source.managementAttentionItems[0],key:`item-${index}`}));
  const first=composeBuildWorkPackageReport(input(source)); const second=composeBuildWorkPackageReport(input(structuredClone(source)));
  assert.deepEqual(first,second); assert.equal(first.attention.preview.length,6); assert.deepEqual(first.schedule.coverage,{numerator:2,denominator:2,ratio:1,state:"available"});
  assert.deepEqual(first.progress.durationCompleted,{numerator:8,denominator:16,ratio:.5,state:"available"}); assert.equal(first.coverage.assignmentsMissing,0);
});

test("C.3 fails closed for cross-project cross-tenant duplicate ancestry timing and ratio faults",()=>{
  assert.throws(()=>composeBuildWorkPackageReport(input(fixture(),{project:{...project,client_id:"other"}})),/scope/);
  assert.throws(()=>composeBuildWorkPackageReport(input(fixture(),{project:{...project,id:"other"}})),/scope/);
  const duplicate=fixture(); duplicate.workPackages.push(duplicate.workPackages[0]); assert.throws(()=>composeBuildWorkPackageReport(input(duplicate)),/Work Package scope/);
  const ancestry=fixture(); ancestry.activityDetails[0].siteId="other"; assert.throws(()=>composeBuildWorkPackageReport(input(ancestry)),/Activity ancestry/);
  const badRatio=fixture(); badRatio.qualityAdherence.workPackages[0].quality.firstPassAcceptance={numerator:2,denominator:1,ratio:2}; assert.throws(()=>composeBuildWorkPackageReport(input(badRatio)),/first-pass acceptance/);
  assert.throws(()=>composeBuildWorkPackageReport(input(fixture(),{generatedAt:new Date("invalid")})),/generatedAt/);
  const badPeriod=fixture(); badPeriod.recentExecution.periodEnd="2026-09-05T12:00:00Z"; assert.throws(()=>composeBuildWorkPackageReport(input(badPeriod)),/period/);
});

test("C.3 handles zero and unavailable Work Plan states without fabricated percentages",()=>{
  for(const [reason,state] of [["work_plan_not_available","unavailable"],["multiple_active_work_plans","ambiguous"],["empty_activity_scope","empty"],["invalid_measurement","invalid"]]){
    const source=fixture(); const wp=source.progressPerformance.workPackages[0]; wp.activeWorkPlanId=reason==="empty_activity_scope"?"plan-1":null; wp.measurementAvailability="unavailable"; wp.unavailableReason=reason; wp.measurement=null; source.activityDetails=[];
    source.qualityAdherence.workPackages[0].quality.firstPassAcceptance=ratio(0,0); source.qualityAdherence.workPackages[0].quality.reviewCoverage=ratio(0,0);
    const report=composeBuildWorkPackageReport(input(source)); assert.equal(report.workPlan.state,state); assert.equal(report.status.activitiesCompleted,null); assert.equal(report.quality.firstPassAcceptance.state,"unavailable"); assert.equal(report.quality.reviewCoverage.state,"unavailable");
  }
});

test("C.3 route renderer and composition preserve architecture and prohibited-feature boundaries",()=>{
  const domain=readFileSync(new URL("../lib/build/reporting/workPackageReport.ts",import.meta.url),"utf8");
  const renderer=readFileSync(new URL("../components/workspace/BuildWorkPackageReport.tsx",import.meta.url),"utf8");
  const route=readFileSync(new URL("../app/workspace/admin/projects/[id]/[section]/page.tsx",import.meta.url),"utf8");
  const service=readFileSync(new URL("../lib/build/management/service.ts",import.meta.url),"utf8");
  assert.match(route,/section === "reports"[\s\S]*selectedWorkPackageId[\s\S]*composeBuildWorkPackageReport/);
  assert.match(route,/selectedWorkPackageId && !overview\.workPackages\.some[\s\S]*notFound\(\)/);
  assert.match(renderer,/Activity Summary[\s\S]*overflow-x-auto/); assert.match(renderer,/Generated At/); assert.match(renderer,/As Of/);
  assert.match(renderer,/projects\/\$\{report\.project\.id\}\/reports[\s\S]*Back to Project Report/);
  assert.doesNotMatch(domain,/createAdminSupabase|\.from\(|\.insert\(|\.update\(|new Date\(\)/); assert.match(service,/activityDetails/);
  assert.doesNotMatch(domain+renderer,/POSM|outlet|GPS|Physical Progress|Earned Value|SPI|CPI|Quality Score|Performance Score|Work Package Health|ranking|forecast|critical path|caused by|employee performance|productivity|acceptance SLA|AI narrative/i);
  assert.doesNotMatch(route,/jspdf|xlsx|period selector|api\/.*report/);
});

test("C.2 remains the default Reports composition and C.3 introduces no migration or persistence",()=>{
  const route=readFileSync(new URL("../app/workspace/admin/projects/[id]/[section]/page.tsx",import.meta.url),"utf8");
  assert.match(route,/if \(selectedWorkPackageId\)[\s\S]*BuildWorkPackageReport[\s\S]*composeBuildManagementReport[\s\S]*BuildManagementReport/);
  assert.doesNotMatch(route,/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
