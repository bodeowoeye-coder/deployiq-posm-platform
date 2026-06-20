import { getRegionForState } from "@/lib/geography";

export type InstallerDraft = {
  installerName: string;
  projectId: string;
  projectName: string;
  brandName: string;
  installerState: string;
  installerLga: string;
  manualLocationDescription?: string;
  manualLandmark?: string;
  selectedLocationId?: string;
  updatedAt: string;
};

export type QueueSyncStatus = "Pending sync" | "Syncing" | "Synced" | "Failed";

export type QueuedSubmissionFields = {
  installerUserId: string | null;
  installerName: string;
  installerEmail?: string | null;
  projectId: string;
  projectName: string;
  brandName: string;
  installerState: string;
  installerRegion: string;
  installerLga: string;
  selectedLocationId?: string;
  selectedOutletName?: string;
  selectedOutletOwnerName?: string | null;
  selectedOutletAddress?: string | null;
  selectedOutletBrandType?: string | null;
  selectedOutletCode?: string | null;
  resolvedAddress: string | null;
  manualLocationDescription?: string;
  manualLandmark?: string;
  latitude: number | null;
  longitude: number | null;
  gpsStatus?: "pending" | "captured" | "unavailable";
  capturedAt: string;
  submitAnyway: boolean;
};

export type QueuedSubmission = {
  id: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  status: QueueSyncStatus;
  errorMessage: string | null;
  syncedAt: string | null;
  serverSubmissionId: string | null;
  imageName: string;
  imageType: string;
  imageSize: number;
  imageData?: ArrayBuffer;
  imageBlob?: Blob;
  fields: QueuedSubmissionFields;
};

export type QueuedSubmissionRecord = QueuedSubmission;

const draftKey = "deployiq-installer-draft";
const dbName = "deployiq-installer-queue";
const storeName = "queued-submissions";
const dbVersion = 1;

export function createLocalSubmissionId() {
  const browserCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (typeof browserCrypto?.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }

  const randomPart =
    typeof browserCrypto?.getRandomValues === "function"
      ? Array.from(browserCrypto.getRandomValues(new Uint32Array(2)))
          .map((value) => value.toString(36))
          .join("")
      : Math.random().toString(36).slice(2, 12);

  return `local-${Date.now().toString(36)}-${randomPart}`;
}

export function readInstallerDraft(): InstallerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(draftKey) ?? "null") as InstallerDraft | null;
  } catch {
    return null;
  }
}

export function saveInstallerDraft(draft: Omit<InstallerDraft, "updatedAt">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftKey, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
}

export function clearInstallerDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey);
}

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openQueueDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("Offline queue storage is not available on this device."));
      return;
    }

    const request = window.indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline queue."));
  });
}

function withQueueStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return openQueueDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result: T;
        const request = action(store);
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error ?? new Error("Offline queue operation failed."));
        transaction.oncomplete = () => {
          db.close();
          resolve(result);
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("Offline queue transaction failed."));
        };
      })
  );
}

