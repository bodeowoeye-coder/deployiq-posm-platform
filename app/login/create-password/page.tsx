"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { analysePassword, validatePasswordMatch, type PasswordAnalysis } from "@/lib/acquisition/identity";
import { BrandMark } from "@/components/BrandMark";

const inputClass =
  "min-h-11 rounded-lg border border-slate-200 px-3 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100";

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
  const analysis = analysePassword(password);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextReturnTo = params.get("returnTo");
    if (nextReturnTo?.startsWith("/") && !nextReturnTo.startsWith("//")) setReturnTo(nextReturnTo);
  }, []);

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
