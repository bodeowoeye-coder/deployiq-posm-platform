export function safeDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function safeDateKey(value: string | null | undefined, fallback = "Unknown") {
  const date = safeDate(value);
  return date ? date.toISOString().slice(0, 10) : fallback;
}

export function displaySubmissionDate(submittedAt: string | null | undefined, fallback = "Date unavailable") {
  return safeDateKey(submittedAt, fallback);
}
