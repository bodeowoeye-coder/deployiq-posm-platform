import { jsPDF } from "jspdf";
import type { BuildManagementReport } from "./managementReport.ts";
import type { BuildWorkPackageReport } from "./workPackageReport.ts";
import type { BuildExecutionHistoryReport } from "./executionHistoryReport.ts";

export type BuildPdfReport = BuildManagementReport | BuildWorkPackageReport | BuildExecutionHistoryReport;
export type BuildPdfArtifact = { bytes: ArrayBuffer; filename: string };
const isManagement = (report: BuildPdfReport): report is BuildManagementReport => report.report.type === "build_management_report";
const isWorkPackage = (report: BuildPdfReport): report is BuildWorkPackageReport => report.report.type === "build_work_package_report";
const isHistory = (report: BuildPdfReport): report is BuildExecutionHistoryReport => report.report.type === "build_execution_history_report";

const margin = 14, bottom = 281, contentWidth = 182;
const words = (value: string) => value.replaceAll("_", " ").replace(/^./, character => character.toUpperCase());
const dateTime = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
const dateOnly = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
const value = (input: number | string | null) => input === null ? "Not available" : String(input);
const hours = (input: number | null) => input === null ? "Not available" : `${input} hours`;
const ratio = (input: { state: string; numerator: number; denominator: number; ratio: number | null }) => input.state === "unavailable" ? "Not available" : `${input.numerator} of ${input.denominator} · ${Math.round((input.ratio ?? 0) * 100)}%`;
const safe = (input: string | null | undefined, fallback = "Report") => (input || fallback).normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || fallback;

export function buildPdfFilename(report: BuildPdfReport) {
  const code = safe(report.project.code, "Project");
  if (isManagement(report)) return `DeployIQ-Build-Management-${code}-${report.timing.generatedAt.slice(0, 10)}.pdf`;
  if (isWorkPackage(report)) return `DeployIQ-Build-Work-Package-${code}-${safe(report.scope.workPackageName)}-${report.timing.generatedAt.slice(0, 10)}.pdf`;
  const scope = report.scope.kind === "work_package" ? `-Work-Package-${safe(report.scope.workPackageName)}` : "";
  return `DeployIQ-Build-Execution-History-${code}${scope}-${report.timing.period.from}-to-${report.timing.period.through}.pdf`;
}

