import type { ReactNode } from "react";
import type { BuildManagementReport as Report } from "@/lib/build/reporting/managementReport";

export function BuildManagementReport({ report }: { report: Report }) {
  const m = report.status;
  return <article className="min-w-0 space-y-6" aria-labelledby="build-management-report-title">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ Build</p>
      <h3 id="build-management-report-title" className="mt-2 text-2xl font-bold text-slate-950">{report.report.title}</h3>
      <p className="mt-1 text-lg font-semibold text-slate-800">{report.project.name}</p>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Project Code" value={report.project.code ?? "Not set"}/><Fact label="Project Type" value={report.project.type}/>
        <Fact label="Project Status" value={report.project.status || "Not set"}/><Fact label="Client Reference" value={report.project.clientReference ?? "Not set"}/>
        <Fact label="Generated At" value={dateTime(report.timing.generatedAt)}/><Fact label="As Of" value={dateTime(report.timing.asOf)}/>
        <Fact label="Recent Execution Period" value={`${dateOnly(report.timing.recentExecution.periodStart)} – ${dateOnly(report.timing.recentExecution.periodEnd)}`}/>
        <Fact label="Timezone" value={report.timing.recentExecution.timezone}/>
      </div><p className="mt-4 text-xs text-slate-500">{report.timing.currentStateNotice}</p>
    </section>

    <Section eyebrow="Current state" title="Project Status Summary"><MetricGrid>{[
      ["Activities Completed",m.activitiesCompleted],["Activities Accepted",m.activitiesAccepted],["Expected Complete",m.activitiesExpectedComplete],
      ["Current Overdue",m.currentOverdue],["Management Attention",m.managementAttention],["Open Exceptions",m.openExceptions],
    ].map(([label,value])=><Metric key={label} label={String(label)} value={numberOrUnavailable(value as number|null)}/>)}</MetricGrid></Section>

    <Section eyebrow="Current planned position" title="Progress & Planned Position">
      <MetricGrid><Metric label="Operational Completion Shortfall" value={numberOrUnavailable(report.progress.operationalShortfall)}/><Metric label="Accepted Completion Shortfall" value={numberOrUnavailable(report.progress.acceptedShortfall)}/>
        <RatioMetric label="Planned-duration Share Expected Complete" ratio={report.progress.durationExpected}/><RatioMetric label="Planned-duration Share Completed" ratio={report.progress.durationCompleted}/><RatioMetric label="Planned-duration Share Accepted" ratio={report.progress.durationAccepted}/>
        <Metric label="Duration Coverage" value={`${report.progress.durationCoverage.eligible} of ${report.progress.durationCoverage.total} Activities · ${words(report.progress.durationCoverage.state)}`}/></MetricGrid>
    </Section>

    <div className="grid gap-6 xl:grid-cols-2">
      <Section eyebrow="Current schedule" title="Schedule Performance"><MetricGrid>{[
        ["Scheduled Activities",report.schedule.scheduled],["Currently Overdue",report.schedule.currentlyOverdue],["Completed On Time",report.schedule.completedOnTime],["Completed Late",report.schedule.completedLate],
      ].map(([label,value])=><Metric key={label} label={String(label)} value={String(value)}/>)}</MetricGrid>{report.schedule.dataIncomplete ? <Note>{report.schedule.dataIncomplete} schedule record(s) have incomplete data.</Note>:null}</Section>
      <Section eyebrow="Current obligations" title="Management Attention"><MetricGrid><Metric label="Outstanding Obligations" value={String(report.attention.summary.outstandingObligations)}/><Metric label="Overdue Obligations" value={String(report.attention.summary.overdueObligations)}/><Metric label="Activities Affected" value={String(report.attention.summary.activitiesAffected)}/><Metric label="Work Packages Affected" value={String(report.attention.summary.workPackagesAffected)}/></MetricGrid>
        {report.attention.preview.length ? <div className="mt-4 space-y-2">{report.attention.preview.map(item=><div key={item.key} className="rounded-lg border border-slate-200 p-3 text-sm"><p className="font-semibold text-slate-900">{words(item.type)}</p><p className="mt-1 text-slate-600">{item.condition}</p><p className="mt-1 text-xs text-slate-500">{item.ownerDisplayName ?? "Unassigned"}{item.expectedNextAction ? ` · ${item.expectedNextAction}`:""}</p></div>)}</div>:<Empty>No outstanding management attention.</Empty>}
      </Section>
    </div>

    <Section eyebrow="Cumulative observed outcomes" title="Quality & Acceptance"><MetricGrid><RatioMetric label="Schedule Adherence" ratio={report.quality.scheduleAdherence} noun="eligible completed Activities"/><RatioMetric label="First-Pass Acceptance" ratio={report.quality.firstPassAcceptance} noun="reviewed Activities"/><Metric label="Activities Requiring Correction" value={String(report.quality.activitiesRequiringCorrection)}/><Metric label="Current Changes Required" value={String(report.quality.currentChangesRequired)}/><RatioMetric label="Review Coverage" ratio={report.quality.reviewCoverage} noun="review-required Activities"/><Metric label="Median Review Turnaround" value={report.quality.medianReviewTurnaroundHours===null?"Not available":`${report.quality.medianReviewTurnaroundHours} hours`}/></MetricGrid></Section>

    <Section eyebrow="Periodized history" title="Recent Execution"><p className="mb-4 text-sm text-slate-600">{dateOnly(report.recentExecution.periodStart)} – {dateOnly(report.recentExecution.periodEnd)} · {report.recentExecution.timezone}</p><MetricGrid>{[
      ["Activities Started",report.recentExecution.counts.activitiesStarted],["Activities Completed",report.recentExecution.counts.operationalCompletions],["Activities Accepted",report.recentExecution.counts.acceptedActivities],["Submissions",report.recentExecution.counts.submissions],["Changes Required Outcomes",report.recentExecution.counts.changesRequiredOutcomes],
    ].map(([label,value])=><Metric key={label} label={String(label)} value={String(value)}/>)}</MetricGrid></Section>

    <div className="grid gap-6 xl:grid-cols-2"><Section eyebrow="Current constraints" title="Dependencies"><MetricGrid>{[["Total Constraints",report.dependencies.totalConstraints],["Unreleased Constraints",report.dependencies.unreleasedConstraints],["Activities Exposed",report.dependencies.downstreamActivitiesExposed],["Overdue Successors with Unreleased Constraints",report.dependencies.overdueSuccessorsWithUnreleasedConstraints],["Late Predecessors",report.dependencies.latePredecessorActivities],["Data Incomplete",report.dependencies.dataIncompleteConstraints]].map(([label,value])=><Metric key={label} label={String(label)} value={String(value)}/>)}</MetricGrid></Section>
      <Section eyebrow="Current exceptions" title="Exception Health"><MetricGrid><Metric label="Open / In Remediation" value={String(report.exceptions.counts.active)}/><Metric label="Overdue" value={String(report.exceptions.counts.overdue)}/><Metric label="High" value={String(report.exceptions.counts.high)}/><Metric label="Critical" value={String(report.exceptions.counts.critical)}/></MetricGrid>{report.exceptions.preview.length?<p className="mt-4 text-xs text-slate-500">Showing {report.exceptions.preview.length} of {report.exceptions.counts.total} recorded Exceptions.</p>:<Empty>No Exceptions have been recorded.</Empty>}</Section></div>

    <Section eyebrow="Project scope" title="Work Package Summary">{report.workPackages.length?<div className="max-w-full overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Work Package","Site","Completed","Expected Complete","Current Overdue","Management Attention","Schedule Adherence","First-Pass Acceptance","Data / Coverage"].map(x=><th key={x} className="whitespace-nowrap px-3 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{report.workPackages.map(w=><tr key={w.id}><td className="max-w-64 whitespace-normal px-3 py-3 font-semibold">{w.name}</td><td className="px-3 py-3">{w.siteName}</td><td className="px-3 py-3">{numberOrUnavailable(w.completed)}</td><td className="px-3 py-3">{numberOrUnavailable(w.expectedComplete)}</td><td className="px-3 py-3">{w.currentOverdue}</td><td className="px-3 py-3">{w.managementAttention}</td><td className="px-3 py-3"><RatioInline ratio={w.scheduleAdherence}/></td><td className="px-3 py-3"><RatioInline ratio={w.firstPassAcceptance}/></td><td className="px-3 py-3">{words(w.dataQuality)}</td></tr>)}</tbody></table></div>:<Empty>No active Work Packages.</Empty>}</Section>

    <Section eyebrow="Coverage and notes" title="Data Coverage"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><RatioMetric label="Schedule Coverage" ratio={report.coverage.schedule}/><RatioMetric label="Review Coverage" ratio={report.coverage.review}/><Metric label="Progress Data" value={words(report.coverage.progress)}/><Metric label="Work Packages Without Work Plan" value={String(report.coverage.workPackagesWithoutPlan)}/><Metric label="Multiple Active Work Plans" value={String(report.coverage.workPackagesWithMultiplePlans)}/><Metric label="Incomplete Measurements" value={String(report.coverage.workPackagesWithIncompleteMeasurement)}/><Metric label="Incomplete Dependency Records" value={String(report.coverage.dependencyDataIncomplete)}/><Metric label="Assignments Missing" value={String(report.coverage.assignmentsMissing)}/></div></Section>
  </article>;
}

function Section({eyebrow,title,children}:{eyebrow:string;title:string;children:ReactNode}){return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">{eyebrow}</p><h4 className="mt-1 mb-4 text-lg font-bold text-slate-950">{title}</h4>{children}</section>}
function MetricGrid({children}:{children:ReactNode}){return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>}
function Metric({label,value}:{label:string;value:string}){return <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 break-words font-bold text-slate-950">{value}</p></div>}
function RatioMetric({label,ratio,noun="eligible records"}:{label:string;ratio:Report["quality"]["scheduleAdherence"];noun?:string}){return <Metric label={label} value={ratio.state==="unavailable"?"Not available":`${ratio.numerator} of ${ratio.denominator} ${noun} · ${Math.round((ratio.ratio??0)*100)}%`}/>}
function RatioInline({ratio}:{ratio:Report["quality"]["scheduleAdherence"]}){return <span className="whitespace-nowrap">{ratio.state==="unavailable"?"Not available":`${ratio.numerator}/${ratio.denominator} · ${Math.round((ratio.ratio??0)*100)}%`}</span>}
function Fact({label,value}:{label:string;value:string}){return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd></div>}
function Note({children}:{children:ReactNode}){return <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{children}</p>}
function Empty({children}:{children:ReactNode}){return <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">{children}</p>}
const numberOrUnavailable=(value:number|null)=>value===null?"Not available":String(value);
const dateTime=(value:string)=>new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(new Date(value));
const dateOnly=(value:string)=>new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(value));
const words=(value:string)=>value.replaceAll("_"," ").replace(/^./,x=>x.toUpperCase());