export async function readQueuedSubmissions(): Promise<QueuedSubmissionRecord[]> {
  if (!canUseIndexedDb()) return [];
  return withQueueStore<QueuedSubmissionRecord[]>("readonly", (store) => store.getAll() as IDBRequest<QueuedSubmissionRecord[]>).then((items) =>
    [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );
}

export async function upsertQueuedSubmission(item: QueuedSubmissionRecord) {
  await withQueueStore<IDBValidKey>("readwrite", (store) => store.put(item));
}

export async function updateQueuedSubmission(id: string, changes: Partial<Omit<QueuedSubmissionRecord, "id" | "imageBlob">>) {
  const existing = await withQueueStore<QueuedSubmissionRecord | undefined>("readonly", (store) => store.get(id) as IDBRequest<QueuedSubmissionRecord | undefined>);
  if (!existing) return null;
  const next: QueuedSubmissionRecord = {
    ...existing,
    ...changes,
    updatedAt: new Date().toISOString()
  };
  await upsertQueuedSubmission(next);
  return next;
}

export async function deleteQueuedSubmission(id: string) {
  await withQueueStore<undefined>("readwrite", (store) => store.delete(id) as IDBRequest<undefined>);
}

function imageSourceType(image: Blob) {
  if (typeof File !== "undefined" && image instanceof File) return "File";
  if (image instanceof Blob) return "Blob";
  return typeof image;
}

export async function queueSubmission({
  image,
  fields,
  id = createLocalSubmissionId(),
  status = "Pending sync",
  errorMessage = null
}: {
  image: Blob;
  fields: Omit<QueuedSubmissionFields, "installerRegion"> & { installerRegion?: string };
  id?: string;
  status?: QueueSyncStatus;
  errorMessage?: string | null;
}) {
  const now = new Date().toISOString();
  const installerRegion = fields.installerRegion || getRegionForState(fields.installerState);
  const imageFile = image instanceof File ? image : null;
  const imageName = imageFile?.name || `offline-upload-${id}.jpg`;
  const imageType = image.type || "image/jpeg";
  const imageData = await image.arrayBuffer();

  console.info("[offline-queue] storing image payload", {
    sourceType: imageSourceType(image),
    blobSize: image.size,
    mimeType: imageType,
    filename: imageName,
    storageFormat: "ArrayBuffer",
    byteLength: imageData.byteLength
  });

  const item: QueuedSubmissionRecord = {
    id,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    status,
    errorMessage,
    syncedAt: null,
    serverSubmissionId: null,
    imageName,
    imageType,
    imageSize: image.size,
    imageData,
    fields: {
      ...fields,
      installerRegion
    }
  };

  await upsertQueuedSubmission(item);
  return item;
}

export function hasQueuedImagePayload(item: QueuedSubmissionRecord) {
  return Boolean(item.imageData?.byteLength || item.imageBlob?.size);
}

export function reconstructQueuedImageFile(item: QueuedSubmissionRecord) {
  const imageType = item.imageType || item.imageBlob?.type || "image/jpeg";
  const imageName = item.imageName || `offline-upload-${item.id}.jpg`;
  const blobPart = item.imageData ?? item.imageBlob;

  console.info("[offline-queue] reconstructing image payload", {
    sourceType: item.imageData ? "ArrayBuffer" : item.imageBlob ? "Blob" : "Missing",
    blobSize: item.imageBlob?.size ?? null,
    byteLength: item.imageData?.byteLength ?? null,
    mimeType: imageType,
    filename: imageName
  });

  if (!blobPart) {
    throw new Error("Offline photo is no longer available on this device. Please capture the upload again.");
  }

  try {
    const imageFile = new File([blobPart], imageName, { type: imageType });
    console.info("[offline-queue] image reconstruction succeeded", {
      fileSize: imageFile.size,
      mimeType: imageFile.type,
      filename: imageFile.name
    });
    return imageFile;
  } catch (error) {
    console.error("[offline-queue] image reconstruction failed", {
      message: error instanceof Error ? error.message : "Unknown reconstruction error",
      mimeType: imageType,
      filename: imageName
    });
    throw new Error("Could not rebuild the offline photo for upload. Please capture the upload again.");
  }
}

export function buildQueuedSubmissionFormData(item: QueuedSubmissionRecord, submitAnywayOverride?: boolean) {
  const formData = new FormData();
  const imageFile = reconstructQueuedImageFile(item);
  formData.append("image", imageFile);
  formData.append("localSubmissionId", item.id);
  formData.append("installerName", item.fields.installerName);
  formData.append("installerEmail", item.fields.installerEmail ?? "");
  formData.append("projectId", item.fields.projectId);
  formData.append("projectName", item.fields.projectName);
  formData.append("brandName", item.fields.brandName);
  formData.append("installerState", item.fields.installerState);
  formData.append("installerRegion", item.fields.installerRegion);
  formData.append("installerLga", item.fields.installerLga);
  formData.append("selectedLocationId", item.fields.selectedLocationId ?? "");
  formData.append("selectedOutletName", item.fields.selectedOutletName ?? "");
  formData.append("selectedOutletOwnerName", item.fields.selectedOutletOwnerName ?? "");
  formData.append("selectedOutletAddress", item.fields.selectedOutletAddress ?? "");
  formData.append("selectedOutletBrandType", item.fields.selectedOutletBrandType ?? "");
  formData.append("selectedOutletCode", item.fields.selectedOutletCode ?? "");
  formData.append("manualLocationDescription", item.fields.manualLocationDescription ?? "");
  formData.append("manualLandmark", item.fields.manualLandmark ?? "");
  formData.append("latitude", String(item.fields.latitude ?? ""));
  formData.append("longitude", String(item.fields.longitude ?? ""));
  formData.append("resolvedAddress", item.fields.resolvedAddress ?? "");
  formData.append("capturedAt", item.fields.capturedAt);
  formData.append("submitAnyway", String(submitAnywayOverride ?? item.fields.submitAnyway));
  return formData;
}