class PdfLayout {
  doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  y = 14;
  private title: string;
  private pendingHeading: { title: string; eyebrow?: string } | null = null;
  constructor(title: string, subject: string, generatedAt: string) {
    this.title = title;
    this.doc.setProperties({ title, subject, creator: "DeployIQ Build", author: "DeployIQ", keywords: "DeployIQ Build report" });
    this.doc.setCreationDate(new Date(generatedAt));
    this.pageHeader();
  }
  private pageHeader() {
    this.doc.setFillColor(3, 10, 28); this.doc.roundedRect(margin, 10, 29, 12, 2, 2, "F");
    this.doc.setTextColor(255,255,255); this.doc.setFont("helvetica","bold"); this.doc.setFontSize(9); this.doc.text("DeployIQ",28.5,17.5,{align:"center"});
    this.doc.setTextColor(15,23,42); this.doc.setFontSize(13); this.doc.text("DeployIQ Build",48,15);
    this.doc.setFont("helvetica","normal"); this.doc.setFontSize(8); this.doc.setTextColor(100,116,139); this.doc.text(this.title,48,20);
    this.doc.setDrawColor(226,232,240); this.doc.line(margin,26,196,26); this.y=34;
  }
  ensure(height: number) { if (this.y + height > bottom) { this.doc.addPage(); this.pageHeader(); } }
  heading(title: string, eyebrow?: string) { this.pendingHeading={title,eyebrow}; }
  private renderHeading(reserve: number) {
    if (!this.pendingHeading) return;
    const { title,eyebrow }=this.pendingHeading;this.ensure(8+(eyebrow?5:0)+reserve);
    if (eyebrow) { this.doc.setFont("helvetica","bold"); this.doc.setFontSize(7); this.doc.setTextColor(234,88,12); this.doc.text(eyebrow.toUpperCase(),margin,this.y); this.y+=5; }
    this.doc.setTextColor(15,23,42); this.doc.setFont("helvetica","bold"); this.doc.setFontSize(13); this.doc.text(title,margin,this.y); this.y+=8;this.pendingHeading=null;
  }
  facts(rows: Array<[string,string]>) {
    const total=rows.reduce((sum,[,raw])=>sum+Math.max(10,(this.doc.splitTextToSize(raw,120) as string[]).length*4+5),0)+2;
    this.renderHeading(Math.min(total,bottom-34));
    for (const [label,raw] of rows) { const lines=this.doc.splitTextToSize(raw,120) as string[]; const height=Math.max(10,lines.length*4+5); this.ensure(height);
      this.doc.setFont("helvetica","bold");this.doc.setFontSize(7);this.doc.setTextColor(100,116,139);this.doc.text(label.toUpperCase(),margin,this.y);
      this.doc.setFont("helvetica","normal");this.doc.setFontSize(9);this.doc.setTextColor(15,23,42);this.doc.text(lines,72,this.y);this.y+=height; }
    this.y+=2;
  }
  cards(rows: Array<[string,string]>) { this.facts(rows); }
  records(title: string, rows: Array<Array<[string,string]>>, empty: string) {
    const firstText=rows[0]?.map(([k,v])=>`${k}: ${v}`).join("  |  ")??`Status: ${empty}`;
    const firstLines=this.doc.splitTextToSize(firstText,contentWidth-6) as string[];
    this.heading(title);this.renderHeading(Math.max(10,firstLines.length*4+12));
    if (!rows.length) { this.facts([["Status",empty]]); return; }
    rows.forEach((row,index)=>{ const text=row.map(([k,v])=>`${k}: ${v}`).join("  |  "); const lines=this.doc.splitTextToSize(text,contentWidth-6) as string[]; const h=lines.length*4+8;
      if (this.y + h + 4 > bottom) { this.doc.addPage();this.pageHeader();this.heading(`${title} (continued)`);this.renderHeading(h+4); }
      this.doc.setFillColor(index%2?248:241,index%2?250:245,index%2?252:249);this.doc.roundedRect(margin,this.y-3,contentWidth,h,1.5,1.5,"F");
      this.doc.setFont("helvetica","normal");this.doc.setFontSize(8);this.doc.setTextColor(15,23,42);this.doc.text(lines,margin+3,this.y+2);this.y+=h+3; });
  }
  finish() { const pages=this.doc.getNumberOfPages(); for(let page=1;page<=pages;page++){this.doc.setPage(page);this.doc.setDrawColor(226,232,240);this.doc.line(margin,285,196,285);this.doc.setFontSize(7);this.doc.setTextColor(100,116,139);this.doc.text("DeployIQ Build · Authenticated report",margin,291);this.doc.text(`Page ${page} of ${pages}`,196,291,{align:"right"});} return this.doc.output("arraybuffer"); }
}

function identity(layout:PdfLayout, report:BuildPdfReport) {
  layout.heading(report.report.title,"Authenticated Build report");
  const rows:Array<[string,string]>=[["Project",report.project.name],["Project code",report.project.code??"Not set"],["Generated At",dateTime(report.timing.generatedAt)]];
  if(isManagement(report)) rows.push(["As Of",dateTime(report.timing.asOf)],["Recent Execution",`${dateTime(report.timing.recentExecution.periodStart)} to ${dateTime(report.timing.recentExecution.periodEnd)} · ${report.timing.recentExecution.timezone}`]);
  else if(isWorkPackage(report)) rows.push(["Site",report.scope.siteName],["Work Package",report.scope.workPackageName],["Work Plan",words(report.workPlan.state)],["As Of",dateTime(report.timing.asOf)],["Recent Execution",`${dateTime(report.timing.recentExecution.periodStart)} to ${dateTime(report.timing.recentExecution.periodEnd)} · ${report.timing.recentExecution.timezone}`]);
  else if(isHistory(report)) rows.push(["Scope",report.scope.kind==="project"?"Project":"Work Package"],...(report.scope.kind==="work_package"?[["Site",report.scope.siteName!],["Work Package",report.scope.workPackageName!]] as Array<[string,string]>:[]),["From",report.timing.period.from],["Through",report.timing.period.through],["Internal period",`[${report.timing.period.periodStart}, ${report.timing.period.periodEnd})`],["Timezone",report.timing.period.timezone],["Cadence",words(report.timing.period.cadence)]);
  layout.facts(rows);
}

