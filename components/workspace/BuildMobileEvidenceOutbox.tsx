"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/imageCompression";
import {
  BuildOutboxUnavailableError, cleanupBuildEvidenceOutbox, createBuildEvidenceOperationId, deleteBuildEvidenceOutbox,
  listBuildEvidenceOutbox, queueBuildEvidence, updateBuildEvidenceOutbox, withBuildEvidenceSyncLock,
  type BuildEvidenceLocation, type BuildEvidenceOutboxItem,
} from "@/lib/build/mobile/evidenceOutbox";

type Identity = { userId: string; clientId: string };
type Scope = { projectId: string; siteId: string; workPackageId: string; activityId?: string };

function boundedFailure(status: number, body: any) {
  const code = typeof body?.code === "string" ? body.code : status === 401 ? "authentication_required" : status === 403 ? "forbidden" : status === 404 ? "not_found" : status === 409 ? "state_changed" : status >= 500 ? "retryable_failure" : "validation_failed";
  return { code, message: typeof body?.error === "string" ? body.error : "Evidence synchronization could not be completed.", retryable: status >= 500 || status === 408 || status === 429 };
}

export async function synchronizeBuildEvidenceItem(item: BuildEvidenceOutboxItem) {
  await updateBuildEvidenceOutbox(item.id, { status: "synchronizing", attempts: item.attempts + 1, lastErrorCode: null, lastErrorMessage: null });
  const endpoint = `/api/build/runtime-activities/${encodeURIComponent(item.activityId)}/evidence`;
  const common = { projectId: item.projectId, siteId: item.siteId, workPackageId: item.workPackageId, checklistItemId: item.checklistItemId, exceptionId: item.exceptionId, operationId: item.id };
  let authorizationId = item.authorizationId;
  if (authorizationId) {
    const finalize = await fetch(endpoint, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...common, action: "finalize", authorizationId, evidenceType: item.evidenceType, description: item.description,
      deviceCapturedAt: item.deviceCapturedAt, deviceTimezoneOffsetMinutes: item.deviceTimezoneOffsetMinutes, latitude: item.location.latitude, longitude: item.location.longitude,
      gpsAccuracyMetres: item.location.accuracyMetres, gpsCapturedAt: item.location.capturedAt, gpsSource: item.location.source, locationStatus: item.location.permissionStatus }) });
    const body = await finalize.json().catch(() => null);
    if (finalize.ok) { await updateBuildEvidenceOutbox(item.id, { status: "synchronized", serverEvidenceId: body.id }); return "synchronized" as const; }
    if (![400, 404, 409].includes(finalize.status)) return handleFailure(item.id, finalize.status, body);
    authorizationId = null;
  }
  const authorize = await fetch(endpoint, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...common, action: "authorize", evidenceType: item.evidenceType, originalFilename: item.filename, mimeType: item.mimeType, fileSizeBytes: item.file.size }) });
  const authorized = await authorize.json().catch(() => null);
  if (!authorize.ok) return handleFailure(item.id, authorize.status, authorized);
  if (authorized.evidenceId) { await updateBuildEvidenceOutbox(item.id, { status: "synchronized", serverEvidenceId: authorized.evidenceId }); return "synchronized" as const; }
  authorizationId = authorized.authorization.authorizationId;
  await updateBuildEvidenceOutbox(item.id, { authorizationId });
  const upload = await createBrowserSupabase().storage.from(authorized.authorization.bucket).uploadToSignedUrl(authorized.authorization.path, authorized.authorization.token, item.file, { contentType: item.mimeType, upsert: false });
  if (upload.error) return handleFailure(item.id, 503, { code: "upload_interrupted", error: "Evidence upload was interrupted. Retry when connectivity is stable." });
  const finalize = await fetch(endpoint, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...common, action: "finalize", authorizationId, evidenceType: item.evidenceType, description: item.description,
    deviceCapturedAt: item.deviceCapturedAt, deviceTimezoneOffsetMinutes: item.deviceTimezoneOffsetMinutes, latitude: item.location.latitude, longitude: item.location.longitude,
    gpsAccuracyMetres: item.location.accuracyMetres, gpsCapturedAt: item.location.capturedAt, gpsSource: item.location.source, locationStatus: item.location.permissionStatus }) });
  const finalized = await finalize.json().catch(() => null);
  if (!finalize.ok) return handleFailure(item.id, finalize.status, finalized);
  await updateBuildEvidenceOutbox(item.id, { status: "synchronized", serverEvidenceId: finalized.id });
  return "synchronized" as const;
}

