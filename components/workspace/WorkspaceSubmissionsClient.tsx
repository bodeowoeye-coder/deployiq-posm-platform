"use client";

import { useMemo, useState } from "react";
import type React from "react";
import { SUBMISSION_REJECTION_REASONS } from "@/lib/submissionRejection";
import type { getWorkspaceDeploymentSubmissions } from "@/lib/workspace/deploymentExecution";

type Dashboard = Awaited<ReturnType<typeof getWorkspaceDeploymentSubmissions>>;
type Submission = Dashboard["submissions"][number];
type ReviewAction = "approve" | "reject" | "request_correction";

const STATUS_FILTERS = ["All", "Pending", "Flagged", "Correction Requested", "Approved", "Rejected"] as const;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function statusClass(status: string) {
  if (status === "Approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Rejected" || status === "Correction Requested") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "Flagged") return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-slate-200 bg-white text-slate-700";
}

function dateValue(value: unknown) {
  const raw = text(value);
  return raw ? raw.slice(0, 10) : "Not available";
}

export function WorkspaceSubmissionsClient({ dashboard }: { dashboard: Dashboard }) {
  const [submissions, setSubmissions] = useState(dashboard.submissions);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [project, setProject] = useState("");
  const [installer, setInstaller] = useState("");
  const [state, setState] = useState("");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [review, setReview] = useState<{ submission: Submission; action: ReviewAction } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [comments, setComments] = useState("");
  const [correctionNotes, setCorrectionNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const hasQueryFailure = "queryStatus" in dashboard && dashboard.queryStatus === "error";
  const pending = submissions.filter((item) => ["Pending", "Flagged"].includes(text(item.status)));
  const filtered = useMemo(() => submissions.filter((item) => {
    if (status !== "All" && text(item.status) !== status) return false;
    if (project && !text(item.project_name).toLowerCase().includes(project.toLowerCase())) return false;
    if (installer && !text(item.installer_name).toLowerCase().includes(installer.toLowerCase())) return false;
    if (state && !text(item.location_state).toLowerCase().includes(state.toLowerCase())) return false;
    if (date && !text(item.submitted_at).startsWith(date)) return false;
    return true;
  }), [submissions, status, project, installer, state, date]);

  function openReview(submission: Submission, action: ReviewAction) {
    setReview({ submission, action });
    setSelected(submission);
    setRejectionReason("");
    setComments("");
    setCorrectionNotes("");
    setMessage("");
  }

  async function submitReview() {
    if (!review) return;
    if (review.action === "reject" && !rejectionReason) {
      setMessage("Select a rejection reason.");
      return;
    }
    if (review.action === "reject" && rejectionReason === "Other" && !comments.trim()) {
      setMessage("Add explanatory comments for Other.");
      return;
    }
    if (review.action === "request_correction" && !correctionNotes.trim()) {
      setMessage("Add correction instructions.");
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/workspace/deployment-submissions/${text(review.submission.id)}/review`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: review.action,
        rejectionReason,
        correctionNotes,
        approvalComments: comments,
      }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok) {
      setMessage(body?.error || "Review action could not be saved.");
      setBusy(false);
      return;
    }
    const next = body.submission as Submission;
    setSubmissions((items) => items.map((item) => text(item.id) === text(next.id) ? { ...item, ...next, location_state: item.location_state } : item));
    setSelected((current) => current && text(current.id) === text(next.id) ? { ...current, ...next, location_state: current.location_state } : current);
    setReview(null);
    setMessage("Review action saved.");
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-6" aria-label="Submission summary">
        <Metric label="Completed" value={hasQueryFailure ? "Unavailable" : String(dashboard.performance.completed)} />
        <Metric label="Pending" value={hasQueryFailure ? "Unavailable" : String(dashboard.performance.pending)} />
        <Metric label="Rejected" value={hasQueryFailure ? "Unavailable" : String(dashboard.performance.rejected)} />
        <Metric label="Approval %" value={hasQueryFailure ? "Unavailable" : `${dashboard.performance.approvalPercent}%`} />
        <Metric label="GPS %" value={hasQueryFailure ? "Unavailable" : `${dashboard.performance.gpsPercent}%`} />
        <Metric label="Awaiting Approval" value={hasQueryFailure ? "Unavailable" : String(pending.length)} />
      </section>

      {"loadError" in dashboard && dashboard.loadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900" role="status">
          {dashboard.loadError}
        </div>
      ) : null}
      {message ? <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-900" role="status">{message}</p> : null}

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[1.2fr_repeat(4,1fr)]">
        <Field label="Status"><select className="workspace-search-input" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{STATUS_FILTERS.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
        <Field label="Project"><input className="workspace-search-input" value={project} onChange={(event) => setProject(event.target.value)} /></Field>
        <Field label="Installer"><input className="workspace-search-input" value={installer} onChange={(event) => setInstaller(event.target.value)} /></Field>
        <Field label="State"><input className="workspace-search-input" value={state} onChange={(event) => setState(event.target.value)} /></Field>
        <Field label="Date"><input className="workspace-search-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-bold">No submissions match this view.</h3>
            <p className="mt-2 text-sm text-slate-600">{submissions.length === 0 ? "Completed installer submissions will appear here for review." : "Adjust the filters to review more submissions."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>{["Evidence", "Outlet", "Project", "Installer", "State", "GPS", "Status", "Submitted", "Review"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => (
                  <tr key={text(item.id)} className="align-top">
                    <td className="px-4 py-3">{text(item.image_url) ? <img src={text(item.image_url)} alt="" className="h-14 w-14 rounded object-cover" /> : <span className="text-xs text-slate-500">No image</span>}</td>
                    <td className="px-4 py-3 font-bold">{text(item.selected_outlet_name) || "Deployment location"}<span className="block text-xs text-slate-500">{text(item.selected_outlet_address)}</span></td>
                    <td className="px-4 py-3">{text(item.project_name) || "Project"}<span className="block text-xs text-slate-500">{text(item.brand_name) || "Brand not set"}</span></td>
                    <td className="px-4 py-3">{text(item.installer_name) || "Installer"}</td>
                    <td className="px-4 py-3">{text(item.location_state) || "Unknown"}</td>
                    <td className="px-4 py-3">{text(item.gps_status) || "Unavailable"}{item.gps_distance_meters ? ` (${item.gps_distance_meters}m)` : ""}</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusClass(text(item.status))}`}>{text(item.status)}</span></td>
                    <td className="px-4 py-3">{dateValue(item.submitted_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="font-bold text-slate-700" onClick={() => setSelected(item)}>Open</button>
                        {["Pending", "Flagged", "Correction Requested"].includes(text(item.status)) ? (
                          <>
                            <button type="button" className="font-bold text-emerald-700" onClick={() => openReview(item, "approve")}>Approve</button>
                            <button type="button" className="font-bold text-orange-700" onClick={() => openReview(item, "request_correction")}>Correct</button>
                            <button type="button" className="font-bold text-rose-700" onClick={() => openReview(item, "reject")}>Reject</button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <div className="mx-auto max-w-3xl rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Submission Review</p>
                <h3 className="mt-1 text-xl font-bold">{text(selected.selected_outlet_name) || "Deployment location"}</h3>
                <p className="mt-1 text-sm text-slate-600">{text(selected.project_name) || "Project"} | {text(selected.installer_name) || "Installer"} | {dateValue(selected.submitted_at)}</p>
              </div>
              <button type="button" className="font-bold text-slate-500" onClick={() => { setSelected(null); setReview(null); }}>Close</button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
              {text(selected.image_url) ? <img src={text(selected.image_url)} alt="Submission evidence" className="h-56 w-full rounded-lg object-cover" /> : <div className="flex h-56 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">No evidence image</div>}
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Info label="Brand" value={text(selected.brand_name) || "Not set"} />
                <Info label="State" value={text(selected.location_state) || "Unknown"} />
                <Info label="GPS" value={`${text(selected.gps_status) || "Unavailable"}${selected.gps_distance_meters ? ` (${selected.gps_distance_meters}m)` : ""}`} />
                <Info label="Status" value={text(selected.status)} />
                <Info label="Rejection Reason" value={text(selected.rejection_reason) || "None"} />
                <Info label="Correction Required" value={text(selected.correction_notes) || "None"} />
                <Info label="Reviewer Comment" value={text(selected.approval_comments) || "None"} />
                <Info label="Reviewed" value={text(selected.reviewed_at) ? dateValue(selected.reviewed_at) : "Not reviewed"} />
              </dl>
            </div>

            {review ? (
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold">{review.action === "approve" ? "Approve Submission" : review.action === "reject" ? "Reject Submission" : "Request Correction"}</p>
                {review.action === "reject" ? (
                  <div className="mt-3 grid gap-3">
                    <Field label="Rejection Reason"><select className="workspace-search-input" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)}><option value="">Select reason</option>{SUBMISSION_REJECTION_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></Field>
                    <Field label="Comments"><textarea className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={comments} onChange={(event) => setComments(event.target.value)} /></Field>
                  </div>
                ) : null}
                {review.action === "request_correction" ? (
                  <div className="mt-3"><Field label="Correction Required"><textarea className="min-h-28 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={correctionNotes} onChange={(event) => setCorrectionNotes(event.target.value)} /></Field></div>
                ) : null}
                {review.action === "approve" ? (
                  <div className="mt-3"><Field label="Approval Comment"><textarea className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={comments} onChange={(event) => setComments(event.target.value)} /></Field></div>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold" onClick={() => setReview(null)}>Cancel</button>
                  <button type="button" className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={busy} onClick={submitReview}>{busy ? "Saving..." : "Save Review"}</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{label}{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}