function renderManagement(layout:PdfLayout,r:BuildManagementReport){
  layout.heading("Project Status Summary");layout.cards([["Activities Completed",String(r.status.activitiesCompleted)],["Activities Accepted",String(r.status.activitiesAccepted)],["Expected Complete",value(r.status.activitiesExpectedComplete)],["Current Overdue",String(r.status.currentOverdue)],["Management Attention",String(r.status.managementAttention)],["Open Exceptions",String(r.status.openExceptions)]]);
  layout.heading("Progress & Planned Position");layout.cards([["Operational Completion Shortfall",value(r.progress.operationalShortfall)],["Accepted Completion Shortfall",value(r.progress.acceptedShortfall)],["Expected duration share",ratio(r.progress.durationExpected)],["Completed duration share",ratio(r.progress.durationCompleted)],["Accepted duration share",ratio(r.progress.durationAccepted)],["Duration Coverage",`${r.progress.durationCoverage.eligible} of ${r.progress.durationCoverage.total} · ${words(r.progress.durationCoverage.state)}`]]);
  layout.heading("Schedule Performance");layout.cards([["Scheduled Activities",String(r.schedule.scheduled)],["Currently Overdue",String(r.schedule.currentlyOverdue)],["Completed On Time",String(r.schedule.completedOnTime)],["Completed Late",String(r.schedule.completedLate)]]);
  layout.heading("Management Attention");layout.cards([["Outstanding Obligations",String(r.attention.summary.outstandingObligations)],["Overdue Obligations",String(r.attention.summary.overdueObligations)],["Activities Affected",String(r.attention.summary.activitiesAffected)],["Work Packages Affected",String(r.attention.summary.workPackagesAffected)]]);
  layout.records("Management Attention Detail",r.attention.preview.map(item=>[["Type",words(item.type)],["Activity",item.activityName],["Site",item.siteName],["Work Package",item.workPackageName],["Condition",item.condition],["Owner",item.ownerDisplayName??"Unassigned"],["Next Action",item.expectedNextAction??"Not available"],["Due",item.dueAt?dateTime(item.dueAt):"Not available"]]),"No outstanding management attention");
  layout.heading("Quality & Acceptance");layout.cards([["Schedule Adherence",ratio(r.quality.scheduleAdherence)],["First-Pass Acceptance",ratio(r.quality.firstPassAcceptance)],["Activities Requiring Correction",String(r.quality.activitiesRequiringCorrection)],["Current Changes Required",String(r.quality.currentChangesRequired)],["Review Coverage",ratio(r.quality.reviewCoverage)],["Median Review Turnaround",hours(r.quality.medianReviewTurnaroundHours)]]);
  layout.heading("Recent Execution");layout.cards([["Period",`${dateTime(r.recentExecution.periodStart)} to ${dateTime(r.recentExecution.periodEnd)} · ${r.recentExecution.timezone}`],["Activities Started",String(r.recentExecution.counts.activitiesStarted)],["Activities Completed",String(r.recentExecution.counts.operationalCompletions)],["Activities Accepted",String(r.recentExecution.counts.acceptedActivities)],["Submissions",String(r.recentExecution.counts.submissions)],["Changes Required Outcomes",String(r.recentExecution.counts.changesRequiredOutcomes)]]);
  layout.heading("Dependencies");layout.cards([["Total Constraints",String(r.dependencies.totalConstraints)],["Unreleased Constraints",String(r.dependencies.unreleasedConstraints)],["Activities Exposed",String(r.dependencies.downstreamActivitiesExposed)],["Overdue Successors Exposed",String(r.dependencies.overdueSuccessorsWithUnreleasedConstraints)],["Late Predecessor Activities",String(r.dependencies.latePredecessorActivities)],["Work Packages With Exceptions",String(r.dependencies.workPackagesWithDependencyExceptions)],["Baseline-Controlling Constraints",String(r.dependencies.baselineControllingConstraints)],["Data Incomplete",String(r.dependencies.dataIncompleteConstraints)]]);
  layout.heading("Exception Health");layout.cards([["Open / In Remediation",String(r.exceptions.counts.active)],["Overdue",String(r.exceptions.counts.overdue)],["High",String(r.exceptions.counts.high)],["Critical",String(r.exceptions.counts.critical)]]);
  layout.records("Exception Detail",r.exceptions.preview.map(item=>[["Exception",item.title],["Severity",words(item.severity)],["Status",words(item.status)],["Site",item.siteName],["Work Package",item.workPackageName],["Activity",item.activityName],["Owner",item.ownerName],["Due",item.dueAt?dateTime(item.dueAt):"Not available"],["Corrective Evidence",String(item.correctiveEvidenceCount)]]),"No Exceptions have been recorded");
  layout.records("Work Package Summary",r.workPackages.map(w=>[["Work Package",w.name],["Site",w.siteName],["Completed",value(w.completed)],["Expected Complete",value(w.expectedComplete)],["Current Overdue",String(w.currentOverdue)],["Management Attention",String(w.managementAttention)],["Schedule Adherence",ratio(w.scheduleAdherence)],["First-Pass Acceptance",ratio(w.firstPassAcceptance)],["Coverage",words(w.dataQuality)]]),"No active Work Packages");
  layout.heading("Data Coverage");layout.cards([["Schedule Coverage",ratio(r.coverage.schedule)],["Review Coverage",ratio(r.coverage.review)],["Progress Data",words(r.coverage.progress)],["Dependency Data Incomplete",String(r.coverage.dependencyDataIncomplete)],["Work Packages Without Plan",String(r.coverage.workPackagesWithoutPlan)],["Work Packages With Multiple Plans",String(r.coverage.workPackagesWithMultiplePlans)],["Incomplete Measurements",String(r.coverage.workPackagesWithIncompleteMeasurement)],["Assignments Missing",String(r.coverage.assignmentsMissing)]]);
}