async function handleFailure(id: string, status: number, body: any) {
  const failure = boundedFailure(status, body);
  const state = status === 401 ? "authentication_required" : failure.retryable ? "failed" : "needs_review";
  await updateBuildEvidenceOutbox(id, { status: state, lastErrorCode: failure.code, lastErrorMessage: failure.message, ...(state === "needs_review" ? { authorizationId: null } : {}) });
  return state;
}

export function BuildMobileEvidenceCapture({ identity, scope, checklistItems = [], exceptionId = null }: { identity: Identity; scope: Required<Scope>; checklistItems?: Array<{id:string;item:string}>; exceptionId?: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [checklistItemId, setChecklistItemId] = useState("");
  const [location, setLocation] = useState<BuildEvidenceLocation>({ latitude: null, longitude: null, accuracyMetres: null, capturedAt: null, source: "unavailable", permissionStatus: "prompt" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function captureLocation() {
    if (!navigator.geolocation) return setLocation({ latitude:null,longitude:null,accuracyMetres:null,capturedAt:null,source:"unavailable",permissionStatus:"unavailable" });
    navigator.geolocation.getCurrentPosition((position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMetres: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString(), source: "device_geolocation", permissionStatus: "granted" }),
      (error) => setLocation({ latitude:null,longitude:null,accuracyMetres:null,capturedAt:null,source:"unavailable",permissionStatus:error.code===error.PERMISSION_DENIED?"denied":"error" }), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  async function retainEvidence() {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const payload = file.type.startsWith("image/") ? await compressImage(file) : file;
      const item = await queueBuildEvidence({ id: createBuildEvidenceOperationId(), ...identity, ...scope, checklistItemId: checklistItemId || null, exceptionId,
        evidenceType: file.type.startsWith("image/") ? "photo" : file.type.startsWith("video/") ? "video" : "document", file: payload, filename: file.name,
        mimeType: payload.type || file.type, description: description.trim() || null, deviceCapturedAt: new Date().toISOString(), deviceTimezoneOffsetMinutes: new Date().getTimezoneOffset(), location });
      setFile(null); setDescription("");
      if (navigator.onLine) {
        const result = await withBuildEvidenceSyncLock(() => synchronizeBuildEvidenceItem(item));
        setMessage(result === "synchronized" ? "Evidence synchronized and confirmed by the server." : "Evidence retained on this device. Review Pending Sync for its current state.");
        if (result === "synchronized") router.refresh();
      } else setMessage("Evidence retained on this device and pending synchronization. Browser storage is not guaranteed permanent storage.");
    } catch (error) { setMessage(error instanceof BuildOutboxUnavailableError ? error.message : "Evidence could not be retained on this device."); }
    finally { setBusy(false); }
  }

  return <section className="mt-5 min-w-0 max-w-full rounded-xl border border-orange-200 bg-orange-50/40 p-4"><p className="text-xs font-black uppercase tracking-widest text-orange-700">Mobile evidence capture</p><p className="mt-2 break-words text-sm text-slate-700">Evidence can be retained temporarily on this device during connectivity loss. It is not server evidence until synchronization is confirmed.</p><div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm font-bold">Take a photo<input type="file" accept="image/*" capture="environment" onChange={(event)=>setFile(event.target.files?.[0]??null)} className="min-w-0 max-w-full rounded-lg border bg-white p-2"/></label><label className="grid min-w-0 gap-1 text-sm font-bold">Choose from device<input type="file" accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf,text/plain" onChange={(event)=>setFile(event.target.files?.[0]??null)} className="min-w-0 max-w-full rounded-lg border bg-white p-2"/></label>{checklistItems.length?<label className="grid min-w-0 gap-1 text-sm font-bold sm:col-span-2">Checklist association<select className="min-h-11 min-w-0 max-w-full rounded-lg border bg-white px-3" value={checklistItemId} onChange={(event)=>setChecklistItemId(event.target.value)}><option value="">Activity evidence</option>{checklistItems.map((item)=><option key={item.id} value={item.id}>{item.item}</option>)}</select></label>:null}<label className="grid min-w-0 gap-1 text-sm font-bold sm:col-span-2">Description<input className="min-h-11 min-w-0 max-w-full rounded-lg border bg-white px-3" maxLength={2000} value={description} onChange={(event)=>setDescription(event.target.value)}/></label><div className="flex min-w-0 flex-wrap items-center gap-2 sm:col-span-2"><button type="button" onClick={captureLocation} className="min-h-11 max-w-full rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold">Capture device location</button><span className="min-w-0 break-words text-xs font-semibold text-slate-600">{location.permissionStatus === "granted" ? `Device-reported · ±${Math.round(location.accuracyMetres ?? 0)}m` : `Location: ${location.permissionStatus}`}</span></div><button type="button" disabled={!file||busy} onClick={retainEvidence} className="min-h-11 max-w-full rounded-lg bg-orange-600 px-4 text-sm font-black text-white disabled:opacity-50 sm:col-span-2">{busy?"Saving…":"Save evidence safely"}</button>{message?<p role="status" className="min-w-0 break-words text-sm font-semibold text-slate-700 sm:col-span-2">{message}</p>:null}</div></section>;
}

export function BuildEvidenceSyncWorkspace({ identity }: { identity: Identity }) {
  const router = useRouter();
  const [items,setItems]=useState<BuildEvidenceOutboxItem[]>([]); const [message,setMessage]=useState(""); const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{try{await cleanupBuildEvidenceOutbox();setItems(await listBuildEvidenceOutbox(identity.userId,identity.clientId));}catch(error){setMessage(error instanceof Error?error.message:"Pending evidence is unavailable.");}finally{setLoading(false);}},[identity.clientId,identity.userId]);
  useEffect(()=>{void load();},[load]);
  async function sync(item:BuildEvidenceOutboxItem){if(!navigator.onLine){setMessage("Connect to the internet before retrying synchronization.");return;} await withBuildEvidenceSyncLock(()=>synchronizeBuildEvidenceItem(item)); await load(); router.refresh();}
  return <div className="min-w-0 max-w-full space-y-4"><section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5"><h1 className="break-words text-2xl font-black">Pending Synchronization</h1><p className="mt-2 break-words text-sm text-slate-600">Local evidence remains device-bound until the server confirms synchronization. Sign-in, permission or Activity changes may require review.</p></section>{message?<p role="alert" className="break-words rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold">{message}</p>:null}{loading?<p>Loading local evidence…</p>:items.length?<ul className="min-w-0 space-y-3">{items.map((item)=><li key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between"><div className="min-w-0 flex-1"><p className="break-all font-black">{item.filename}</p><p className="mt-1 break-words text-xs text-slate-500">{item.status.replaceAll("_"," ")} · {item.attempts} attempts · device capture {new Date(item.deviceCapturedAt).toLocaleString()}</p>{item.lastErrorMessage?<p className="mt-2 break-words text-sm text-rose-700">{item.lastErrorMessage}</p>:null}</div><div className="flex flex-wrap gap-2"><button disabled={item.status==="synchronizing"} onClick={()=>void sync(item)} className="min-h-11 rounded-lg bg-orange-600 px-4 text-sm font-bold text-white">Retry</button><button onClick={async()=>{await deleteBuildEvidenceOutbox(item.id);await load();}} className="min-h-11 rounded-lg border px-4 text-sm font-bold">Discard</button></div></div></li>)}</ul>:<p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No evidence is waiting on this device.</p>}</div>;
}

export function BuildEvidenceSyncCoordinator({ identity }: { identity: Identity }) {
  useEffect(() => {
    let active = true;
    async function synchronize() {
      if (!active || !navigator.onLine) return;
      await withBuildEvidenceSyncLock(async () => {
        const items = await listBuildEvidenceOutbox(identity.userId, identity.clientId).catch(() => []);
        for (const item of items) {
          if (!active || item.status === "needs_review" || item.status === "authentication_required") continue;
          if (item.attempts >= 5) {
            await updateBuildEvidenceOutbox(item.id, { status: "needs_review", lastErrorCode: "automatic_retry_limit", lastErrorMessage: "Automatic retries paused. Review this evidence and retry manually." });
            continue;
          }
          const result = await synchronizeBuildEvidenceItem(item);
          if (result === "authentication_required") break;
        }
        await cleanupBuildEvidenceOutbox().catch(() => undefined);
      });
    }
    window.addEventListener("online", synchronize);
    void synchronize();
    return () => { active = false; window.removeEventListener("online", synchronize); };
  }, [identity.clientId, identity.userId]);
  return null;
}
