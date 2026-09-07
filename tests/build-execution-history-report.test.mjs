import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildUtcHistoryBuckets, deriveProgressHistory } from "../lib/build/management/progressHistory.ts";
import { composeBuildExecutionHistoryReport, parseExecutionHistoryQuery } from "../lib/build/reporting/executionHistoryReport.ts";

const project={id:"project-1",client_id:"client-1",project_name:"Build Project",project_code:"BLD-1",client_project_reference:"REF",project_type:"Construction",status:"active",start_date:null,end_date:null,planned_completion:null,actual_completion:null,primary_target_region:null,primary_target_state:null,project_regions:[],regions_covered:[],agency_id:null,lead_installer_id:null,archived_at:null};
const period={from:"2026-09-01",through:"2026-09-07",periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-09-08T00:00:00.000Z",timezone:"UTC",cadence:"daily"};
let sequence=0;
const event=(id,event_type,occurred_at,activityId="activity-1",workPackageId="wp-1",extra={})=>({id,clientId:"client-1",projectId:"project-1",siteId:"site-1",workPackageId,workPlanId:`plan-${workPackageId}`,activityId,event_type,occurred_at,event_sequence:++sequence,...extra});
const history=(cadence="daily",events=[])=>deriveProgressHistory({projectId:"project-1",clientId:"client-1",periodStart:period.periodStart,periodEnd:period.periodEnd,timezone:"UTC",buckets:buildUtcHistoryBuckets(new Date(period.periodStart),new Date(period.periodEnd),cadence),events,inspections:[],workPackages:[{id:"wp-1",name:"Package",sequence:1}]});

test.beforeEach(()=>{sequence=0});

test("C.4 parses deterministic UTC From/Through boundaries and leap dates",()=>{
  assert.deepEqual(parseExecutionHistoryQuery({}),{state:"selection",cadence:"daily",timezone:"UTC"});
  const parsed=parseExecutionHistoryQuery({from:"2028-02-29",through:"2028-03-01",cadence:"weekly",timezone:"UTC"});
  assert.equal(parsed.state,"ready"); assert.equal(parsed.periodStart,"2028-02-29T00:00:00.000Z"); assert.equal(parsed.periodEnd,"2028-03-02T00:00:00.000Z"); assert.equal(parsed.cadence,"weekly");
  for(const query of [{from:"2026-02-30",through:"2026-03-01"},{from:"09/01/2026",through:"2026-09-02"},{from:"2026-09-02"},{from:"2026-09-03",through:"2026-09-02"},{from:"2026-09-01",through:"2026-09-02",timezone:"Africa/Lagos"},{from:"2026-09-01",through:"2026-09-02",cadence:"monthly"}]) assert.equal(parseExecutionHistoryQuery(query).state,"invalid");
});

test("C.4 project composition preserves B.4 facts, boundaries, buckets and metadata",()=>{
  const source=history("daily",[event("at-start","started",period.periodStart),event("completed","completed","2026-09-02T10:00:00Z"),event("at-end","started",period.periodEnd,"activity-2")]);
  assert.equal(source.ok,true);
  const report=composeBuildExecutionHistoryReport({project,history:source,period,generatedAt:new Date("2026-09-08T12:00:00Z")});
  assert.equal(report.project.name,"Build Project"); assert.equal(report.scope.kind,"project"); assert.equal(report.timing.generatedAt,"2026-09-08T12:00:00.000Z");
  assert.equal(report.summary.activitiesStarted,1); assert.equal(report.summary.activitiesCompleted,1); assert.equal(report.buckets.reduce((sum,row)=>sum+row.activitiesStarted,0),1);
  assert.equal(report.workPackages.reduce((sum,row)=>sum+row.operationalCompletions,0),report.summary.activitiesCompleted);
});

test("C.4 daily and weekly grouping reconcile without changing headlines",()=>{
  const events=[event("one","started","2026-09-01T00:00:00Z","a"),event("two","completed","2026-09-07T23:59:59Z","b")];
  const daily=history("daily",events); sequence=0; const weekly=history("weekly",events.map((row,index)=>({...row,event_sequence:index+1})));
  assert.equal(daily.ok,true); assert.equal(weekly.ok,true); assert.deepEqual(daily.counts,weekly.counts);
  assert.equal(daily.buckets.reduce((sum,row)=>sum+row.operationalCompletions,0),weekly.buckets.reduce((sum,row)=>sum+row.operationalCompletions,0));
});

test("C.4 Work Package scope uses only accepted scoped authority and does not invent metrics",()=>{
  const source=history("daily",[event("completed","completed","2026-09-02T10:00:00Z")]); assert.equal(source.ok,true);
  const report=composeBuildExecutionHistoryReport({project,history:source,period,generatedAt:new Date("2026-09-08T12:00:00Z"),workPackage:{id:"wp-1",clientId:"client-1",projectId:"project-1",siteName:"Site",name:"Package"}});
  assert.equal(report.scope.kind,"work_package"); assert.equal(report.summary.activitiesCompleted,1); assert.equal(report.summary.activitiesStarted,null); assert.equal(report.summary.resubmissions,null); assert.deepEqual(report.buckets,[]); assert.deepEqual(report.workPackages,[]); assert.equal(report.coverage.scopedBucketsAvailable,false);
  const renderer=readFileSync(new URL("../components/workspace/BuildExecutionHistoryReport.tsx",import.meta.url),"utf8");
  assert.match(renderer,/report\.scope\.kind === "work_package" \? \[\["Activities Completed"/);
  assert.match(renderer,/report\.scope\.kind === "project" \? <>/);
});

test("C.4 renders valid empty periods and unavailable review durations without zero hours",()=>{
  const source=history(); assert.equal(source.ok,true);
  const report=composeBuildExecutionHistoryReport({project,history:source,period,generatedAt:new Date("2026-09-08T12:00:00Z")});
  assert.equal(report.summary.submissions,0); assert.equal(report.review.medianHours,null); assert.equal(report.buckets.length,7);
});

test("C.4 composition fails closed for malformed authority, period and Work Package ancestry",()=>{
  const source=history(); assert.equal(source.ok,true);
  const base={project,history:source,period,generatedAt:new Date("2026-09-08T12:00:00Z")};
  assert.throws(()=>composeBuildExecutionHistoryReport({...base,project:{...project,client_id:"other"}}),/scope/);
  assert.throws(()=>composeBuildExecutionHistoryReport({...base,project:{...project,id:"other"}}),/scope/);
  assert.throws(()=>composeBuildExecutionHistoryReport({...base,generatedAt:new Date("bad")}),/generatedAt/);
  assert.throws(()=>composeBuildExecutionHistoryReport({...base,period:{...period,periodEnd:period.periodStart}}),/scope/);
  assert.throws(()=>composeBuildExecutionHistoryReport({...base,workPackage:{id:"wp-1",clientId:"other",projectId:"project-1",siteName:"Site",name:"Package"}}),/Work Package/);
  const populated=history("daily",[event("duplicate-source","completed","2026-09-02T10:00:00Z")]); assert.equal(populated.ok,true);
  const duplicate={...populated,workPackages:[populated.workPackages[0],populated.workPackages[0]]};
  assert.throws(()=>composeBuildExecutionHistoryReport({...base,history:duplicate,workPackage:{id:"wp-1",clientId:"client-1",projectId:"project-1",siteName:"Site",name:"Package"}}),/Work Package history/);
});

test("C.4 route, pure composition and responsive renderer preserve C.2/C.3 and prohibited scope",()=>{
  const domain=readFileSync(new URL("../lib/build/reporting/executionHistoryReport.ts",import.meta.url),"utf8");
  const renderer=readFileSync(new URL("../components/workspace/BuildExecutionHistoryReport.tsx",import.meta.url),"utf8");
  const route=readFileSync(new URL("../app/workspace/admin/projects/[id]/[section]/page.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(domain,/createAdminSupabase|\.from\(|\.insert\(|\.update\(/); assert.match(renderer,/overflow-x-auto/); assert.match(renderer,/Back to Current Report/);
  assert.match(route,/filters\.view === "history"[\s\S]*getBuildExecutionHistory[\s\S]*composeBuildExecutionHistoryReport/);
  assert.match(route,/const asOf = new Date\(\)[\s\S]*composeBuildWorkPackageReport[\s\S]*composeBuildManagementReport/);
  assert.doesNotMatch(domain+renderer,/forecast|productivity|employee performance|ranking|score|Physical Progress|Earned Value|SPI|CPI|critical path|AI interpretation|CEO View|Retail Deployment/i);
  assert.doesNotMatch(domain+renderer+route,/jspdf|xlsx|saved report|scheduled report|\.insert\(|\.upsert\(/i);
});
