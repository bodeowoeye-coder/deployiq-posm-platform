import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPdfFilename, renderBuildReportPdf } from "../lib/build/reporting/pdf.ts";

const period={from:"2026-09-01",through:"2026-09-06",periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-09-07T00:00:00.000Z",timezone:"UTC",cadence:"daily"};
const counts={activitiesStarted:1,operationalCompletions:1,acceptedActivities:0,submissions:0,initialSubmissions:0,resubmissions:0,changesRequiredOutcomes:0,activitiesRequiringChanges:0,correctiveWorkResumptions:0,correctiveCycles:0,activitiesWithCorrectiveCycles:0,blockedEvents:0,activitiesBlocked:0,resumedEvents:0};
const history=(scope="project",length=2)=>({report:{type:"build_execution_history_report",title:"Execution History Report",version:1},project:{id:"project-uuid-not-exported",clientId:"client-uuid-not-exported",name:"Construction Project",code:"BLD/001"},scope:{kind:scope,workPackageId:scope==="work_package"?"wp-private-id":null,workPackageName:scope==="work_package"?"Ground Floor Works":null,siteName:scope==="work_package"?"Main Site":null},timing:{generatedAt:"2026-09-07T10:00:00.000Z",period},summary:{activitiesStarted:scope==="project"?1:null,activitiesCompleted:1,activitiesAccepted:0,submissions:0,initialSubmissions:scope==="project"?0:null,resubmissions:scope==="project"?0:null,changesRequiredOutcomes:0,activitiesRequiringCorrection:scope==="project"?0:null,correctiveCycles:scope==="project"?0:null,blockedEvents:scope==="project"?0:null,resumedEvents:scope==="project"?0:null},review:{cyclesTotal:scope==="project"?0:null,cyclesMeasured:0,cyclesUnmeasurable:scope==="project"?0:null,averageHours:null,medianHours:null,minHours:null,maxHours:null},buckets:scope==="project"?Array.from({length},(_,index)=>({...counts,label:`2026-09-${String(index+1).padStart(2,"0")}`,bucketStart:new Date(Date.UTC(2026,8,index+1)).toISOString(),bucketEnd:new Date(Date.UTC(2026,8,index+2)).toISOString()})):[],workPackages:scope==="project"?Array.from({length},(_,index)=>({id:`wp-${index}`,name:`Work Package ${index} with a deliberately long descriptive name`,operationalCompletions:1,acceptedActivities:0,submissions:0,changesRequiredOutcomes:0,reviewCyclesMeasured:0,medianReviewTurnaroundHours:null})):[],coverage:{dataQuality:"complete",scopedBucketsAvailable:scope==="project",archivedWorkPackages:0,reviewCyclesMeasured:0,reviewCyclesTotal:scope==="project"?0:null}});

test("C.5 renders a genuine neutral Build PDF with safe history filename and metadata",()=>{
  const report=history();const artifact=renderBuildReportPdf(report);const bytes=Buffer.from(artifact.bytes);
  assert.equal(bytes.subarray(0,5).toString(),"%PDF-");assert.ok(bytes.length>1500);
  assert.equal(artifact.filename,"DeployIQ-Build-Execution-History-BLD-001-2026-09-01-to-2026-09-06.pdf");
  assert.doesNotMatch(bytes.toString("latin1"),/project-uuid-not-exported|client-uuid-not-exported|Supabase|service.role|POSM|Outlet|GPS Verified/i);
});

test("C.5 pagination handles long timeline and Work Package breakdown without arbitrary page size",()=>{
  const artifact=renderBuildReportPdf(history("project",80));const source=Buffer.from(artifact.bytes).toString("latin1");
  assert.ok((source.match(/\/Type \/Page\b/g)??[]).length>2);assert.match(source,/\/MediaBox \[0 0 595\.27\d* 841\.88\d*\]/);
});

test("C.5 reduced Work Package history omits unsupported facts and uses deterministic safe naming",()=>{
  const report=history("work_package");const first=buildPdfFilename(report),second=buildPdfFilename(structuredClone(report));
  assert.equal(first,second);assert.equal(first,"DeployIQ-Build-Execution-History-BLD-001-Work-Package-Ground-Floor-Works-2026-09-01-to-2026-09-06.pdf");
  const renderer=readFileSync(new URL("../lib/build/reporting/pdf.ts",import.meta.url),"utf8");
  assert.match(renderer,/r\.scope\.kind==="project"\?\[\["Review Cycles"/);assert.match(renderer,/\:\[\["Measured Review Cycles"/);
});

test("C.5 route is Build-specific authenticated fail-closed and reuses C.2 C.3 C.4 composition",()=>{
  const route=readFileSync(new URL("../app/api/workspace/build/reports/pdf/route.ts",import.meta.url),"utf8");
  for(const term of ["resolveCanonicalBuildProject","projects:read","getBuildManagementSummary","composeBuildManagementReport","composeBuildWorkPackageReport","parseExecutionHistoryQuery","getBuildExecutionHistory","composeBuildExecutionHistoryReport","renderBuildReportPdf","application/pdf","Content-Disposition","private, no-store","nosniff"])assert.match(route,new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(route,/isWorkPackage !== Boolean\(workPackageId\)/);assert.match(route,/!UUID\.test\(projectId\)/);assert.match(route,/!UUID\.test\(workPackageId\)/);assert.match(route,/period\.state !== "ready"/);
  assert.doesNotMatch(route,/query\.get\(["']client_?id|requireAdmin|app\/api\/exports|app\/api\/client\/exports/i);
});

test("C.5 download affordances preserve explicit current and historical report contracts",()=>{
  const current=readFileSync(new URL("../components/workspace/BuildManagementReport.tsx",import.meta.url),"utf8")+readFileSync(new URL("../components/workspace/BuildWorkPackageReport.tsx",import.meta.url),"utf8");
  const historical=readFileSync(new URL("../components/workspace/BuildExecutionHistoryReport.tsx",import.meta.url),"utf8");
  assert.match(current,/type=project_management&projectId=/);assert.match(current,/type=work_package&projectId=.*workPackageId=/s);
  for(const term of ["from","through","cadence","timezone","workPackageId"])assert.match(historical,new RegExp(term));
  assert.match(current+historical,/Download PDF/);assert.doesNotMatch(current+historical,/Export menu|Download CSV|Download Excel/);
});

test("C.5 remains on-demand presentation only with no Retail, persistence, scheduling or AI surface",()=>{
  const renderer=readFileSync(new URL("../lib/build/reporting/pdf.ts",import.meta.url),"utf8");const route=readFileSync(new URL("../app/api/workspace/build/reports/pdf/route.ts",import.meta.url),"utf8");
  assert.doesNotMatch(renderer+route,/\.insert\(|\.update\(|\.upsert\(|storage|saved report|scheduled report|email delivery|SMS|WhatsApp|queue|CEO View|AI summary|forecast|productivity|ranking|POSM|Dealer Board|Campaign Performance|Installer Performance/i);
  assert.doesNotMatch(renderer,/createAdminSupabase|deriveProgress|deriveQuality|getBuildManagementSummary/);
});
