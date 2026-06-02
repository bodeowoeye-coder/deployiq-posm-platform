"use client";

import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Loader2, MapPin, Upload, Video, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { compressImage } from "@/lib/imageCompression";
import { getRegionForState, NIGERIA_STATES } from "@/lib/geography";
import { reverseGeocode } from "@/lib/reverseGeocoding";
import { DEFAULT_PROJECT_NAME } from "@/lib/projects";
import { StateCombobox } from "@/components/StateCombobox";
import {
  buildQueuedSubmissionFormData,
  createLocalSubmissionId,
  hasQueuedImagePayload,
  queueSubmission,
  readInstallerDraft,
  readQueuedSubmissions,
  saveInstallerDraft,
  updateQueuedSubmission,
  type QueuedSubmissionRecord
} from "@/lib/installerDrafts";
import { SignOutButton } from "@/components/SignOutButton";

type PositionState = {
  latitude: number | null;
  longitude: number | null;
  status: "pending" | "captured" | "unavailable";
  message: string;
  address: string | null;
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

type AppSession = {
  role?: "admin" | "client" | "installer";
  userId?: string;
  email?: string | null;
  fullName?: string | null;
};

const queueSyncTimeoutMs = 45000;
const connectionCheckTimeoutMs = 5000;
const staleSyncingTimeoutMs = 2 * 60 * 1000;
const syncedQueueVisibleMs = 2 * 60 * 1000;
const queueRetryIntervalMs = 60000;

function isQueueableFailure(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("failed to fetch") || message.includes("network") || message.includes("storage unavailable");
}

export default function SubmitPage() {
  const [installerName, setInstallerName] = useState("");
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [brandName, setBrandName] = useState("");
  const [installerState, setInstallerState] = useState("");
  const installerRegion = getRegionForState(installerState);
  const [installerLga, setInstallerLga] = useState("");
  const [manualLocationDescription, setManualLocationDescription] = useState("");
  const [manualLandmark, setManualLandmark] = useState("");
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandsError, setBrandsError] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [position, setPosition] = useState<PositionState>({
    latitude: null,
    longitude: null,
    status: "pending",
    message: "Getting phone location...",
    address: null
  });
  const [isGettingLocation, setIsGettingLocation] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error" | "offline">("idle");
  const [error, setError] = useState("");
  const [mismatchWarning, setMismatchWarning] = useState<MismatchWarning | null>(null);
  const [role, setRole] = useState<"admin" | "client" | "installer" | null>(null);
  const [installerUserId, setInstallerUserId] = useState<string | null>(null);
  const [installerEmail, setInstallerEmail] = useState<string | null>(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [queuedItems, setQueuedItems] = useState<QueuedSubmissionRecord[]>([]);
  const [queueSyncMode, setQueueSyncMode] = useState<"idle" | "checking" | "syncing">("idle");
  const [checkingQueueId, setCheckingQueueId] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const syncInProgressRef = useRef(false);
  const locationAttemptRef = useRef(0);
  const { showToast } = useToast();
  const [showSyncedHistory, setShowSyncedHistory] = useState(false);
  const queuedCount = queuedItems.filter((item) => item.status !== "Synced").length;
  const syncedCount = queuedItems.filter((item) => item.status === "Synced").length;
  const visibleQueuedItems = queuedItems.filter((item) => {
    if (item.status !== "Synced") return true;
    if (showSyncedHistory) return true;
    if (!item.syncedAt) return false;
    const syncedAt = new Date(item.syncedAt).valueOf();
    return Number.isFinite(syncedAt) && Date.now() - syncedAt < syncedQueueVisibleMs;
  });

  useEffect(() => {
    const draft = readInstallerDraft();
    if (draft) {
      setInstallerName(draft.installerName);
      setProjectName(draft.projectName || DEFAULT_PROJECT_NAME);
      setBrandName(draft.brandName);
      setInstallerState(draft.installerState);
      setInstallerLga(draft.installerLga);
      setManualLocationDescription(draft.manualLocationDescription ?? "");
      setManualLandmark(draft.manualLandmark ?? "");
    }
    refreshQueue();
  }, []);

  useEffect(() => {
    saveInstallerDraft({ installerName, projectName, brandName, installerState, installerLga, manualLocationDescription, manualLandmark });
  }, [brandName, installerLga, installerName, installerState, manualLandmark, manualLocationDescription, projectName]);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: AppSession | null) => {
        setRole(body?.role ?? null);
        setInstallerUserId(body?.userId ?? null);
        setInstallerEmail(body?.email ?? null);
        const accountName = body?.fullName?.trim() || body?.email?.trim() || "";
        if (accountName) setInstallerName(accountName);
      })
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
    requestLocation();
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

  useEffect(() => {
    function triggerBackgroundSync() {
      void syncQueuedUploads();
    }

    function handleVisibilityChange() {
      if (!document.hidden) void syncQueuedUploads();
    }

    window.addEventListener("online", triggerBackgroundSync);
    window.addEventListener("focus", triggerBackgroundSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    connection?.addEventListener?.("change", triggerBackgroundSync);

    return () => {
      window.removeEventListener("online", triggerBackgroundSync);
      window.removeEventListener("focus", triggerBackgroundSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      connection?.removeEventListener?.("change", triggerBackgroundSync);
    };
  }, []);

  useEffect(() => {
    if (queuedItems.some((item) => item.status === "Pending sync")) {
      void syncQueuedUploads();
    }
  }, [queuedItems]);

  useEffect(() => {
    if (!queuedItems.some((item) => item.status === "Pending sync" || item.status === "Failed")) return;
    const interval = window.setInterval(() => {
      if (!document.hidden) void syncQueuedUploads();
    }, queueRetryIntervalMs);
    return () => window.clearInterval(interval);
  }, [queuedItems]);

  useEffect(() => {
    if (!queuedItems.some((item) => item.status === "Synced")) return;
    const timeout = window.setTimeout(() => {
      void refreshQueue();
    }, syncedQueueVisibleMs + 1000);
    return () => window.clearTimeout(timeout);
  }, [queuedItems]);

  const canSubmit = useMemo(
    () => Boolean(role && installerUserId && image && installerName.trim() && projectName.trim() && installerState && installerRegion && !isSubmitting && !isGettingLocation),
    [image, installerName, installerRegion, installerState, installerUserId, isGettingLocation, isSubmitting, projectName, role]
  );

  async function resolveCapturedAddress(latitude: number, longitude: number) {
    try {
      const resolved = await reverseGeocode(latitude, longitude);
      setPosition((prev) => ({
        ...prev,
        message: resolved.resolvedAddress ? "Location captured" : "Location captured, address unavailable",
        address: resolved.resolvedAddress
      }));
    } catch {
      setPosition((prev) => ({
        ...prev,
        message: "Location captured, address unavailable"
      }));
    }
  }

  async function requestLocation() {
    const manualSecureContextBlocked =
      typeof window !== "undefined" &&
      !window.isSecureContext &&
      !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

    if (!navigator.geolocation) {
      setIsGettingLocation(false);
      setPosition({
        latitude: null,
        longitude: null,
        status: "unavailable",
        message: manualSecureContextBlocked
          ? "GPS is blocked because this page is not running on HTTPS. Open the deployed HTTPS link on mobile, then retry."
          : "Location is not available on this phone or browser.",
        address: null
      });
      return;
    }

    const attemptId = locationAttemptRef.current + 1;
    locationAttemptRef.current = attemptId;
    setIsGettingLocation(true);
    setPosition((prev) => ({
      ...prev,
      status: "pending",
      message: "Getting high-accuracy GPS. Please keep this page open and allow location access.",
      address: prev.status === "captured" ? prev.address : null
    }));

    if (manualSecureContextBlocked) {
      setIsGettingLocation(false);
      setPosition({
        latitude: null,
        longitude: null,
        status: "unavailable",
        message: "GPS is blocked on this address because mobile browsers require HTTPS for location. Use the deployed HTTPS link or fill the fallback location fields below.",
        address: null
      });
      return;
    }

    try {
      const permissionsApi = navigator.permissions as { query?: (descriptor: PermissionDescriptor) => Promise<PermissionStatus> } | undefined;
      const permission = await permissionsApi?.query?.({ name: "geolocation" as PermissionName });
      if (permission?.state === "denied") {
        setIsGettingLocation(false);
        setPosition({
          latitude: null,
          longitude: null,
          status: "unavailable",
          message: "Location permission is denied. Enable location for this site in your browser settings, then tap Retry location.",
          address: null
        });
        return;
      }
      if (permission?.state === "prompt") {
        setPosition((prev) => ({
          ...prev,
          message: "Your browser may ask for location permission. Please tap Allow."
        }));
      }
    } catch {
      // Some mobile browsers do not support permissions.query for geolocation.
    }

    const attemptLocation = (options: PositionOptions, retryOnTimeout: boolean) => {
      navigator.geolocation.getCurrentPosition(
      async (geo) => {
        if (locationAttemptRef.current !== attemptId) return;
        const latitude = geo.coords.latitude;
        const longitude = geo.coords.longitude;
        setPosition({
          latitude,
          longitude,
          status: "captured",
          message: "Location captured",
          address: null
        });
        setIsGettingLocation(false);
        await resolveCapturedAddress(latitude, longitude);
      },
      (geoError) => {
        if (locationAttemptRef.current !== attemptId) return;
        const denied = geoError.code === geoError.PERMISSION_DENIED;
        if (!denied && retryOnTimeout) {
          setPosition((prev) => ({
            ...prev,
            status: "pending",
            message: "Still trying. Switching to a balanced GPS fallback..."
          }));
          attemptLocation({ enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 }, false);
          return;
        }
        setIsGettingLocation(false);
        setPosition({
          latitude: null,
          longitude: null,
          status: "unavailable",
          message: denied
            ? "Location permission is blocked. Allow location in your browser site settings, then tap Retry location."
            : "Location unavailable after retry. You can still submit, but this upload will be marked GPS unavailable.",
          address: null
        });
      },
      options
      );
    };

    attemptLocation({ enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }, true);
  }

  async function refreshQueue() {
    const items = await readQueuedSubmissions();
    const now = Date.now();
    const normalizedItems = await Promise.all(
      items.map(async (item) => {
        if (item.status !== "Syncing") return item;
        const updatedAt = new Date(item.updatedAt).valueOf();
        if (!Number.isFinite(updatedAt) || now - updatedAt <= staleSyncingTimeoutMs) return item;
        const resetItem = await updateQueuedSubmission(item.id, {
          status: "Failed",
          errorMessage: "Sync timed out. Please retry when your network is stable."
        });
        return resetItem ?? item;
      })
    );
    setQueuedItems(normalizedItems);
  }

  function fallbackLocationText() {
    return [
      manualLocationDescription.trim(),
      manualLandmark.trim() ? `Landmark: ${manualLandmark.trim()}` : "",
      installerLga.trim() ? `LGA: ${installerLga.trim()}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
  }

  function currentQueueFields(submitAnyway: boolean, capturedAt = new Date().toISOString()) {
    const fallbackAddress = fallbackLocationText();
    return {
      installerUserId,
      installerName,
      installerEmail,
      projectName,
      brandName,
      installerState,
      installerRegion,
      installerLga,
      resolvedAddress: position.address || fallbackAddress || null,
      manualLocationDescription,
      manualLandmark,
      latitude: position.latitude,
      longitude: position.longitude,
      gpsStatus: position.status,
      capturedAt,
      submitAnyway
    };
  }

  async function saveOfflineUpload(uploadImage: Blob, submitAnyway: boolean, id = createLocalSubmissionId(), message = "Saved offline. This upload will sync automatically when internet returns.") {
    await queueSubmission({
      image: uploadImage,
      id,
      fields: currentQueueFields(submitAnyway)
    });
    await refreshQueue();
    setImage(null);
    setMismatchWarning(null);
    setResult("offline");
    setError(message);
    showToast(message);
  }

  async function verifyQueueConnectivity() {
    const controller = new AbortController();
    let timeoutId: number | undefined;
    try {
      const response = await Promise.race([
        fetch("/api/health", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
          signal: controller.signal
        }),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            controller.abort();
            reject(new Error("Connection check timed out. Please retry when your network is stable."));
          }, connectionCheckTimeoutMs);
        })
      ]);
      if (!response.ok) throw new Error(`Connection check failed (${response.status}).`);
    } catch (connectivityError) {
      if (connectivityError instanceof DOMException && connectivityError.name === "AbortError") {
        throw new Error("Connection check timed out. Please retry when your network is stable.");
      }
      const message = connectivityError instanceof Error ? connectivityError.message : "Connection check failed.";
      throw new Error(message || "Connection check failed.");
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  async function syncQueuedItem(item: QueuedSubmissionRecord, showSuccessToast = true) {
    if (item.status === "Syncing" || item.status === "Synced") return;

    if (!hasQueuedImagePayload(item)) {
      await updateQueuedSubmission(item.id, {
        status: "Failed",
        errorMessage: "Offline photo is no longer available on this device. Please capture the upload again."
      });
      await refreshQueue();
      return;
    }

    try {
      setCheckingQueueId(item.id);
      await updateQueuedSubmission(item.id, {
        status: "Failed",
        errorMessage: "Checking connection..."
      });
      await refreshQueue();
      await verifyQueueConnectivity();
    } catch (connectivityError) {
      const message = connectivityError instanceof Error ? connectivityError.message : "Connection check failed.";
      await updateQueuedSubmission(item.id, {
        status: "Failed",
        errorMessage: message
      });
      await refreshQueue();
      if (showSuccessToast) showToast(message, "error");
      return;
    } finally {
      setCheckingQueueId(null);
    }

    await updateQueuedSubmission(item.id, {
      status: "Syncing",
      attempts: item.attempts + 1,
      errorMessage: null
    });
    await refreshQueue();

    const postQueuedSubmission = async (formData: FormData) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), queueSyncTimeoutMs);
      try {
        return await fetch("/api/submissions", {
          method: "POST",
          body: formData,
          signal: controller.signal
        });
      } finally {
        window.clearTimeout(timeout);
      }
    };

    try {
      let response = await postQueuedSubmission(buildQueuedSubmissionFormData(item));
      let body = await response.json().catch(() => ({}));

      if (response.status === 409 && body.requiresConfirmation) {
        response = await postQueuedSubmission(buildQueuedSubmissionFormData(item, true));
        body = await response.json().catch(() => ({}));
      }

      if (!response.ok) {
        throw new Error(body.error || "Sync failed. Please retry when your network is stable.");
      }

      await updateQueuedSubmission(item.id, {
        status: "Synced",
        errorMessage: null,
        syncedAt: new Date().toISOString(),
        serverSubmissionId: body.submission?.id ?? null
      });
      await refreshQueue();
      if (showSuccessToast) showToast("Upload synced successfully.");
    } catch (syncError) {
      const message =
        syncError instanceof DOMException && syncError.name === "AbortError"
          ? "Sync timed out. Please retry when your network is stable."
          : syncError instanceof Error
            ? syncError.message
            : "Sync failed. Please retry when your network is stable.";
      await updateQueuedSubmission(item.id, {
        status: "Failed",
        errorMessage: message
      });
      await refreshQueue();
      if (showSuccessToast) showToast(message, "error");
    }
  }

  async function syncQueuedUploads(showToasts = false) {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    setQueueSyncMode("checking");
    try {
      await verifyQueueConnectivity();
      setQueueSyncMode("syncing");
      const items = await readQueuedSubmissions();
      let synced = 0;
      for (const item of items) {
        if (item.status === "Pending sync" || item.status === "Failed") {
          const before = (await readQueuedSubmissions()).find((queuedItem) => queuedItem.id === item.id);
          await syncQueuedItem(item, showToasts);
          const after = (await readQueuedSubmissions()).find((queuedItem) => queuedItem.id === item.id);
          if (before?.status !== "Synced" && after?.status === "Synced") synced += 1;
        }
      }
      await refreshQueue();
      if (showToasts && synced > 0) showToast(`${synced} upload${synced === 1 ? "" : "s"} synced successfully.`);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Connection check failed.";
      const items = await readQueuedSubmissions();
      await Promise.all(
        items
          .filter((item) => item.status === "Pending sync" || item.status === "Failed")
          .map((item) =>
            updateQueuedSubmission(item.id, {
              status: "Failed",
              errorMessage: message
            })
          )
      );
      await refreshQueue();
      if (showToasts) showToast(message, "error");
    } finally {
      setQueueSyncMode("idle");
      setCheckingQueueId(null);
      syncInProgressRef.current = false;
    }
  }

  async function submitReport(submitAnyway = false) {
    if (!image) return;
    const localSubmissionId = createLocalSubmissionId();

    setIsSubmitting(true);
    setResult("idle");
    setError("");

    try {
      const compressed = await compressImage(image);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await saveOfflineUpload(compressed, submitAnyway, localSubmissionId);
        return;
      }

      const formData = new FormData();
      formData.append("image", compressed);
      formData.append("localSubmissionId", localSubmissionId);
      formData.append("installerName", installerName);
      formData.append("installerEmail", installerEmail ?? "");
      formData.append("projectName", projectName);
      formData.append("brandName", brandName);
      formData.append("installerState", installerState);
      formData.append("installerRegion", installerRegion);
      formData.append("installerLga", installerLga);
      formData.append("latitude", String(position.latitude ?? ""));
      formData.append("longitude", String(position.longitude ?? ""));
      formData.append("resolvedAddress", position.address || fallbackLocationText());
      formData.append("manualLocationDescription", manualLocationDescription);
      formData.append("manualLandmark", manualLandmark);
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
        if (response.status >= 500) {
          await saveOfflineUpload(compressed, submitAnyway, localSubmissionId);
          return;
        }
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
      if (isQueueableFailure(submitError)) {
        try {
          const compressed = await compressImage(image);
          await saveOfflineUpload(compressed, submitAnyway, localSubmissionId);
          return;
        } catch {
          // Keep the original submission error visible when the browser cannot persist the local file.
        }
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
            <SignOutButton />
          </div>
        </div>
      </header>

      <section className="mx-auto min-w-0 w-[min(760px,calc(100%-28px))] py-6">
        <div className="mb-5">
          <h1 className="whitespace-normal break-words text-2xl font-bold leading-snug tracking-normal sm:text-3xl">Upload Photo</h1>
          <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-600">Take a clear picture. Your phone adds the location and time automatically.</p>
          {queuedCount > 0 ? <p className="mt-2 text-xs font-medium text-orange-700">{queuedCount} pending upload{queuedCount === 1 ? "" : "s"} saved on this device.</p> : null}
        </div>

        {visibleQueuedItems.length > 0 || syncedCount > 0 ? (
          <section className="mb-5 overflow-hidden rounded-lg border border-orange-200 bg-orange-50/70 p-4 shadow-sm">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="whitespace-normal break-words text-base font-bold leading-snug text-slate-950">Pending uploads</h2>
                <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-600">Pending, syncing, and failed uploads stay here until they sync successfully.</p>
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                {syncedCount > 0 ? (
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-orange-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-orange-50"
                    type="button"
                    onClick={() => setShowSyncedHistory((current) => !current)}
                  >
                    {showSyncedHistory ? "Hide synced history" : "Show synced history"}
                  </button>
                ) : null}
	                <button
	                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
	                  type="button"
	                  disabled={queueSyncMode !== "idle" || !queuedItems.some((item) => item.status === "Pending sync" || item.status === "Failed")}
	                  onClick={() => syncQueuedUploads(true)}
	                >
	                  {queueSyncMode === "checking" ? "Checking connection" : queueSyncMode === "syncing" ? "Syncing" : "Retry sync"}
	                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {visibleQueuedItems.length === 0 ? (
                <div className="rounded-lg border border-orange-100 bg-white p-3 text-sm font-medium text-slate-600">
                  No pending uploads. Synced uploads are hidden by default.
                </div>
              ) : null}
              {visibleQueuedItems.map((item) => (
                <article key={item.id} className="grid min-w-0 gap-3 rounded-lg border border-orange-100 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${queueStatusClass(item.status)}`}>{item.status}</span>
                      <span className="whitespace-normal break-words text-sm font-semibold leading-snug">{item.fields.projectName || "Untitled project"}</span>
                    </div>
                    <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                      {item.fields.brandName || "Unassigned brand"} | {item.fields.installerState || "Unknown state"} | {formatQueueDate(item.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                      GPS: {item.fields.gpsStatus === "captured" ? `${item.fields.latitude ?? "n/a"}, ${item.fields.longitude ?? "n/a"}` : "Location unavailable"} | Photo: {item.imageName}
                    </p>
                    {item.errorMessage ? <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-rose-700">{item.errorMessage}</p> : null}
                  </div>
	                  <button
	                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50 disabled:cursor-wait disabled:opacity-60"
	                    type="button"
	                    disabled={checkingQueueId === item.id || item.status === "Syncing" || item.status === "Synced"}
	                    onClick={() => syncQueuedItem(item)}
	                  >
	                    {checkingQueueId === item.id ? "Checking connection" : item.status === "Syncing" ? "Syncing..." : item.status === "Synced" ? "Synced" : "Retry"}
	                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <form className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 pb-20 shadow-sm sm:p-6 sm:pb-6" onSubmit={handleSubmit}>
          <div className="grid min-w-0 gap-4 md:gap-5">
            <Field label="Installer identity">
              <input
                className="min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 shadow-sm"
                id="installerName"
                name="installerName"
                placeholder="Signed-in installer"
                autoComplete="name"
                value={installerName}
                readOnly
              />
              <p className="mt-1 text-xs leading-snug text-slate-500">This is linked to your signed-in DeployIQ account.</p>
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

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 md:gap-5">
              <div className="min-w-0">
                <Field label="State">
                  <select
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    name="installerState"
                    id="installerState"
                    value={installerState}
                    onChange={(e) => setInstallerState(e.target.value)}
                    required
                  >
                    <option value="">Select state</option>
                    {NIGERIA_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="min-w-0">
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
              <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-3">
                <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" type="button" onClick={() => cameraInputRef.current?.click()}>
                  <Camera aria-hidden size={17} />
                  Take Photo
                </button>
                <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" type="button" onClick={() => galleryInputRef.current?.click()}>
                  <ImagePlus aria-hidden size={17} />
                  Choose Gallery
                </button>
                <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" type="button" onClick={() => setShowWebcam(true)}>
                  <Video aria-hidden size={17} />
                  Use Webcam
                </button>
              </div>
              <input ref={cameraInputRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
              <input ref={galleryInputRef} className="hidden" id="image" name="image" type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
            </Field>

            <div className="flex min-h-11 min-w-0 items-start gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm leading-snug text-slate-600">
              {isGettingLocation ? <Loader2 className="mt-0.5 animate-spin text-orange-500" aria-hidden size={18} /> : <MapPin aria-hidden size={18} className={position.status === "captured" ? "text-emerald-600" : "text-orange-600"} />}
              <div className="min-w-0 whitespace-normal break-words">
                <div className="font-medium text-slate-700">
                  {isGettingLocation ? "Getting location" : position.status === "captured" ? "Location captured" : "Location unavailable"}
                </div>
                <div className="mt-1">{position.message}</div>
                {position.status === "captured" ? (
                  <div className="mt-1 text-xs text-slate-500">
                    GPS: {position.latitude}, {position.longitude}
                  </div>
                ) : null}
                {position.address ? (
                  <div className="mt-1 text-xs text-slate-500">{position.address}</div>
                ) : null}
                {position.status !== "captured" ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={requestLocation}
                      disabled={isGettingLocation}
                      className="mt-1 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm font-medium disabled:cursor-wait disabled:opacity-60"
                    >
                      {isGettingLocation ? "Retrying..." : "Retry location"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {position.status !== "captured" ? (
              <div className="grid min-w-0 gap-3 rounded-lg border border-orange-100 bg-orange-50/70 p-3 sm:grid-cols-2">
                <div className="min-w-0 sm:col-span-2">
                  <p className="text-sm font-bold text-slate-950">Manual location fallback</p>
                  <p className="mt-1 text-xs leading-snug text-slate-600">Use these fields when GPS is unavailable. The upload will still be marked GPS unavailable.</p>
                </div>
                <Field label="Nearest address/location description">
                  <textarea
                    className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    value={manualLocationDescription}
                    onChange={(event) => setManualLocationDescription(event.target.value)}
                    placeholder="E.g. beside First Bank, Allen Avenue"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Landmark">
                  <input
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    value={manualLandmark}
                    onChange={(event) => setManualLandmark(event.target.value)}
                    placeholder="Nearest landmark"
                    autoComplete="off"
                  />
                </Field>
              </div>
            ) : null}

            {result === "success" ? (
              <div className="flex min-w-0 items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm leading-snug text-emerald-700">
                <CheckCircle2 aria-hidden size={18} />
                Evidence uploaded. Pending review.
              </div>
            ) : null}

            {result === "offline" ? (
              <div className="flex min-w-0 items-start gap-2 rounded-lg bg-orange-50 p-3 text-sm leading-snug text-orange-800">
                <CheckCircle2 aria-hidden size={18} />
                Saved offline. This upload will sync automatically when internet returns.
              </div>
            ) : null}

            {result === "error" ? <div className="whitespace-normal break-words rounded-lg bg-rose-50 p-3 text-sm leading-snug text-rose-700">{error}</div> : null}

            <button
              className="sticky bottom-5 z-10 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-black px-4 font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-60 sm:static sm:min-h-11 sm:shadow-none"
              type="submit"
              disabled={!canSubmit}
            >
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden size={18} /> : <Upload aria-hidden size={18} />}
              {isSubmitting ? "Submitting..." : isGettingLocation ? "Getting location..." : "Submit report"}
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
                    Brand verification warning
                  </h2>
                  <p className="mt-1 whitespace-normal break-words text-sm leading-snug text-red-800">Selected brand was not confidently verified from this image. Please check before continuing.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:p-5">
              <BrandReviewRow label="Selected brand" value={mismatchWarning.selectedBrand || "Not selected"} />
              <BrandReviewRow label="Detected brand" value={mismatchWarning.detectedBrand || "Uncertain"} />
              <BrandReviewRow label="AI confidence" value={mismatchWarning.confidence} />
              {mismatchWarning.mismatchReason ? (
                <div className="whitespace-normal break-words rounded-lg bg-red-50 p-3 text-sm font-semibold leading-snug text-red-800">{mismatchWarning.mismatchReason}</div>
              ) : null}
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

function queueStatusClass(status: QueuedSubmissionRecord["status"]) {
  if (status === "Synced") return "bg-emerald-100 text-emerald-800";
  if (status === "Syncing") return "bg-blue-100 text-blue-800";
  if (status === "Failed") return "bg-rose-100 text-rose-800";
  return "bg-orange-100 text-orange-800";
}

function formatQueueDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos"
  });
}
