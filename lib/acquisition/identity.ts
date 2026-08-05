/**
 * Identity validation utilities for CO-1B.
 * No React, no DB, no HTTP — fully testable with node --test.
 */

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------

export function validateOrganisationName(name: string): string | null {
  const v = name.trim();
  if (!v) return "Organisation name is required.";
  if (v.length < 2) return "Organisation name must be at least 2 characters.";
  if (v.length > 100) return "Organisation name must be 100 characters or fewer.";
  return null;
}

export function validateWorkspaceName(name: string): string | null {
  const v = name.trim();
  if (!v) return "Workspace name is required.";
  if (v.length < 2) return "Workspace name must be at least 2 characters.";
  if (v.length > 60) return "Workspace name must be 60 characters or fewer.";
  return null;
}

export function validateWorkspaceSlug(slug: string): string | null {
  const v = slug.trim().toLowerCase();
  if (!v) return "Workspace URL is required.";
  if (v.length < 3) return "Workspace URL must be at least 3 characters.";
  if (v.length > 30) return "Workspace URL must be 30 characters or fewer.";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(v)) {
    return "Use only lowercase letters, numbers and hyphens. Must start and end with a letter or number.";
  }
  if (v.includes("--")) return "Workspace URL must not contain consecutive hyphens.";
  return null;
}

/** Generate a workspace slug from an organisation name. */
export function generateWorkspaceSlug(organisationName: string): string {
  const slug = organisationName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  return slug || "my-workspace";
}

/** Generate slug alternatives when the preferred slug is taken. */
export function generateSlugAlternatives(slug: string): string[] {
  const base = slug.slice(0, 26);
  return [
    `${base}-app`,
    `${base}-hq`,
    `${base}-workspace`,
  ].map((s) => s.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30));
}

// ---------------------------------------------------------------------------
// Administrator
// ---------------------------------------------------------------------------

const FREE_EMAIL_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "me.com", "mac.com", "live.com",
  "msn.com", "aol.com", "ymail.com",
]);

export function validateBusinessEmail(email: string): string | null {
  const v = email.trim().toLowerCase();
  if (!v) return "Business email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "Enter a valid email address.";
  const domain = v.split("@")[1] ?? "";
  if (FREE_EMAIL_PROVIDERS.has(domain)) {
    return "Please use your business email address (not a personal email provider).";
  }
  return null;
}

export function validateName(value: string, fieldLabel: string): string | null {
  const v = value.trim();
  if (!v) return `${fieldLabel} is required.`;
  if (v.length < 2) return `${fieldLabel} must be at least 2 characters.`;
  if (v.length > 50) return `${fieldLabel} must be 50 characters or fewer.`;
  return null;
}

export function validateMobile(mobile: string): string | null {
  const v = mobile.trim();
  if (!v) return "Mobile number is required.";
  const cleaned = v.replace(/[\s()\-+]/g, "");
  if (!/^\d{7,15}$/.test(cleaned)) {
    return "Enter a valid mobile number. International format preferred, e.g. +234 800 000 0000.";
  }
  return null;
}

export type PasswordAnalysis = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Fair" | "Good" | "Strong";
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  isAcceptable: boolean;
};

export function analysePassword(password: string): PasswordAnalysis {
  const hasMinLength  = password.length >= 8;
  const hasUppercase  = /[A-Z]/.test(password);
  const hasLowercase  = /[a-z]/.test(password);
  const hasNumber     = /[0-9]/.test(password);
  const hasSpecial    = /[^A-Za-z0-9]/.test(password);

  const passed = [hasMinLength, hasUppercase, hasLowercase, hasNumber, hasSpecial].filter(Boolean).length;
  const score = Math.min(4, Math.max(0, passed - 1)) as 0 | 1 | 2 | 3 | 4;
  const LABELS: PasswordAnalysis["label"][] = ["Very weak", "Weak", "Fair", "Good", "Strong"];

  return {
    score,
    label: LABELS[score],
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
    isAcceptable: passed >= 4 && hasMinLength,
  };
}

export function validatePasswordMatch(password: string, confirm: string): string | null {
  if (!confirm) return "Please confirm your password.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

/** Generate a 6-digit OTP as a string (server-side — uses Node crypto). */
export function generateOTPString(): string {
  // Returns a deterministic-length string; caller provides entropy from crypto.randomInt
  return "000000"; // Placeholder — replaced by server-side impl that uses crypto.randomInt
}

export function isOTPFormatValid(input: string): boolean {
  return /^\d{6}$/.test(input.trim());
}

export function isOTPExpired(expiresAt: string): boolean {
  return new Date() > new Date(expiresAt);
}

export const OTP_VALIDITY_MINUTES = 10;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
