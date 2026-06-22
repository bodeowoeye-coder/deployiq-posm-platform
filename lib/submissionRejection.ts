export const SUBMISSION_REJECTION_REASONS = [
  "Duplicate submission",
  "Poor photo quality",
  "Wrong outlet",
  "Wrong brand/signage",
  "GPS/location mismatch",
  "Incomplete evidence",
  "Other"
] as const;

export type SubmissionRejectionReason = (typeof SUBMISSION_REJECTION_REASONS)[number];

export function isSubmissionRejectionReason(value: string): value is SubmissionRejectionReason {
  return (SUBMISSION_REJECTION_REASONS as readonly string[]).includes(value);
}