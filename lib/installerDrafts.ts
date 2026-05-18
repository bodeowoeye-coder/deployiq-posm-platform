export type InstallerDraft = {
  installerName: string;
  projectName: string;
  brandName: string;
  installerState: string;
  installerLga: string;
  updatedAt: string;
};

export type QueuedSubmission = {
  id: string;
  createdAt: string;
  attempts: number;
  fields: Omit<InstallerDraft, "updatedAt">;
};

const draftKey = "deployiq-installer-draft";
const queueKey = "deployiq-installer-submission-queue";

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

export function readQueuedSubmissions(): QueuedSubmission[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(queueKey) ?? "[]") as QueuedSubmission[];
  } catch {
    return [];
  }
}

export function queueSubmission(fields: Omit<InstallerDraft, "updatedAt">) {
  if (typeof window === "undefined") return;
  const next = [
    ...readQueuedSubmissions(),
    {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      attempts: 0,
      fields
    }
  ];
  window.localStorage.setItem(queueKey, JSON.stringify(next));
}

export function clearQueuedSubmission(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(queueKey, JSON.stringify(readQueuedSubmissions().filter((item) => item.id !== id)));
}
