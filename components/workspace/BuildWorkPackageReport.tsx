import Link from "next/link";
import type { ReactNode } from "react";
import type { BuildWorkPackageReport as Report, WorkPackageReportRatio } from "@/lib/build/reporting/workPackageReport";

export function BuildWorkPackageReport({ report }: { report: Report }) {
  return <article className="min-w-0 space-y-6" aria-labelledby="build-work-package-report-title">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ Build</p>
      <h3 id="build-work-package-report-title" className="mt-2 text-2xl font-bold text-slate-950">{report.report.title}</h3>
      <p className="mt-1 text-lg font-semibold text-slate-800">{report.scope.workPackageName}</p>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Project" value={report.project.name}/><Fact label="Project Code" value={report.project.code ?? "Not set"}/>
        <Fact label="Site" value={report.scope.siteName}/><Fact label="Work Plan" value={words(report.workPlan.state)}/>
        <Fact label="Generated At" value={dateTime(report.timing.generatedAt)}/><Fact label="As Of" value={dateTime(report.timing.asOf)}/>
        <Fact label="Recent Execution Period" value={`${dateOnly(report.timing.recentExecution.periodStart)} – ${dateOnly(report.timing.recentExecution.periodEnd)}`}/>
        <Fact label="Timezone" value={report.timing.recentExecution.timezone}/>
      </div>
      <p className="mt-4 text-xs text-slate-500">{report.timing.currentStateNotice}</p>
      <div className="mt-4 flex flex-wrap gap-4"><Link className="inline-flex text-sm font-semibold text-orange-700 hover:underline" href={`/workspace/admin/projects/${report.project.id}/reports`}>Back to Project Report</Link><Link className="inline-flex text-sm font-semibold text-orange-700 hover:underline" href={`/workspace/admin/projects/${report.project.id}/reports?view=history&workPackage=${report.scope.workPackageId}`}>Execution History</Link><a className="inline-flex text-sm font-semibold text-orange-700 hover:underline" href={`/api/workspace/build/reports/pdf?type=work_package&projectId=${report.project.id}&workPackageId=${report.scope.workPackageId}`} download>Download PDF</a></div>
    </section>

    {report.workPlan.state !== "available" ? <Section eyebrow="Operational availability" title="Work Plan Status"><Empty>{workPlanMessage(report.workPlan.state)}</Empty></Section> : null}

    <Section eyebrow="Current state" title="Work Package Status Summary"><MetricGrid>
      <Metric label="Activities Completed" value={numberOrUnavailable(report.status.activitiesCompleted)}/><Metric label="Activities Accepted" value={numberOrUnavailable(report.status.activitiesAccepted)}/>
      <Metric label="Expected Complete" value={numberOrUnavailable(report.status.activitiesExpectedComplete)}/><Metric label="Current Overdue" value={String(report.status.currentOverdue)}/>
      <Metric label="Management Attention" value={String(report.status.managementAttention)}/><Metric label="Open Exceptions" value={String(report.status.openExceptions)}/>
    </MetricGrid></Section>

    <Section eyebrow="Current planned position" title="Progress & Planned Position"><MetricGrid>
      <Metric label="Operational Completion Shortfall" value={numberOrUnavailable(report.progress.operationalShortfall)}/><Metric label="Accepted Completion Shortfall" value={numberOrUnavailable(report.progress.acceptedShortfall)}/>
      <RatioMetric label="Planned-duration Share Expected Complete" ratio={report.progress.durationExpected}/><RatioMetric label="Planned-duration Share Completed" ratio={report.progress.durationCompleted}/>
      <RatioMetric label="Planned-duration Share Accepted" ratio={report.progress.durationAccepted}/><Metric label="Duration Coverage" value={`${report.progress.durationCoverage.eligible} of ${report.progress.durationCoverage.total} Activities · ${words(report.progress.durationCoverage.state)}`}/>
    </MetricGrid></Section>

    <div className="grid gap-6 xl:grid-cols-2">
      <Section eyebrow="Current schedule" title="Schedule Performance"><MetricGrid>
        <Metric label="Scheduled Activities" value={String(report.schedule.scheduled)}/><Metric label="Currently Overdue" value={String(report.schedule.overdue)}/>
        <Metric label="Completed On Time" value={String(report.schedule.completedOnTime)}/><Metric label="Completed Late" value={String(report.schedule.completedLate)}/>
        <RatioMetric label="Schedule Coverage" ratio={report.schedule.coverage}/><Metric label="Incomplete Schedule Data" value={String(report.schedule.dataIncomplete)}/>
      </MetricGrid></Section>
      <Section eyebrow="Current obligations" title="Management Attention"><MetricGrid>
        <Metric label="Outstanding Obligations" value={String(report.attention.outstanding)}/><Metric label="Overdue Obligations" value={String(report.attention.overdue)}/><Metric label="Activities Affected" value={String(report.attention.activitiesAffected)}/>
      </MetricGrid>{report.attention.preview.length ? <div className="mt-4 space-y-2">{report.attention.preview.map(item=><div key={item.key} className="rounded-lg border border-slate-200 p-3 text-sm"><p className="font-semibold text-slate-900">{words(item.type)}</p><p className="mt-1 text-slate-600">{item.activityName} · {item.condition}</p><p className="mt-1 text-xs text-slate-500">{item.ownerDisplayName ?? "Unassigned"}{item.expectedNextAction ? ` · ${item.expectedNextAction}` : ""}</p></div>)}</div> : <Empty>No outstanding management attention.</Empty>}</Section>
    </div>

    <Section eyebrow="Cumulative observed outcomes" title="Quality & Acceptance"><MetricGrid>
      <RatioMetric label="Schedule Adherence" ratio={report.quality.scheduleAdherence} noun="eligible completed Activities"/><RatioMetric label="First-Pass Acceptance" ratio={report.quality.firstPassAcceptance} noun="reviewed Activities"/>
      <Metric label="Activities Requiring Correction" value={String(report.quality.activitiesRequiringCorrection)}/><Metric label="Current Changes Required" value={String(report.quality.currentChangesRequired)}/>
      <Metric label="Review Cycles" value={String(report.quality.reviewCycles)}/><RatioMetric label="Review Coverage" ratio={report.quality.reviewCoverage} noun="review-required Activities"/>
      <Metric label="Median Review Turnaround" value={report.quality.medianReviewTurnaroundHours === null ? "Not available" : `${report.quality.medianReviewTurnaroundHours} hours`}/>
    </MetricGrid></Section>

    <Section eyebrow="Periodized history" title="Recent Execution"><p className="mb-4 text-sm text-slate-600">{dateOnly(report.recentExecution.periodStart)} – {dateOnly(report.recentExecution.periodEnd)} · {report.recentExecution.timezone}</p><MetricGrid>
      <Metric label="Activities Completed" value={String(report.recentExecution.activitiesCompleted)}/><Metric label="Activities Accepted" value={String(report.recentExecution.activitiesAccepted)}/>
      <Metric label="Submissions" value={String(report.recentExecution.submissions)}/><Metric label="Changes Required Outcomes" value={String(report.recentExecution.changesRequiredOutcomes)}/>
      <Metric label="Measured Review Cycles" value={String(report.recentExecution.reviewCyclesMeasured)}/><Metric label="Median Review Turnaround" value={report.recentExecution.medianReviewTurnaroundHours === null ? "Not available" : `${report.recentExecution.medianReviewTurnaroundHours} hours`}/>
    </MetricGrid></Section>

    <div className="grid gap-6 xl:grid-cols-2">
      <Section eyebrow="Current constraints" title="Dependencies"><MetricGrid>
        <Metric label="Total Constraints" value={String(report.dependencies.totalConstraints)}/><Metric label="Unreleased Constraints" value={String(report.dependencies.unreleasedConstraints)}/>
        <Metric label="Activities Exposed" value={String(report.dependencies.downstreamActivitiesExposed)}/><Metric label="Overdue Successors with Unreleased Constraints" value={String(report.dependencies.overdueSuccessorsWithUnreleasedConstraints)}/>
        <Metric label="Late Predecessors" value={String(report.dependencies.latePredecessorActivities)}/><Metric label="Data Incomplete" value={String(report.dependencies.dataIncompleteConstraints)}/>
      </MetricGrid></Section>
      <Section eyebrow="Current exceptions" title="Exception Health"><MetricGrid>
        <Metric label="Open" value={String(report.exceptions.open)}/><Metric label="In Remediation" value={String(report.exceptions.inRemediation)}/><Metric label="Overdue" value={String(report.exceptions.overdue)}/><Metric label="High" value={String(report.exceptions.high)}/><Metric label="Critical" value={String(report.exceptions.critical)}/>
      </MetricGrid>{report.exceptions.preview.length ? <p className="mt-4 text-xs text-slate-500">Showing {report.exceptions.preview.length} Exception record{report.exceptions.preview.length === 1 ? "" : "s"}.</p> : <Empty>No Exceptions have been recorded for this Work Package.</Empty>}</Section>
    </div>

    <Section eyebrow="Work Package scope" title="Activity Summary">{report.activities.length ? <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-[1260px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Activity","Lifecycle Status","Planned Start","Planned Finish","Actual Start","Actual Finish","Schedule Classification","Owner","Supervisor","Review Status"].map(label=><th key={label} className="whitespace-nowrap px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{report.activities.map(activity=><tr key={activity.id}><td className="max-w-72 whitespace-normal px-3 py-3 font-semibold"><Link className="text-orange-700 hover:underline" href={`/workspace/admin/projects/${report.project.id}/activities/${activity.id}`}>{activity.name}</Link></td><Cell value={words(activity.status)}/><Cell value={dateTimeOrUnavailable(activity.plannedStartAt)}/><Cell value={dateTimeOrUnavailable(activity.plannedFinishAt)}/><Cell value={dateTimeOrUnavailable(activity.actualStartAt)}/><Cell value={dateTimeOrUnavailable(activity.actualFinishAt)}/><Cell value={words(activity.scheduleClassification)}/><Cell value={activity.ownerName ?? "Unassigned"}/><Cell value={activity.supervisorName ?? "Unassigned"}/><Cell value={words(activity.reviewStatus)}/></tr>)}</tbody></table></div> : <Empty>No active Activities are available for this Work Package.</Empty>}</Section>

    <Section eyebrow="Coverage and notes" title="Data Coverage"><MetricGrid>
      <Metric label="Work Plan" value={words(report.coverage.workPlan)}/><RatioMetric label="Schedule Coverage" ratio={report.coverage.schedule}/>
      <Metric label="Duration Coverage" value={`${report.coverage.duration.eligible} of ${report.coverage.duration.total} Activities · ${words(report.coverage.duration.state)}`}/>
      <RatioMetric label="Review Coverage" ratio={report.coverage.review}/><Metric label="Incomplete Dependency Records" value={String(report.coverage.dependencyDataIncomplete)}/><Metric label="Assignments Missing" value={String(report.coverage.assignmentsMissing)}/>
    </MetricGrid></Section>
  </article>;
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) { return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">{eyebrow}</p><h4 className="mt-1 mb-4 text-lg font-bold text-slate-950">{title}</h4>{children}</section>; }
function MetricGrid({ children }: { children: ReactNode }) { return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 break-words font-bold text-slate-950">{value}</p></div>; }
function RatioMetric({ label, ratio, noun = "eligible records" }: { label: string; ratio: WorkPackageReportRatio; noun?: string }) { return <Metric label={label} value={ratio.state === "unavailable" ? "Not available" : `${ratio.numerator} of ${ratio.denominator} ${noun} · ${Math.round((ratio.ratio ?? 0) * 100)}%`}/>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd></div>; }
function Empty({ children }: { children: ReactNode }) { return <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">{children}</p>; }
function Cell({ value }: { value: string }) { return <td className="px-3 py-3 align-top">{value}</td>; }
const numberOrUnavailable = (value: number | null) => value === null ? "Not available" : String(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
const dateOnly = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
const dateTimeOrUnavailable = (value: string | null) => value ? dateTime(value) : "Not available";
const words = (value: string) => value.replaceAll("_", " ").replace(/^./, character => character.toUpperCase());
const workPlanMessage = (state: Report["workPlan"]["state"]) => state === "ambiguous" ? "Multiple active Work Plans prevent an authoritative operational report." : state === "empty" ? "The active Work Plan has no Activities." : state === "invalid" ? "Work Plan measurements are unavailable because authoritative data is incomplete." : "No active Work Plan is available for this Work Package.";
