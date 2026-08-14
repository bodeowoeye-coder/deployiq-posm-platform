"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, RotateCcw, Upload, XCircle } from "lucide-react";
import type { DirectoryImportPreview, ImportLocationRow } from "@/lib/deploymentLocationsImport";
import type { DirectoryDashboard } from "@/lib/workspace/directoryImport";

type Props = {
  directoryLabel: string;
  initialDashboard: DirectoryDashboard;
};

type PreviewPayload = {
  preview: DirectoryImportPreview;
  rows: ImportLocationRow[];
};

type ImporterState = "idle" | "parsing" | "validating" | "preview_ready" | "committing" | "committed" | "error";

type ImportIdentity = {
  previewToken: string;
  sourceFileHash: string;
  idempotencyKey: string;
};

const PIPELINE = [
  "Download Template",
  "Upload CSV / Excel",
  "Parse",
  "Validation",
  "Duplicate Detection",
  "Preview",
  "Import Summary",
  "Commit Import",
];

export function DirectoryImportClient({ directoryLabel, initialDashboard }: Props) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [importerState, setImporterState] = useState<ImporterState>("idle");
  const [previewPayload, setPreviewPayload] = useState<PreviewPayload | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [importIdentity, setImportIdentity] = useState<ImportIdentity | null>(null);
  const [pendingReplacementFile, setPendingReplacementFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [lastCommittedCount, setLastCommittedCount] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const blockedMessageRef = useRef<HTMLParagraphElement | null>(null);

  const loading = importerState === "parsing" || importerState === "validating"
    ? "preview"
    : importerState === "committing"
      ? "commit"
      : null;
  const hasUncommittedPreview = Boolean(previewPayload && (importerState === "preview_ready" || importerState === "error"));

  useEffect(() => {
    if (!confirmOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelDiscard();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [confirmOpen]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUncommittedPreview) return;
      event.preventDefault();
      event.returnValue = "You have an uncommitted directory import. Discard it before starting another import.";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUncommittedPreview]);

  function makeImportIdentity(file: File): ImportIdentity {
    const token = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sourceFileHash = `${file.name}:${file.size}:${file.lastModified}`;
    return {
      previewToken: token,
      sourceFileHash,
      idempotencyKey: `${sourceFileHash}:${token}`,
    };
  }

  function resetFileInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function resetTransientImportState(nextState: ImporterState = "idle", nextMessage = "Ready for a new directory import.") {
    setPreviewPayload(null);
    setSelectedFilename(null);
    setImportIdentity(null);
    setPendingReplacementFile(null);
    setConfirmOpen(false);
    setBlockedMessage(null);
    setLastCommittedCount(null);
    setError(null);
    setImporterState(nextState);
    setMessage(nextMessage);
    resetFileInput();
    window.setTimeout(() => uploadButtonRef.current?.focus(), 0);
  }

  function requestDiscard() {
    setPendingReplacementFile(null);
    setConfirmOpen(true);
  }

  function cancelDiscard() {
    setPendingReplacementFile(null);
    setConfirmOpen(false);
    resetFileInput();
  }

  function confirmDiscard() {
    const replacement = pendingReplacementFile;
    resetTransientImportState("idle", "Import discarded. You can upload another file.");
    if (replacement) {
      window.setTimeout(() => void handleFile(replacement), 0);
    }
  }

  function startNewImport() {
    resetTransientImportState("idle", "Ready for a new directory import.");
  }

  async function refreshDashboard() {
    const response = await fetch("/api/workspace/directory", { credentials: "include" });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload.dashboard) setDashboard(payload.dashboard);
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (hasUncommittedPreview) {
      setPendingReplacementFile(file);
      setConfirmOpen(true);
      setMessage("You have an uncommitted directory import. Discard it before starting another import.");
      resetFileInput();
      return;
    }
    setImporterState("parsing");
    setSelectedFilename(file.name);
    setImportIdentity(makeImportIdentity(file));
    setBlockedMessage(null);
    setLastCommittedCount(null);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      setImporterState("validating");
      const response = await fetch("/api/workspace/directory/preview", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Unable to preview directory import.");
        setImporterState("error");
        return;
      }
      setPreviewPayload({ preview: payload.preview, rows: payload.rows });
      setImporterState("preview_ready");
      setMessage("Validation completed. Review the preview before committing this import.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to preview directory import.");
      setImporterState("error");
    }
  }

  async function commitImport() {
    if (!previewPayload) return;
    const blockingMessage = importBlockingMessage(previewPayload.preview);
    if (blockingMessage) {
      setBlockedMessage(blockingMessage);
      setMessage(null);
      window.setTimeout(() => blockedMessageRef.current?.focus({ preventScroll: true }), 0);
      return;
    }
    if (previewPayload.preview.rowsToInsert.length === 0) {
      setBlockedMessage("Upload at least one valid directory record before importing your directory.");
      setMessage(null);
      window.setTimeout(() => blockedMessageRef.current?.focus({ preventScroll: true }), 0);
      return;
    }
    setImporterState("committing");
    setBlockedMessage(null);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/workspace/directory/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: previewPayload.rows, source: "customer_admin_upload" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Unable to commit directory import.");
        if (payload.preview) setPreviewPayload({ preview: payload.preview, rows: previewPayload.rows });
        setImporterState("error");
        return;
      }
      setPreviewPayload(null);
      setSelectedFilename(null);
      setImportIdentity(null);
      resetFileInput();
      setImporterState("committed");
      setLastCommittedCount(payload.summary?.imported ?? previewPayload.preview.rowsToInsert.length);
      setMessage(`Import completed successfully. Batch ${payload.batchId}.`);
      await refreshDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to commit directory import.");
      setImporterState("error");
    } finally {
      setImporterState((state) => state === "committing" ? "committed" : state);
    }
  }

  const preview = previewPayload?.preview ?? null;
  const importBlocker = preview ? importBlockingMessage(preview) : null;
  const blockingIssueCount = preview ? preview.errors.length + preview.duplicates : 0;
  const canCommit = Boolean(preview && !importBlocker && preview.rowsToInsert.length > 0 && importerState !== "committing");
  const previewRows = preview?.previewRows ?? preview?.rowsToInsert.map((row, index) => ({
    rowNumber: index + 2,
    state: row.state,
    outlet_name: row.outlet_name,
    address: row.address,
    outlet_code: row.outlet_code,
    status: "ready" as const,
  })) ?? [];

  return (
    <div
      className="space-y-6"
      data-importer-state={importerState}
      data-preview-token-present={importIdentity ? "true" : "false"}
    >
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Total Directory Records" value={dashboard.totalRecords} />
        <Metric label="Recently Imported" value={dashboard.recentlyImported} />
        <Metric label="States Covered" value={dashboard.statesCovered} />
        <Metric label="Duplicate Records" value={dashboard.duplicateRecords} />
        <Metric label="Last Import" value={dashboard.lastImport ? new Date(dashboard.lastImport).toLocaleDateString() : "None"} />
        <Metric label="Import Health" value={dashboard.importHealth} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Import pipeline</p>
            <h2 className="mt-2 text-lg font-bold text-slate-900">{directoryLabel}</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/workspace/directory/template"
              aria-label={`Download ${directoryLabel} template`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download Template
            </a>
            <button
              ref={uploadButtonRef}
              type="button"
              onClick={() => inputRef.current?.click()}
              aria-describedby={hasUncommittedPreview ? "directory-import-dirty-warning" : undefined}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600"
            >
              {loading === "preview" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
              Upload CSV / Excel
            </button>
            {hasUncommittedPreview ? (
              <button
                type="button"
                onClick={requestDiscard}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Discard Import
              </button>
            ) : null}
            {importerState === "committed" ? (
              <button
                type="button"
                onClick={startNewImport}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Start New Import
              </button>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((step, index) => (
            <li key={step} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
              {index + 1}. {step}
            </li>
          ))}
        </ol>
        {selectedFilename ? (
          <p className="mt-3 text-sm font-semibold text-slate-600">Selected file: {selectedFilename}</p>
        ) : null}
        {hasUncommittedPreview ? (
          <p id="directory-import-dirty-warning" className="mt-2 text-sm font-semibold text-amber-700">
            You have an uncommitted directory import. Discard it before starting another import.
          </p>
        ) : null}
      </div>

      {message ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
          {lastCommittedCount !== null ? <span className="ml-2">Imported: {lastCommittedCount}</span> : null}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {preview ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <section
            aria-label="Directory import validation summary"
            className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Preview</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">Import summary</h3>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={requestDiscard}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Discard Import
                </button>
                {preview.errorReport.length > 0 ? (
                  <a href="/api/workspace/directory/error-report" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Error Report
                  </a>
                ) : (
                  <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-400">
                    No Error Report
                  </span>
                )}
                <button
                  type="button"
                  onClick={commitImport}
                  aria-disabled={!canCommit}
                  aria-describedby={blockedMessage ? "directory-import-blocked-reason" : undefined}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold text-white ${
                    canCommit ? "bg-slate-950 hover:bg-slate-800" : "cursor-not-allowed bg-slate-400"
                  }`}
                >
                  {loading === "commit" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  Commit Import
                </button>
                </div>
                {blockedMessage ? (
                  <p
                    ref={blockedMessageRef}
                    id="directory-import-blocked-reason"
                    role="alert"
                    tabIndex={-1}
                    className="max-w-sm rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 focus:outline-none"
                  >
                    {blockedMessage}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-5">
              <Metric label="Ready to Import" value={preview.imported} />
              <Metric label="Will Be Skipped" value={preview.skipped} />
              <Metric label="Duplicates" value={preview.duplicates} />
              <Metric label="Blocking Issues" value={blockingIssueCount} />
              <Metric label="Warnings" value={preview.warnings.length} />
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-3">State</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Address</th>
                    <th className="px-3 py-3">ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.slice(0, 10).map((row) => (
                    <tr
                      key={`${row.rowNumber}-${row.state}-${row.outlet_name}-${row.outlet_code ?? ""}`}
                      className={row.status === "duplicate" ? "bg-amber-50" : row.status === "invalid" ? "bg-rose-50" : undefined}
                      data-row-status={row.status}
                    >
                      <td className="px-3 py-3 font-semibold text-slate-800">{row.state || "Missing"}</td>
                      <td className="px-3 py-3 text-slate-700">
                        <span className="font-semibold">{row.outlet_name}</span>
                        {row.status === "duplicate" ? (
                          <span className="mt-1 block text-xs font-semibold text-amber-800">
                            Skipped duplicate: {row.duplicateReason}
                          </span>
                        ) : null}
                        {row.status === "invalid" ? (
                          <span className="mt-1 block text-xs font-semibold text-rose-700">
                            Invalid record: {row.errorMessage}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{row.address ?? "Missing"}</td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-600">{row.outlet_code ?? "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <aside className="space-y-4">
            <IssueList title="Blocking Issues" items={blockingIssues(preview)} tone="rose" emptyLabel="None" />
            <IssueList title="Warnings" items={preview.warnings} tone="amber" />
            <IssueList title="Information" items={preview.information} tone="emerald" />
          </aside>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4" role="presentation">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-import-title"
            aria-describedby="discard-import-description"
            tabIndex={-1}
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h3 id="discard-import-title" className="text-lg font-bold text-slate-950">Discard this import?</h3>
            <p id="discard-import-description" className="mt-2 text-sm leading-6 text-slate-600">
              The uploaded file, preview and validation results will be cleared. No directory records have been imported yet.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cancelDiscard}
                aria-label="Cancel discard import"
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                aria-label="Discard import and clear preview"
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"
              >
                Discard Import
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Import History</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">Recent imports</h3>
          </div>
          <button type="button" onClick={() => void refreshDashboard()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-3 py-3">Import date</th>
                <th className="px-3 py-3">Imported by</th>
                <th className="px-3 py-3">Records imported</th>
                <th className="px-3 py-3">Duplicates</th>
                <th className="px-3 py-3">Errors</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">No directory imports yet.</td>
                </tr>
              ) : dashboard.history.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-3 text-slate-700">{new Date(item.importDate).toLocaleString()}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{item.importedBy ?? "Unknown"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-800">{item.recordsImported}</td>
                  <td className="px-3 py-3 text-slate-700">{item.duplicates}</td>
                  <td className="px-3 py-3 text-slate-700">{item.errors}</td>
                  <td className="px-3 py-3 font-semibold text-slate-800">{item.status}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <a href={`/api/workspace/directory/error-report?batchId=${encodeURIComponent(item.id)}`} className="text-xs font-bold text-orange-600 hover:text-orange-700">View Summary</a>
                      <span className="text-xs font-semibold text-slate-400">Rollback in Phase 3</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function importBlockingMessage(preview: DirectoryImportPreview) {
  if (preview.errors.length > 0 && preview.duplicates > 0) {
    return "Resolve the duplicate and validation errors before committing.";
  }
  if (preview.errors.length > 0) {
    return "Resolve the validation errors before committing.";
  }
  if (preview.duplicates > 0) {
    return "Resolve the duplicate records before committing.";
  }
  return null;
}

function blockingIssues(preview: DirectoryImportPreview) {
  return [
    ...preview.errors,
    ...preview.warnings.filter((issue) => issue.field === "duplicate"),
  ];
}

function IssueList({
  title,
  items,
  tone,
  emptyLabel = "None",
}: {
  title: string;
  items: Array<{ rowNumber: number; field: string; message: string }>;
  tone: "rose" | "amber" | "emerald";
  emptyLabel?: string;
}) {
  const classes = tone === "rose"
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div className={`rounded-lg border p-4 ${items.length === 0 ? "pointer-events-none select-none" : ""} ${classes}`}>
      <p className="text-sm font-bold">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {items.slice(0, 8).map((item, index) => (
            <li key={`${item.rowNumber}-${item.field}-${index}`}>
              {item.rowNumber > 0 ? `Row ${item.rowNumber}: ` : ""}{item.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
