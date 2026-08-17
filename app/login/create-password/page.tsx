"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analysePassword, validatePasswordMatch, type PasswordAnalysis } from "@/lib/acquisition/identity";
import { BrandMark } from "@/components/BrandMark";

const inputClass =
  "min-h-11 rounded-lg border border-slate-200 px-3 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100";

type PasswordSetupState = "resolving" | "password_required" | "completed_or_unavailable";

function isSafeInternalDestination(destination: unknown): destination is string {
  return typeof destination === "string" && destination.startsWith("/") && !destination.startsWith("//");
}

function isCreatePasswordDestination(destination: string) {
  try {
    return new URL(destination, window.location.origin).pathname === "/login/create-password";
  } catch {
    return false;
  }
}

function PasswordMeter({ analysis }: { analysis: PasswordAnalysis }) {
  return (
    <div className="grid gap-1 text-xs text-slate-500">
      <span className={analysis.hasMinLength ? "text-emerald-600" : ""}>8+ characters</span>
      <span className={analysis.hasUppercase ? "text-emerald-600" : ""}>Uppercase letter</span>
      <span className={analysis.hasLowercase ? "text-emerald-600" : ""}>Lowercase letter</span>
      <span className={analysis.hasNumber ? "text-emerald-600" : ""}>Number</span>
      <span className={analysis.hasSpecial ? "text-emerald-600" : ""}>Special character</span>
    </div>
  );
}

export default function CreatePasswordPage() {
  const router = useRouter();
  const [returnTo, setReturnTo] = useState("/onboarding");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [setupState, setSetupState] = useState<PasswordSetupState>("resolving");
  const hasResolvedAuthorityRef = useRef(false);
  const analysis = analysePassword(password);

  useEffect(() => {
    if (hasResolvedAuthorityRef.current) return;
    hasResolvedAuthorityRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const nextReturnTo = params.get("returnTo");
    const resolvedReturnTo = isSafeInternalDestination(nextReturnTo) ? nextReturnTo : "/onboarding";
    setReturnTo(resolvedReturnTo);
    const recovery = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = recovery.get("access_token");
    const refreshToken = recovery.get("refresh_token");
    const hasRecoveryError = Boolean(recovery.get("error") || recovery.get("error_code") || recovery.get("error_description"));
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    async function applyAuthoritativeResponse(response: Response) {
      const payload = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
      if (!response.ok || !isSafeInternalDestination(payload?.redirectTo)) {
        setSetupState("completed_or_unavailable");
        return;
      }
      if (isCreatePasswordDestination(payload.redirectTo)) {
        setSetupState("password_required");
        return;
      }
      router.replace(payload.redirectTo);
    }

    async function resolveSetupAuthority() {
      try {
        if (!hasRecoveryError && accessToken && refreshToken) {
          const response = await fetch("/api/auth/session", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken, refreshToken, returnTo: resolvedReturnTo }),
          });
          await applyAuthoritativeResponse(response);
          return;
        }

        const response = await fetch(`/api/auth/session?returnTo=${encodeURIComponent(resolvedReturnTo)}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        await applyAuthoritativeResponse(response);
      } catch {
        setSetupState("completed_or_unavailable");
      }
    }

    void resolveSetupAuthority();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!analysis.isAcceptable) {
      setError("Password does not meet requirements.");
      return;
    }
    const matchError = validatePasswordMatch(password, confirmPassword);
    if (matchError) {
      setError(matchError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword, returnTo }),
      });
      const body = (await response.json().catch(() => null)) as { redirectTo?: string; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not update password.");
      router.replace(body?.redirectTo ?? "/onboarding");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update password.");
      setSubmitting(false);
    }
  }

  if (setupState === "resolving") {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-live="polite">
          <BrandMark compact />
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ account security</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Securing your account</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">Checking your secure account setup…</p>
          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-orange-500" />
          </div>
        </section>
      </main>
    );
  }

  if (setupState === "completed_or_unavailable") {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <BrandMark compact />
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ account security</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Account setup already completed or this secure link is no longer available.</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">Sign in to continue your DeployIQ workspace setup.</p>
          <a
            href="/login?returnTo=%2Fonboarding"
            className="mt-6 flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 font-semibold text-white transition hover:bg-slate-800"
          >
            Sign in to continue
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <BrandMark compact />
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ account security</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Create a new password</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Replace your temporary password before continuing your DeployIQ workspace setup.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            New Password
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {password ? <PasswordMeter analysis={analysis} /> : null}
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Confirm Password
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          {error ? <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 rounded-lg bg-slate-950 px-4 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? "Updating password..." : "Continue"}
          </button>
        </div>
      </form>
    </main>
  );
}
