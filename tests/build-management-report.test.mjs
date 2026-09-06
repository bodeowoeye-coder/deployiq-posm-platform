import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { composeBuildManagementReport } from "../lib/build/reporting/managementReport.ts";

const project = { id:"project-1", client_id:"client-1", project_name:"Build Project", project_code:"BLD-1",
  client_project_reference:"CLIENT-1", project_type:"Construction", status:"active", archived_at:null };
const ratio = (numerator,denominator)=>({numerator,denominator,ratio:denominator?numerator/denominator:null});
function management(overrides={}) {
  const measurement = { dataQuality:"complete", asOf:"2026-09-06T12:00:00.000Z",
    counts:{totalActivities:4,operationallyCompletedActivities:2,acceptedActivities:1},
    finishPosition:{activitiesExpectedFinished:3,operationalCompletionShortfallActivities:1,acceptedCompletionShortfallActivities:2},
    durationPosition:{totalValidPlannedDurationHours:40,plannedDurationExpectedCompleteHours:30,plannedDurationExpectedCompleteRatio:.75,
      operationalDurationCompletedHours:20,operationalDurationCompletionRatio:.5,acceptedDurationCompletedHours:10,acceptedDurationCompletionRatio:.25},
    coverage:{totalActivities:4,duration:{status:"complete",validDurationActivities:4}} };
  const qualityPackage = { id:"wp-1",name:"Package",schedule:{finishAdherence:ratio(1,2)},quality:{firstPassAcceptance:ratio(1,1)} };
  return { projectId:"project-1",hasWorkPlans:true,activities:{total:4,not_started:1,in_progress:1,completed:1,blocked:0,submitted_for_review:0,changes_required:0,approved:1},
    exceptions:{total:0,open:0,in_remediation:0,resolved:0,verified:0,active:0,overdue:0,critical:0,high:0},
    schedule:{scheduled:4,currentlyOverdue:1,completedOnTime:1,completedLate:1,workPackagesOverdue:1,blockedOverdue:0,changesRequiredOverdue:0,dataIncomplete:0},
    workPackages:[{id:"wp-1",name:"Package",siteId:"site-1",siteName:"Site",activities:{},activeExceptions:0,overdueExceptions:0,schedule:{},dependencies:{}}],scheduleResponsibility:[],
    dependencyFacts:{totalConstraints:2,unreleasedConstraints:1,downstreamActivitiesExposed:1,overdueSuccessorsWithUnreleasedConstraints:0,latePredecessorActivities:1,workPackagesWithDependencyExceptions:1,dataIncompleteConstraints:0,baselineControllingConstraints:1},
    exceptionsRegister:[],managementAttention:{outstandingObligations:1,overdueObligations:1,activitiesAffected:1,workPackagesAffected:1,explicitOwnersAffected:1,unassignedObligations:0,
      categoryCounts:{scheduleOverdue:1,executionBlocks:0,correctiveActionsRequired:0,activeExceptions:0,overdueExceptions:0,reviewsPending:0,assignmentsMissing:0,dependencyAttention:0,dataIncomplete:0},owners:[]},
    managementAttentionPreview:[{key:"one",type:"schedule_overdue",condition:"Activity is overdue",ownerDisplayName:"Owner"}],
    progressPerformance:{ok:true,projectId:"project-1",clientId:"client-1",asOf:"2026-09-06T12:00:00.000Z",dataQuality:"complete",
      scope:{sitesTotal:1,workPackagesTotal:1,workPackagesWithActiveWorkPlan:1,workPackagesWithoutActiveWorkPlan:0,workPackagesWithAmbiguousActivePlans:0,workPackagesWithIncompleteMeasurement:0,totalActivities:4},measurement,
      managementContext:{},workPackages:[{id:"wp-1",name:"Package",siteId:"site-1",siteName:"Site",activeWorkPlanId:"plan-1",measurementAvailability:"measurable",unavailableReason:null,measurement,context:{overdueActivities:1,managementAttentionObligations:1}}]},
    recentExecution:{ok:true,dataQuality:"complete",projectId:"project-1",clientId:"client-1",periodStart:"2026-08-30T12:00:00.000Z",periodEnd:"2026-09-06T12:00:00.000Z",timezone:"UTC",
      counts:{activitiesStarted:2,operationalCompletions:1,acceptedActivities:1,submissions:1,initialSubmissions:1,resubmissions:0,changesRequiredOutcomes:0,activitiesRequiringChanges:0,correctiveWorkResumptions:0,correctiveCycles:0,activitiesWithCorrectiveCycles:0,blockedEvents:0,activitiesBlocked:0,resumedEvents:0},reviewTurnaround:{},activityReviews:[],buckets:[{label:"2026-09-06",bucketStart:"2026-09-06T00:00:00Z",bucketEnd:"2026-09-07T00:00:00Z",activitiesStarted:2}],workPackages:[]},
    qualityAdherence:{ok:true,projectId:"project-1",clientId:"client-1",schedule:{finishAdherence:ratio(1,2),scheduleCoverage:ratio(2,2),scheduleCoverageState:"complete"},
      quality:{firstPassAcceptance:ratio(1,1),activitiesRequiringCorrection:0,currentlyChangesRequiredActivities:0,reviewCoverage:ratio(1,1),medianReviewTurnaroundHours:4,reviewCoverageState:"complete"},workPackages:[qualityPackage]},...overrides };
}
const input = (extra={})=>({project,management:management(),generatedAt:new Date("2026-09-06T12:00:01Z"),asOf:new Date("2026-09-06T12:00:00Z"),...extra});