function renderWorkPackage(layout:PdfLayout,r:BuildWorkPackageReport){
  layout.heading("Work Package Status Summary");layout.cards([["Activities Completed",value(r.status.activitiesCompleted)],["Activities Accepted",value(r.status.activitiesAccepted)],["Expected Complete",value(r.status.activitiesExpectedComplete)],["Current Overdue",String(r.status.currentOverdue)],["Management Attention",String(r.status.managementAttention)],["Open Exceptions",String(r.status.openExceptions)]]);
  layout.heading("Progress & Planned Position");layout.cards([["Operational Completion Shortfall",value(r.progress.operationalShortfall)],["Accepted Completion Shortfall",value(r.progress.acceptedShortfall)],["Expected duration share",ratio(r.progress.durationExpected)],["Completed duration share",ratio(r.progress.durationCompleted)],["Accepted duration share",ratio(r.progress.durationAccepted)],["Duration Coverage",`${r.progress.durationCoverage.eligible} of ${r.progress.durationCoverage.total} · ${words(r.progress.durationCoverage.state)}`]]);
  layout.heading("Schedule Performance");layout.cards([["Scheduled Activities",String(r.schedule.scheduled)],["Currently Overdue",String(r.schedule.overdue)],["Completed On Time",String(r.schedule.completedOnTime)],["Completed Late",String(r.schedule.completedLate)],["Schedule Coverage",ratio(r.schedule.coverage)]]);
  layout.heading("Management Attention");layout.cards([["Outstanding Obligations",String(r.attention.outstanding)],["Overdue Obligations",String(r.attention.overdue)],["Activities Affected",String(r.attention.activitiesAffected)]]);
  layout.records("Management Attention Detail",r.attention.preview.map(item=>[["Type",words(item.type)],["Activity",item.activityName],["Condition",item.condition],["Owner",item.ownerDisplayName??"Unassigned"],["Next Action",item.expectedNextAction??"Not available"],["Due",item.dueAt?dateTime(item.dueAt):"Not available"]]),"No outstanding management attention");
  layout.heading("Quality & Acceptance");layout.cards([["Schedule Adherence",ratio(r.quality.scheduleAdherence)],["First-Pass Acceptance",ratio(r.quality.firstPassAcceptance)],["Activities Requiring Correction",String(r.quality.activitiesRequiringCorrection)],["Current Changes Required",String(r.quality.currentChangesRequired)],["Review Coverage",ratio(r.quality.reviewCoverage)],["Median Review Turnaround",hours(r.quality.medianReviewTurnaroundHours)]]);
  layout.heading("Recent Execution");layout.cards([["Period",`${dateTime(r.recentExecution.periodStart)} to ${dateTime(r.recentExecution.periodEnd)} · ${r.recentExecution.timezone}`],["Activities Completed",String(r.recentExecution.activitiesCompleted)],["Activities Accepted",String(r.recentExecution.activitiesAccepted)],["Submissions",String(r.recentExecution.submissions)],["Changes Required Outcomes",String(r.recentExecution.changesRequiredOutcomes)]]);
  layout.heading("Dependencies");layout.cards([["Total Constraints",String(r.dependencies.totalConstraints)],["Unreleased Constraints",String(r.dependencies.unreleasedConstraints)],["Activities Exposed",String(r.dependencies.downstreamActivitiesExposed)],["Overdue Successors Exposed",String(r.dependencies.overdueSuccessorsWithUnreleasedConstraints)],["Late Predecessor Activities",String(r.dependencies.latePredecessorActivities)],["Baseline-Controlling Constraints",String(r.dependencies.baselineControllingConstraints)],["Data Incomplete",String(r.dependencies.dataIncompleteConstraints)]]);
  layout.heading("Exception Health");layout.cards([["Open",String(r.exceptions.open)],["In Remediation",String(r.exceptions.inRemediation)],["Overdue",String(r.exceptions.overdue)],["High",String(r.exceptions.high)],["Critical",String(r.exceptions.critical)]]);
  layout.records("Exception Detail",r.exceptions.preview.map(item=>[["Exception",item.title],["Severity",words(item.severity)],["Status",words(item.status)],["Activity",item.activityName],["Owner",item.ownerName],["Due",item.dueAt?dateTime(item.dueAt):"Not available"],["Corrective Evidence",String(item.correctiveEvidenceCount)]]),"No Exceptions have been recorded");
  layout.records("Activity Summary",r.activities.map(a=>[["Activity",a.name],["Lifecycle Status",words(a.status)],["Planned Start",a.plannedStartAt?dateTime(a.plannedStartAt):"Not available"],["Planned Finish",a.plannedFinishAt?dateTime(a.plannedFinishAt):"Not available"],["Actual Start",a.actualStartAt?dateTime(a.actualStartAt):"Not available"],["Actual Finish",a.actualFinishAt?dateTime(a.actualFinishAt):"Not available"],["Schedule Classification",words(a.scheduleClassification)],["Owner",a.ownerName??"Unassigned"],["Supervisor",a.supervisorName??"Unassigned"],["Review Status",words(a.reviewStatus)]]),"No active Activities");
  layout.heading("Data Coverage");layout.cards([["Work Plan",words(r.coverage.workPlan)],["Schedule Coverage",ratio(r.coverage.schedule)],["Duration Coverage",`${r.coverage.duration.eligible} of ${r.coverage.duration.total} · ${words(r.coverage.duration.state)}`],["Review Coverage",ratio(r.coverage.review)],["Incomplete Dependency Records",String(r.coverage.dependencyDataIncomplete)],["Assignments Missing",String(r.coverage.assignmentsMissing)]]);
}

