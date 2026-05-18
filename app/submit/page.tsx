"use client";

import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Loader2, MapPin, Upload, Video, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { compressImage } from "@/lib/imageCompression";
import { getRegionForState } from "@/lib/geography";
import { DEFAULT_PROJECT_NAME } from "@/lib/projects";
import { StateCombobox } from "@/components/StateCombobox";
import { queueSubmission, readInstallerDraft, readQueuedSubmissions, saveInstallerDraft } from "@/lib/installerDrafts";

type PositionState = {
  latitude: number | null;
  longitude: number | null;
  message: string;
};

type BrandOption = {
  id: string;
  brand_name: string;
};

type MismatchWarning = {
  selectedBrand: string | null;
  detectedBrand: string | null;
  confidence: "Low" | "Medium" | "High";
  mismatchReason: string | null;
  aiReviewNote: string | null;
};

export default function SubmitPage() {
  const [installerName, setInstallerName] = useState("");
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [brandName, setBrandName] = useState("");
  const [installerState, setInstallerState] = useState("");
  const installerRegion = getRegionForState(installerState);
  const [installerLga, setInstallerLga] = useState("");
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandsError, setBrandsError] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [position, setPosition] = useState<PositionState>({
    latitude: null,
    longitude: null,
    message: "Getting phone location..."
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [mismatchWarning, setMismatchWarning] = useState<MismatchWarning | null>(null);
  const [role, setRole] = useState<"admin" | "client" | "installer" | null>(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const draft = readInstallerDraft();
    if (draft) {
      setInstallerName(draft.installerName);
      setProjectName(draft.projectName || DEFAULT_PROJECT_NAME);
      setBrandName(draft.brandName);
      setInstallerState(draft.installerState);
      setInstallerLga(draft.installerLga);
    }
    setQueuedCount(readQueuedSubmissions().length);
  }, []);

  useEffect(() => {
    saveInstallerDraft({ installerName, projectName, brandName, installerState, installerLga });
  }, [brandName, installerLga, installerName, installerState, projectName]);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => setRole(body?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    async function loadBrands() {
      try {
        const response = await fetch("/api/brands");
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load brands.");
        setBrands(body.brands ?? []);
      } catch (loadError) {
        setBrandsError(loadError instanceof Error ? loadError.message : "Could not load brands.");
      }
    }

    loadBrands();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setPosition({ latitude: null, longitude: null, message: "Location is not available on this phone." });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (geo) => {
        setPosition({
          latitude: geo.coords.latitude,
          longitude: geo.coords.longitude,
          message: "Location captured"
        });
      },
      () => {
        setPosition({ latitude: null, longitude: null, message: "Allow location so the office can verify the site." });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (!image) {
      setPreviewUrl("");
      return;
    }

    const nextUrl = URL.createObjectURL(image);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [image]);

  useEffect(() => {
    if (!showWebcam) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      return;
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        showToast("Camera is not available on this device.", "error");
        setShowWebcam(false);
      });
  }, [showToast, showWebcam]);

  const canSubmit = useMemo(() => Boolean(image && projectName.trim() && installerState && installerRegion && !isSubmitting), [image, installerRegion, installerState, isSubmitting, projectName]);

  async function submitReport(submitAnyway = false) {
    if (!image) return;

    setIsSubmitting(true);
    setResult("idle");
    setError("");

    try {
      const compressed = await compressImage(image);
      const formData = new FormData();
      formData.append("image", compressed);
      formData.append("installerName", installerName);
      formData.append("projectName", projectName);
      formData.append("brandName", brandName);
      formData.append("installerState", installerState);
      formData.append("installerRegion", installerRegion);
      formData.append("installerLga", installerLga);
      formData.append("latitude", String(position.latitude ?? ""));
      formData.append("longitude", String(position.longitude ?? ""));
      formData.append("capturedAt", new Date().toISOString());
      formData.append("submitAnyway", String(submitAnyway));

      const response = await fetch("/api/submissions", { method: "POST", body: formData });

      const body = await response.json().catch(() => ({}));

      if (response.status === 409 && body.requiresConfirmation) {
        setMismatchWarning({
          selectedBrand: body.selectedBrand ?? null,
          detectedBrand: body.detectedBrand ?? null,
          confidence: body.confidence ?? "Low",
          mismatchReason: body.mismatchReason ?? null,
          aiReviewNote: body.aiReviewNote ?? null
        });
        return;
      }

      if (!response.ok) {
        throw new Error(body.error || "Submission failed.");
      }

      setImage(null);
      setBrandName("");
      setMismatchWarning(null);
      setResult("success");
      showToast("Report submitted successfully.");
    } catch (submitError) {
      setResult("error");
      const message = submitError instanceof Error ? submitError.message : "Submission failed.";
      setError(message);
      if (!navigator.onLine || message.toLowerCase().includes("fetch")) {
        queueSubmission({ installerName, projectName, brandName, installerState, installerLga });
        setQueuedCount(readQueuedSubmissions().length);
      }
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitReport(false);
  }

  function captureWebcamPhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setImage(new File([blob], `webcam-${Date.now()}.jpg`, { type: "image/jpeg" }));
      setShowWebcam(false);
    }, "image/jpeg", 0.9);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-[min(760px,calc(100%-28px))] min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <BrandMark />
          <div className="flex min-w-0 flex-wrap gap-2">
            <ThemeToggle />
            {role === "admin" ? (
              <Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" href="/admin">
                Admin
              </Link>
            ) : null}
            {role === "client" ? (
              <Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" href="/client">
                Client
              </Link>
            ) : null}
            {role === "installer" ? (
              <Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" href="/installer/history">
                My uploads
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mx-auto min-w-0 w-[min(760px,calc(100%-28px))] py-6">
        <div className="mb-5">
          <h1 className="whitespace-normal break-words text-2xl font-bold leading-snug tracking-normal sm:text-3xl">Upload installed board photo</h1>
          <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-600">Take a clear picture. Your phone adds the location and time automatically.</p>
          {queuedCount > 0 ? <p className="mt-2 text-xs font-medium text-orange-700">{queuedCount} local draft queue item{queuedCount === 1 ? "" : "s"} waiting for future retry support.</p> : null}
        </div>

        <form className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6" onSubmit={handleSubmit}>
          <div className="grid min-w-0 gap-4">
            <Field label="Installer name">
              <input
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                id="installerName"
                name="installerName"
                placeholder="Optional"
                autoComplete="name"
                value={installerName}
                onChange={(event) => setInstallerName(event.target.value)}
              />
            </Field>

            <Field label="Project name">
              <input
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                id="projectName"
                name="projectName"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                required
              />
            </Field>

            <Field label="Brand">
              <select
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                id="brandName"
                name="brandName"
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
              >
                <option value="">Select if known</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.brand_name}>
                    {brand.brand_name}
                  </option>
                ))}
              </select>
              <span className="whitespace-normal break-words text-xs leading-snug text-slate-500">{brandsError || "The office can assign this later if unsure."}</span>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="State">
                <StateCombobox value={installerState} onChange={setInstallerState} />
              </Field>

              <Field label="Region/zone">
                <input
                  className="min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm shadow-sm"
                  id="installerRegion"
                  name="installerRegion"
                  value={installerRegion}
                  placeholder="Auto-filled from state"
                  readOnly
                  required
                />
              </Field>
            </div>

            <Field label="LGA">
              <input
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                id="installerLga"
                name="installerLga"
                placeholder="Optional"
                value={installerLga}
                onChange={(event) => setInstallerLga(event.target.value)}
              />
            </Field>

            <Field label="Installed board picture">
              {previewUrl ? (
                <img className="max-h-80 w-full rounded-lg border border-slate-200 object-cover" src={previewUrl} alt="Selected installed board" />
              ) : (
                <div className="flex min-h-36 min-w-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-slate-500">
                  <div>
                    <Camera className="mx-auto mb-2" aria-hidden size={28} />
                    <div className="text-sm font-medium">Take or choose photo</div>
                  </div>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-3">
                <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" type="button" onClick={() => cameraInputRef.current?.click()}>
                  <Camera aria-hidden size={17} />
                  Take Photo
                </button>
                <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" type="button" onClick={() => galleryInputRef.current?.click()}>
                  <ImagePlus aria-hidden size={17} />
                  Choose Gallery
                </button>
                <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" type="button" onClick={() => setShowWebcam(true)}>
                  <Video aria-hidden size={17} />
                  Use Webcam
                </button>
              </div>
              <input ref={cameraInputRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
              <input ref={galleryInputRef} className="hidden" id="image" name="image" type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
            </Field>

            <div className="flex min-h-11 min-w-0 items-start gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm leading-snug text-slate-600">
              <MapPin aria-hidden size={18} />
              <span className="min-w-0 whitespace-normal break-words">{position.message}</span>
            </div>

            {result === "success" ? (
              <div className="flex min-w-0 items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm leading-snug text-emerald-700">
                <CheckCircle2 aria-hidden size={18} />
                Submitted successfully.
              </div>
            ) : null}

            {result === "error" ? <div className="whitespace-normal break-words rounded-lg bg-rose-50 p-3 text-sm leading-snug text-rose-700">{error}</div> : null}

            <button className="sticky bottom-3 z-10 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-black px-4 font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-60 sm:static sm:min-h-11 sm:shadow-none" type="submit" disabled={!canSubmit}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden size={18} /> : <Upload aria-hidden size={18} />}
              {isSubmitting ? "Submitting..." : "Submit report"}
            </button>
          </div>
        </form>
      </section>

      {mismatchWarning ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center">
          <section
            className="w-full max-w-lg overflow-hidden rounded-lg border border-red-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="brand-warning-title"
          >
            <div className="border-b border-red-100 bg-red-50 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-red-100 p-2 text-red-700">
                  <AlertTriangle aria-hidden size={22} />
                </div>
                <div className="min-w-0">
                  <h2 id="brand-warning-title" className="whitespace-normal break-words text-lg font-bold leading-snug text-red-900">
                    Brand mismatch detected
                  </h2>
                  <p className="mt-1 whitespace-normal break-words text-sm leading-snug text-red-800">Detected brand appears different from selected brand. Please verify before continuing.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:p-5">
              <BrandReviewRow label="Selected brand" value={mismatchWarning.selectedBrand || "Not selected"} />
              <BrandReviewRow label="Detected brand" value={mismatchWarning.detectedBrand || "Uncertain"} />
              <BrandReviewRow label="AI confidence" value={mismatchWarning.confidence} />
              {mismatchWarning.aiReviewNote ? (
                <div className="whitespace-normal break-words rounded-lg bg-slate-50 p-3 text-sm leading-snug text-slate-600">{mismatchWarning.aiReviewNote}</div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 p-4 sm:flex-row sm:justify-end sm:p-5">
              <button
                className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 font-semibold text-slate-900"
                type="button"
                onClick={() => setMismatchWarning(null)}
              >
                Go Back
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 font-semibold text-white disabled:opacity-60"
                type="button"
                onClick={() => submitReport(true)}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="animate-spin" aria-hidden size={18} /> : null}
                Submit Anyway
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {showWebcam ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center">
          <section className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h2 className="text-base font-bold">Capture from webcam</h2>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200" type="button" onClick={() => setShowWebcam(false)} aria-label="Close webcam">
                <X aria-hidden size={16} />
              </button>
            </div>
            <div className="p-4">
              <video ref={videoRef} className="aspect-video w-full rounded-lg bg-slate-950 object-cover" autoPlay playsInline muted />
              <button className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-black px-4 font-semibold text-white" type="button" onClick={captureWebcamPhoto}>
                <Camera aria-hidden size={18} />
                Capture photo
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-2 whitespace-normal break-words text-sm font-semibold leading-snug text-slate-700">
      {label}
      {children}
    </label>
  );
}

function BrandReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
      <span className="min-w-0 whitespace-normal break-words text-sm leading-snug text-slate-500">{label}</span>
      <strong className="min-w-0 whitespace-normal break-words text-sm capitalize leading-snug text-slate-950">{value}</strong>
    </div>
  );
}
