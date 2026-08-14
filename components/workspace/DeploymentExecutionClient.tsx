"use client";

import { useEffect, useState } from "react";
import { compressImage } from "@/lib/imageCompression";
import {
  buildQueuedSubmissionFormData,
  deleteQueuedSubmission,
  queueSubmission,
  readQueuedSubmissions,
  updateQueuedSubmission,
  type QueuedSubmissionRecord,
} from "@/lib/installerDrafts";
import type { getDeploymentAssignment } from "@/lib/workspace/deploymentExecution";

type Detail = NonNullable<Awaited<ReturnType<typeof getDeploymentAssignment>>>;

const legacyWorkspaceQueueKey = "deployiq-workspace-offline-submissions";

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`;
}

function workspaceEndpoint(assignmentId: string) {
  return `/api/workspace/installer/assignments/${assignmentId}/submit`;
}

function workspaceQueuedItems(items: QueuedSubmissionRecord[], assignmentId?: string) {
  return items.filter((item) => item.fields.submissionEndpoint?.startsWith("/api/workspace/installer") && (!assignmentId || item.fields.fieldAssignmentId === assignmentId));
}

export function DeploymentExecutionClient({ detail }: { detail: Detail }) {
  const [step, setStep] = useState<"arrival" | "evidence" | "validation" | "submit" | "success">("arrival");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [gpsStatus, setGpsStatus] = useState<"pending" | "captured" | "unavailable">("pending");
  const [beforePhotoReference, setBeforePhotoReference] = useState("");
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [additionalPhotoUrls, setAdditionalPhotoUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [queueCount, setQueueCount] = useState(0);

  async function refreshQueue() {
    setQueueCount(workspaceQueuedItems(await readQueuedSubmissions(), detail.assignment.id).length);
  }

  async function migrateLegacyWorkspaceQueue() {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(legacyWorkspaceQueueKey);
    if (!raw) return;
    try {
      const rows = JSON.parse(raw);
      if (!Array.isArray(rows) || rows.length === 0) {
        window.localStorage.removeItem(legacyWorkspaceQueueKey);
        return;
      }
      for (const row of rows) {
        const legacy = row as Record<string, unknown>;
        const id = typeof legacy.localSubmissionId === "string" ? legacy.localSubmissionId : uuid();
        const evidenceBlob = new Blob([String(legacy.afterPhotoUrl || legacy.beforePhotoUrl || "legacy workspace evidence reference")], { type: "text/plain" });
        await queueSubmission({
          id,
          image: evidenceBlob,
          fields: {
            submissionEndpoint: workspaceEndpoint(detail.assignment.id),
            installerUserId: detail.context.userId,
            installerName: detail.context.installerName ?? "Installer",
            installerEmail: detail.context.email,
            projectId: detail.assignment.projectId,
            projectName: detail.assignment.project,
            brandName: detail.assignment.campaign,
            installerState: detail.assignment.state || "Lagos",
            installerLga: "",
            selectedLocationId: detail.assignment.deploymentLocationId ?? undefined,
            selectedOutletName: detail.assignment.outlet,
            selectedOutletAddress: detail.assignment.address,
            resolvedAddress: detail.assignment.address,
            latitude: Number(legacy.arrivalLatitude) || null,
            longitude: Number(legacy.arrivalLongitude) || null,
            capturedAt: typeof legacy.capturedAt === "string" ? legacy.capturedAt : new Date().toISOString(),
            submitAnyway: false,
            workspaceId: detail.context.clientId,
            campaignId: detail.assignment.campaignId,
            campaignLocationId: detail.assignment.campaignLocationId,
            fieldAssignmentId: detail.assignment.id,
            agencyId: detail.assignment.assignedAgencyId,
            installerId: detail.context.installerId,
            beforePhotoReference: typeof legacy.beforePhotoUrl === "string" ? legacy.beforePhotoUrl : null,
            afterPhotoReference: typeof legacy.afterPhotoUrl === "string" ? legacy.afterPhotoUrl : null,
            notes: typeof legacy.notes === "string" ? legacy.notes : null,
          },
        });
      }
      window.localStorage.removeItem(legacyWorkspaceQueueKey);
    } catch {
      return;
    }
  }

  useEffect(() => {
    void migrateLegacyWorkspaceQueue().then(refreshQueue);
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
        setGpsStatus("captured");
      },
      () => setGpsStatus("unavailable"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    async function syncQueue() {
      if (!navigator.onLine) return;
      const rows = workspaceQueuedItems(await readQueuedSubmissions(), detail.assignment.id);
      if (rows.length === 0) return;
      for (const item of rows) {
        await updateQueuedSubmission(item.id, { status: "Syncing", attempts: item.attempts + 1, errorMessage: null });
        const response = await fetch(item.fields.submissionEndpoint || workspaceEndpoint(detail.assignment.id), {
          method: "POST",
          credentials: "include",
          body: buildQueuedSubmissionFormData(item),
        }).catch(() => null);
        if (response?.ok) {
          await deleteQueuedSubmission(item.id);
        } else {
          const body = await response?.json().catch(() => ({}));
          await updateQueuedSubmission(item.id, { status: "Failed", errorMessage: body?.error || "Sync failed. Please retry when your network is stable." });
        }
      }
      await refreshQueue();
      setMessage("Offline submissions synced.");
    }
    window.addEventListener("online", syncQueue);
    void syncQueue();
    return () => window.removeEventListener("online", syncQueue);
  }, []);

  const validation = [
    { label: "Location", passed: gpsStatus === "captured" },
    { label: "GPS", passed: gpsStatus === "captured" || gpsStatus === "unavailable" },
    { label: "Photo completeness", passed: Boolean(beforePhotoReference && afterPhoto) },
    { label: "Business rules", passed: Boolean(detail.assignment.campaignId && detail.assignment.projectId) },
  ];
  const canSubmit = validation.every((item) => item.passed);

  async function submit() {
    setBusy(true);
    setMessage("");
    if (!afterPhoto) {
      setMessage("Add photo evidence before submitting.");
      setBusy(false);
      return;
    }
    const compressed = await compressImage(afterPhoto);
    const fields = {
      submissionEndpoint: workspaceEndpoint(detail.assignment.id),
      installerUserId: detail.context.userId,
      installerName: detail.context.installerName ?? "Installer",
      installerEmail: detail.context.email,
      projectId: detail.assignment.projectId,
      projectName: detail.assignment.project,
      brandName: detail.assignment.campaign,
      installerState: detail.assignment.state || "Lagos",
      installerLga: "",
      selectedLocationId: detail.assignment.deploymentLocationId ?? undefined,
      selectedOutletName: detail.assignment.outlet,
      selectedOutletAddress: detail.assignment.address,
      resolvedAddress: detail.assignment.address,
      latitude: Number(latitude) || null,
      longitude: Number(longitude) || null,
      gpsStatus,
      capturedAt: new Date().toISOString(),
      submitAnyway: false,
      workspaceId: detail.context.clientId,
      campaignId: detail.assignment.campaignId,
      campaignLocationId: detail.assignment.campaignLocationId,
      fieldAssignmentId: detail.assignment.id,
      agencyId: detail.assignment.assignedAgencyId,
      installerId: detail.context.installerId,
      beforePhotoReference,
      afterPhotoReference: afterPhoto.name,
      notes,
    };
    if (!navigator.onLine) {
      await queueSubmission({ image: compressed, id: uuid(), fields });
      await refreshQueue();
      setMessage("Saved offline. This deployment will sync automatically when internet returns.");
      setStep("success");
      setBusy(false);
      return;
    }
    const formData = new FormData();
    formData.append("image", compressed);
    formData.append("localSubmissionId", uuid());
    formData.append("latitude", latitude);
    formData.append("longitude", longitude);
    formData.append("beforePhotoReference", beforePhotoReference);
    formData.append("afterPhotoReference", afterPhoto.name);
    formData.append("additionalPhotoUrls", additionalPhotoUrls);
    formData.append("notes", notes);
    const response = await fetch(workspaceEndpoint(detail.assignment.id), {
      method: "POST",
      credentials: "include",
      body: formData,
    }).catch(() => null);
    if (!response?.ok) {
      await queueSubmission({ image: compressed, id: uuid(), fields });
      await refreshQueue();
      setMessage("Saved offline. This deployment will sync automatically when internet returns.");
      setStep("success");
      setBusy(false);
      return;
    }
    const body = await response.json();
    setMessage(`Submitted for approval. GPS: ${body.gpsStatus}${body.gpsDistanceMeters === null ? "" : `, ${body.gpsDistanceMeters}m from expected location`}.`);
    setStep("success");
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      {message ? <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-900" role="status">{message}</p> : null}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap gap-2">
          {["arrival", "evidence", "validation", "submit"].map((item, index) => (
            <span key={item} className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest ${step === item ? "border-orange-300 bg-orange-50 text-orange-900" : "border-slate-200 bg-white text-slate-500"}`}>
              {index + 1}. {item}
            </span>
          ))}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold">Offline queue: {queueCount || "No offline submissions waiting to sync."}</span>
        </div>
      </section>

      {step === "arrival" ? (
        <Panel title="Arrival">
          <Info label="GPS validation" value={gpsStatus === "captured" ? "Captured" : gpsStatus === "unavailable" ? "Unavailable" : "Getting location"} />
          <Info label="Expected coordinates" value={detail.assignment.coordinates.latitude === null ? "Not available" : `${detail.assignment.coordinates.latitude}, ${detail.assignment.coordinates.longitude}`} />
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Latitude<input className="workspace-search-input" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Longitude<input className="workspace-search-input" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label>
          <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white" onClick={() => setStep("evidence")}>Start Deployment</button>
        </Panel>
      ) : null}

      {step === "evidence" ? (
        <Panel title="Evidence Capture">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Before Photo Reference<input className="workspace-search-input" value={beforePhotoReference} onChange={(event) => setBeforePhotoReference(event.target.value)} placeholder="Before-photo evidence reference" /></label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">After Photo<input className="workspace-search-input" type="file" accept="image/*" onChange={(event) => setAfterPhoto(event.target.files?.[0] ?? null)} /></label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Additional Evidence<input className="workspace-search-input" value={additionalPhotoUrls} onChange={(event) => setAdditionalPhotoUrls(event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500 md:col-span-2">Notes<textarea className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm normal-case tracking-normal" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button type="button" className="workspace-button-secondary" onClick={() => setStep("arrival")}>Back</button>
          <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white" onClick={() => setStep("validation")}>Validate</button>
        </Panel>
      ) : null}

      {step === "validation" ? (
        <Panel title="Validation">
          {validation.map((item) => (
            <div key={item.label} className={`rounded-lg border p-3 text-sm font-semibold ${item.passed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              {item.label}: {item.passed ? "Passed" : "Needs attention"}
            </div>
          ))}
          <button type="button" className="workspace-button-secondary" onClick={() => setStep("evidence")}>Back</button>
          <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-60" onClick={() => setStep("submit")} disabled={!canSubmit}>Continue</button>
        </Panel>
      ) : null}

      {step === "submit" ? (
        <Panel title="Submit">
          <Info label="Campaign" value={detail.assignment.campaign} />
          <Info label="Outlet" value={detail.assignment.outlet} />
          <Info label="GPS" value={gpsStatus === "captured" ? "Ready for verification" : "Unavailable"} />
          <Info label="Photo evidence" value="Before and after evidence attached" />
          <button type="button" className="workspace-button-secondary" onClick={() => setStep("validation")}>Back</button>
          <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-60" onClick={submit} disabled={busy}>Submit for Approval</button>
        </Panel>
      ) : null}

      {step === "success" ? (
        <Panel title="Success">
          <p className="text-sm text-slate-600">Deployment evidence has been saved. Your manager will review the submission.</p>
          <a href="/workspace/installer" className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white">Back to My Assignments</a>
        </Panel>
      ) : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-bold">{title}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