function renderHistory(layout:PdfLayout,r:BuildExecutionHistoryReport){
  layout.heading("Report Scope & Period");layout.cards([["Scope",r.scope.kind==="project"?"Project":"Work Package"],["From",r.timing.period.from],["Through",r.timing.period.through],["Timezone",r.timing.period.timezone],["Cadence",words(r.timing.period.cadence)]]);
  layout.heading("Period Summary");const s=r.summary;const rows:Array<[string,string]>=[["Activities Completed",String(s.activitiesCompleted)],["Activities Accepted",String(s.activitiesAccepted)],["Submissions",String(s.submissions)],["Changes Required Outcomes",String(s.changesRequiredOutcomes)]];if(r.scope.kind==="project")rows.unshift(["Activities Started",value(s.activitiesStarted)]),rows.splice(4,0,["Initial Submissions",value(s.initialSubmissions)],["Resubmissions",value(s.resubmissions)]),rows.push(["Activities Requiring Correction",value(s.activitiesRequiringCorrection)],["Corrective Cycles",value(s.correctiveCycles)],["Blocked Events",value(s.blockedEvents)],["Resumed Events",value(s.resumedEvents)]);layout.cards(rows);
  layout.heading("Review & Correction History");layout.cards(r.scope.kind==="project"?[["Review Cycles",value(r.review.cyclesTotal)],["Measured Review Cycles",String(r.review.cyclesMeasured)],["Unmeasurable Review Cycles",value(r.review.cyclesUnmeasurable)],["Average Review Turnaround",hours(r.review.averageHours)],["Median Review Turnaround",hours(r.review.medianHours)],["Minimum Review Turnaround",hours(r.review.minHours)],["Maximum Review Turnaround",hours(r.review.maxHours)]]:[["Measured Review Cycles",String(r.review.cyclesMeasured)],["Median Review Turnaround",hours(r.review.medianHours)]]);
  if(r.scope.kind==="project")layout.records("Execution Timeline",r.buckets.map(b=>[["Period",`${b.label} [${b.bucketStart}, ${b.bucketEnd})`],["Started",String(b.activitiesStarted)],["Completed",String(b.operationalCompletions)],["Accepted",String(b.acceptedActivities)],["Submissions",String(b.submissions)],["Resubmissions",String(b.resubmissions)],["Changes Required",String(b.changesRequiredOutcomes)],["Corrective Cycles",String(b.correctiveCycles)],["Blocked",String(b.blockedEvents)],["Resumed",String(b.resumedEvents)]]),"No execution buckets");
  if(r.scope.kind==="project")layout.records("Work Package Breakdown",r.workPackages.map(w=>[["Work Package",w.name],["Completed",String(w.operationalCompletions)],["Accepted",String(w.acceptedActivities)],["Submissions",String(w.submissions)],["Changes Required",String(w.changesRequiredOutcomes)],["Measured Reviews",String(w.reviewCyclesMeasured)],["Median Review Turnaround",hours(w.medianReviewTurnaroundHours)]]),"No Work Package history");
  layout.heading("Data Coverage");layout.cards(r.scope.kind==="project"?[["History Data",words(r.coverage.dataQuality)],["Review Turnaround Coverage",`${r.coverage.reviewCyclesMeasured} of ${r.coverage.reviewCyclesTotal} cycles measured`],["Archived Work Packages",String(r.coverage.archivedWorkPackages)]]:[["History Data",words(r.coverage.dataQuality)],["Measured Review Cycles",String(r.coverage.reviewCyclesMeasured)],["Archived Work Packages",String(r.coverage.archivedWorkPackages)]]);
}

export function renderBuildReportPdf(report:BuildPdfReport):BuildPdfArtifact {
  const layout=new PdfLayout(report.report.title,`${report.report.title} for ${report.project.name}`,report.timing.generatedAt);identity(layout,report);
  if(isManagement(report))renderManagement(layout,report);else if(isWorkPackage(report))renderWorkPackage(layout,report);else renderHistory(layout,report);
  return {bytes:layout.finish(),filename:buildPdfFilename(report)};
}