test("C.2 composes stable identity, timing and factual scopes without using generatedAt as authority",()=>{
  const first=composeBuildManagementReport(input()); const later=composeBuildManagementReport(input({generatedAt:new Date("2026-09-06T13:00:00Z")}));
  assert.equal(first.report.title,"Build Management Report"); assert.equal(first.project.name,"Build Project");
  assert.equal(first.timing.asOf,"2026-09-06T12:00:00.000Z"); assert.equal(first.timing.recentExecution.timezone,"UTC");
  assert.deepEqual(first.status,later.status); assert.deepEqual(first.progress,later.progress);
  assert.equal(first.status.currentOverdue,1); assert.equal(first.status.activitiesCompleted,1); assert.equal(first.recentExecution.counts.activitiesStarted,2);
});

test("C.2 preserves accepted ratios, denominators, coverage, dependencies, exceptions and bounded attention",()=>{
  const source=management(); source.managementAttentionPreview=Array.from({length:8},(_,index)=>({key:String(index),type:"schedule_overdue",condition:"Fact",ownerDisplayName:null}));
  const report=composeBuildManagementReport(input({management:source}));
  assert.deepEqual(report.quality.scheduleAdherence,{numerator:1,denominator:2,ratio:.5,state:"available"});
  assert.deepEqual(report.quality.firstPassAcceptance,{numerator:1,denominator:1,ratio:1,state:"available"});
  assert.deepEqual(report.progress.durationCompleted,{numerator:20,denominator:40,ratio:.5,state:"available"});
  assert.equal(report.attention.preview.length,6); assert.equal(report.dependencies.unreleasedConstraints,1);
  assert.equal(report.exceptions.counts.active,0); assert.equal(report.workPackages[0].expectedComplete,3);
});

test("C.2 represents zero denominators and unavailable Work Packages without fabricated percentages",()=>{
  const source=management(); source.qualityAdherence.quality.firstPassAcceptance=ratio(0,0); source.qualityAdherence.quality.reviewCoverage=ratio(0,0);
  source.qualityAdherence.workPackages[0].quality.firstPassAcceptance=ratio(0,0);
  source.progressPerformance.workPackages[0]={...source.progressPerformance.workPackages[0],activeWorkPlanId:null,measurementAvailability:"unavailable",unavailableReason:"work_plan_not_available",measurement:null};
  const report=composeBuildManagementReport(input({management:source}));
  assert.equal(report.quality.firstPassAcceptance.state,"unavailable"); assert.equal(report.quality.reviewCoverage.state,"unavailable");
  assert.equal(report.workPackages[0].availability,"unavailable"); assert.equal(report.workPackages[0].completed,null);
});

test("C.2 fails closed for malformed ratios, timestamps, periods, duplicate packages and authority scope",()=>{
  const badRatio=management(); badRatio.qualityAdherence.schedule.finishAdherence={numerator:2,denominator:1,ratio:2};
  assert.throws(()=>composeBuildManagementReport(input({management:badRatio})),/schedule adherence/);
  assert.throws(()=>composeBuildManagementReport(input({generatedAt:new Date("invalid")})),/generatedAt/);
  const badPeriod=management(); badPeriod.recentExecution.periodStart=badPeriod.recentExecution.periodEnd;
  assert.throws(()=>composeBuildManagementReport(input({management:badPeriod})),/period/);
  const duplicate=management(); duplicate.progressPerformance.workPackages.push(duplicate.progressPerformance.workPackages[0]);
  assert.throws(()=>composeBuildManagementReport(input({management:duplicate})),/duplicate Work Package/);
  const unknownCoverage=management(); unknownCoverage.progressPerformance.dataQuality="invented";
  assert.throws(()=>composeBuildManagementReport(input({management:unknownCoverage})),/progress coverage/);
  assert.throws(()=>composeBuildManagementReport(input({project:{...project,client_id:"other"}})),/scope/);
  assert.throws(()=>composeBuildManagementReport(input({project:{...project,id:"other"}})),/scope/);
});

test("C.2 route and renderer remain Build-only, reusable and free of unsupported reporting claims",()=>{
  const domain=readFileSync(new URL("../lib/build/reporting/managementReport.ts",import.meta.url),"utf8");
  const renderer=readFileSync(new URL("../components/workspace/BuildManagementReport.tsx",import.meta.url),"utf8");
  const route=readFileSync(new URL("../app/workspace/admin/projects/[id]/[section]/page.tsx",import.meta.url),"utf8");
  assert.match(route,/section === "reports"[\s\S]*const asOf = new Date\(\)[\s\S]*getBuildManagementSummary\(overview\.project\.id, asOf\)[\s\S]*composeBuildManagementReport/);
  assert.doesNotMatch(domain,/createAdminSupabase|\.from\(|\.insert\(|\.update\(/);
  assert.match(renderer,/overflow-x-auto/); assert.match(domain+renderer,/Current-state facts are evaluated/);
  assert.doesNotMatch(domain+renderer,/POSM|outlet|GPS|installer performance|Quality Score|Performance Score|Project Health|ranking|forecast|AI narrative|Physical Progress|Earned Value|critical path|delay caused by|acceptance adherence|Review SLA/i);
  assert.doesNotMatch(route,/api\/.*report|jspdf|xlsx/);
});
