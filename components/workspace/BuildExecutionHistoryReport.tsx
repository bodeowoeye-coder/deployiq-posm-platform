import Link from "next/link";
import type { ReactNode } from "react";
import type { CanonicalBuildProject } from "@/lib/build/projects/types";
import type { BuildExecutionHistoryReport as Report, ExecutionHistoryQueryResult } from "@/lib/build/reporting/executionHistoryReport";

type WorkPackageScope = { id: string; name: string; siteName: string };

export function BuildExecutionHistoryReport({ report, project, workPackage, query }: { report?: Report; project: CanonicalBuildProject; workPackage?: WorkPackageScope; query: ExecutionHistoryQueryResult }) {
  const currentHref = `/workspace/admin/projects/${project.id}/reports${workPackage ? `?workPackage=${workPackage.id}` : ""}`;
  const cadence = query.state === "invalid" ? "daily" : query.cadence;
  return <article className="min-w-0 space-y-6" aria-labelledby="build-execution-history-title">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ Build</p>
      <h3 id="build-execution-history-title" className="mt-2 text-2xl font-bold text-slate-950">Execution History Report</h3>
      <p className="mt-1 text-lg font-semibold text-slate-800">{project.project_name}</p>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Project Code" value={project.project_code ?? "Not set"}/><Fact label="Scope" value={workPackage ? "Work Package" : "Project"}/>
        {workPackage ? <><Fact label="Site" value={workPackage.siteName}/><Fact label="Work Package" value={workPackage.name}/></> : null}
        {report ? <><Fact label="Generated At" value={dateTime(report.timing.generatedAt)}/><Fact label="Reporting Period" value={`${dateOnly(report.timing.period.periodStart)} – ${dateOnlyInclusive(report.timing.period.periodEnd)}`}/><Fact label="Timezone" value="UTC"/><Fact label="Cadence" value={words(report.timing.period.cadence)}/></> : <Fact label="Timezone" value="UTC"/>}
      </div>
      <div className="mt-4 flex flex-wrap gap-4"><Link className="inline-flex text-sm font-semibold text-orange-700 hover:underline" href={currentHref}>Back to Current Report</Link>{report ? <a className="inline-flex text-sm font-semibold text-orange-700 hover:underline" href={historyPdfHref(report)} download>Download PDF</a> : null}</div>
    </section>

    <Section eyebrow="Report definition" title="Report Scope & Period">
      <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="view" value="history"/>{workPackage ? <input type="hidden" name="workPackage" value={workPackage.id}/> : null}
        <Field label="From"><input className={control} type="date" name="from" required defaultValue={query.state === "ready" ? query.from : ""}/></Field>
        <Field label="Through"><input className={control} type="date" name="through" required defaultValue={query.state === "ready" ? query.through : ""}/></Field>
        <Field label="Cadence"><select className={control} name="cadence" defaultValue={cadence}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></Field>
        <Field label="Timezone"><input className={control} name="timezone" value="UTC" readOnly/></Field>
        <div className="flex items-end"><button className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700" type="submit">Apply</button></div>
      </form>
      <p className="mt-4 text-xs text-slate-500">From and Through are inclusive calendar dates in UTC. Internally, the report uses an exclusive boundary at 00:00 UTC on the day after Through.</p>
      {!report ? <Empty>Select an explicit From and Through date to generate execution history.</Empty> : null}
    </Section>

    {report ? <>
      <Section eyebrow="Observed period facts" title="Period Summary"><MetricGrid>{summaryMetrics(report).map(([label,value])=><Metric key={label} label={label} value={value}/>)}</MetricGrid>{allZero(report) ? <Empty>No execution activity was observed in this reporting period.</Empty> : null}</Section>
      <Section eyebrow="Review outcomes" title="Review & Correction History"><MetricGrid>{report.scope.kind === "project" ? <><Metric label="Review Cycles" value={available(report.review.cyclesTotal)}/><Metric label="Measured Review Cycles" value={String(report.review.cyclesMeasured)}/><Metric label="Unmeasurable Review Cycles" value={available(report.review.cyclesUnmeasurable)}/><Metric label="Average Review Turnaround" value={hours(report.review.averageHours)}/><Metric label="Median Review Turnaround" value={hours(report.review.medianHours)}/><Metric label="Minimum Review Turnaround" value={hours(report.review.minHours)}/><Metric label="Maximum Review Turnaround" value={hours(report.review.maxHours)}/></> : <><Metric label="Measured Review Cycles" value={String(report.review.cyclesMeasured)}/><Metric label="Median Review Turnaround" value={hours(report.review.medianHours)}/></>}</MetricGrid></Section>
      {report.scope.kind === "project" ? <Section eyebrow={`${words(report.timing.period.cadence)} factual buckets`} title="Execution Timeline"><Scrollable><table className="min-w-[1120px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Period","Started","Completed","Accepted","Submissions","Resubmissions","Changes Required","Corrective Cycles","Blocked","Resumed"].map(label=><th className="whitespace-nowrap px-3 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{report.buckets.map(bucket=><tr key={bucket.bucketStart}><Cell value={bucket.label}/><Cell value={bucket.activitiesStarted}/><Cell value={bucket.operationalCompletions}/><Cell value={bucket.acceptedActivities}/><Cell value={bucket.submissions}/><Cell value={bucket.resubmissions}/><Cell value={bucket.changesRequiredOutcomes}/><Cell value={bucket.correctiveCycles}/><Cell value={bucket.blockedEvents}/><Cell value={bucket.resumedEvents}/></tr>)}</tbody></table></Scrollable></Section> : null}
      {report.scope.kind === "project" ? <Section eyebrow="Historical ancestry" title="Work Package Breakdown">{report.workPackages.length ? <Scrollable><table className="min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Work Package","Completed","Accepted","Submissions","Changes Required","Measured Reviews","Median Review Turnaround"].map(label=><th className="whitespace-nowrap px-3 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{report.workPackages.map(row=><tr key={row.id}><Cell value={row.name}/><Cell value={row.operationalCompletions}/><Cell value={row.acceptedActivities}/><Cell value={row.submissions}/><Cell value={row.changesRequiredOutcomes}/><Cell value={row.reviewCyclesMeasured}/><Cell value={hours(row.medianReviewTurnaroundHours)}/></tr>)}</tbody></table></Scrollable> : <Empty>No Work Package history was observed in this reporting period.</Empty>}</Section> : null}
      <Section eyebrow="Measurement boundaries" title="Data Coverage"><MetricGrid><Metric label="History Data" value={words(report.coverage.dataQuality)}/>{report.coverage.reviewCyclesTotal === null ? <Metric label="Measured Review Cycles" value={String(report.coverage.reviewCyclesMeasured)}/> : <Metric label="Review Turnaround Coverage" value={`${report.coverage.reviewCyclesMeasured} of ${report.coverage.reviewCyclesTotal} cycles measured`}/>}<Metric label="Archived Work Packages" value={String(report.coverage.archivedWorkPackages)}/></MetricGrid></Section>
    </> : null}
  </article>;
}

const summaryMetrics=(report:Report):Array<[string,string]>=>report.scope.kind === "work_package" ? [["Activities Completed",String(report.summary.activitiesCompleted)],["Activities Accepted",String(report.summary.activitiesAccepted)],["Submissions",String(report.summary.submissions)],["Changes Required Outcomes",String(report.summary.changesRequiredOutcomes)]] : [["Activities Started",available(report.summary.activitiesStarted)],["Activities Completed",String(report.summary.activitiesCompleted)],["Activities Accepted",String(report.summary.activitiesAccepted)],["Submissions",String(report.summary.submissions)],["Initial Submissions",available(report.summary.initialSubmissions)],["Resubmissions",available(report.summary.resubmissions)],["Changes Required Outcomes",String(report.summary.changesRequiredOutcomes)],["Activities Requiring Correction",available(report.summary.activitiesRequiringCorrection)],["Corrective Cycles",available(report.summary.correctiveCycles)],["Blocked Events",available(report.summary.blockedEvents)],["Resumed Events",available(report.summary.resumedEvents)]];
const allZero=(report:Report)=>[report.summary.activitiesCompleted,report.summary.activitiesAccepted,report.summary.submissions,report.summary.changesRequiredOutcomes,...[report.summary.activitiesStarted,report.summary.initialSubmissions,report.summary.resubmissions,report.summary.activitiesRequiringCorrection,report.summary.correctiveCycles,report.summary.blockedEvents,report.summary.resumedEvents].filter((value):value is number=>value!==null)].every(value=>value===0);
function Section({eyebrow,title,children}:{eyebrow:string;title:string;children:ReactNode}){return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">{eyebrow}</p><h4 className="mt-1 mb-4 text-lg font-bold text-slate-950">{title}</h4>{children}</section>}
function MetricGrid({children}:{children:ReactNode}){return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>}
function Metric({label,value}:{label:string;value:string}){return <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 break-words font-bold text-slate-950">{value}</p></div>}
function Fact({label,value}:{label:string;value:string}){return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd></div>}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="text-sm font-semibold text-slate-700"><span className="mb-1 block">{label}</span>{children}</label>}
function Empty({children}:{children:ReactNode}){return <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">{children}</p>}
function Scrollable({children}:{children:ReactNode}){return <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200">{children}</div>}
function Cell({value}:{value:string|number}){return <td className="whitespace-nowrap px-3 py-3">{value}</td>}
const control="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const available=(value:number|null)=>value===null?"Not available":String(value);
const hours=(value:number|null)=>value===null?"Not available":`${value} hours`;
const dateTime=(value:string)=>new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(new Date(value));
const dateOnly=(value:string)=>new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(value));
const dateOnlyInclusive=(periodEnd:string)=>dateOnly(new Date(new Date(periodEnd).getTime()-86_400_000).toISOString());
const words=(value:string)=>value.replaceAll("_"," ").replace(/^./,character=>character.toUpperCase());
const historyPdfHref=(report:Report)=>{const p=new URLSearchParams({type:report.scope.kind==="project"?"project_history":"work_package_history",projectId:report.project.id,from:report.timing.period.from,through:report.timing.period.through,cadence:report.timing.period.cadence,timezone:report.timing.period.timezone});if(report.scope.workPackageId)p.set("workPackageId",report.scope.workPackageId);return `/api/workspace/build/reports/pdf?${p.toString()}`};
