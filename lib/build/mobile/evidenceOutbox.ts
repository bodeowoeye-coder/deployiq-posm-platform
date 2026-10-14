"use client";

export type BuildEvidenceOutboxStatus = "pending" | "synchronizing" | "synchronized" | "failed" | "needs_review" | "authentication_required";
export type BuildEvidenceLocation = {
  latitude: number | null;
  longitude: number | null;
  accuracyMetres: number | null;
  capturedAt: string | null;
  source: "device_geolocation" | "unavailable";
  permissionStatus: "granted" | "denied" | "prompt" | "unavailable" | "error";
};
export type BuildEvidenceOutboxItem = {
  id: string;
  schemaVersion: 1;
  userId: string;
  clientId: string;
  projectId: string;
  siteId: string;
  workPackageId: string;
  activityId: string;
  checklistItemId: string | null;
  exceptionId: string | null;
  evidenceType: "photo" | "video" | "document";
  file: Blob;
  filename: string;
  mimeType: string;
  description: string | null;
  deviceCapturedAt: string;
  deviceTimezoneOffsetMinutes: number;
  location: BuildEvidenceLocation;
  status: BuildEvidenceOutboxStatus;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  authorizationId: string | null;
  serverEvidenceId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

const DB_NAME = "deployiq-build-mobile";
const STORE = "evidence-outbox";
const VERSION = 1;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export class BuildOutboxUnavailableError extends Error {}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) return reject(new BuildOutboxUnavailableError("Secure local evidence storage is unavailable on this device."));
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        const store = request.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("identity", ["userId", "clientId"], { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("expiresAt", "expiresAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new BuildOutboxUnavailableError("Secure local evidence storage could not be opened."));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local evidence operation failed."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Local evidence transaction failed.")); };
  });
}

export function createBuildEvidenceOperationId() {
  if (!globalThis.crypto?.randomUUID) throw new BuildOutboxUnavailableError("Secure operation identifiers are unavailable on this device.");
  return globalThis.crypto.randomUUID();
}

export async function queueBuildEvidence(input: Omit<BuildEvidenceOutboxItem, "schemaVersion" | "status" | "attempts" | "lastErrorCode" | "lastErrorMessage" | "authorizationId" | "serverEvidenceId" | "createdAt" | "updatedAt" | "expiresAt">) {
  const now = new Date();
  const item: BuildEvidenceOutboxItem = { ...input, schemaVersion: 1, status: "pending", attempts: 0, lastErrorCode: null, lastErrorMessage: null,
    authorizationId: null, serverEvidenceId: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + RETENTION_MS).toISOString() };
  try { await transaction("readwrite", (store) => store.add(item)); }
  catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "UnknownError")) throw new BuildOutboxUnavailableError("This device does not have enough local storage for the evidence file.");
    throw error;
  }
  return item;
}

export async function listBuildEvidenceOutbox(userId: string, clientId: string) {
  const items = await transaction<BuildEvidenceOutboxItem[]>("readonly", (store) => store.getAll());
  return items.filter((item) => item.userId === userId && item.clientId === clientId && item.status !== "synchronized").sort((a,b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateBuildEvidenceOutbox(id: string, changes: Partial<BuildEvidenceOutboxItem>) {
  const current = await transaction<BuildEvidenceOutboxItem | undefined>("readonly", (store) => store.get(id));
  if (!current) return null;
  const next = { ...current, ...changes, id: current.id, updatedAt: new Date().toISOString() };
  await transaction("readwrite", (store) => store.put(next));
  return next;
}

export async function deleteBuildEvidenceOutbox(id: string) {
  await transaction("readwrite", (store) => store.delete(id));
}

export async function cleanupBuildEvidenceOutbox() {
  const now = new Date().toISOString();
  const items = await transaction<BuildEvidenceOutboxItem[]>("readonly", (store) => store.getAll());
  await Promise.all(items.filter((item) => item.status === "synchronized" || item.expiresAt < now).map((item) => deleteBuildEvidenceOutbox(item.id)));
}

export async function withBuildEvidenceSyncLock<T>(action: () => Promise<T>): Promise<T | null> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return action();
  return locks.request("deployiq-build-evidence-sync", { ifAvailable: true }, async (lock) => lock ? action() : null);
}
