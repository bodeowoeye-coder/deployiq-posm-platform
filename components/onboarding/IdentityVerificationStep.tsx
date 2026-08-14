"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Loader2, CheckCircle2, MailOpen, Copy } from "lucide-react";
import { OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/acquisition/identity";

type Props = {
  email: string;
  resumeToken: string;
  debugOtp?: string | null;
  onVerified: (payload: { redirectTo?: string | null }) => void;
  onChangeEmail: () => void;
  onBack: () => void;
};

const OTP_LENGTH = 6;

export function IdentityVerificationStep({
  email,
  resumeToken,
  debugOtp,
  onVerified,
  onChangeEmail,
  onBack,
}: Props) {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [existingAccountAuthRequired, setExistingAccountAuthRequired] = useState(false);
  const [verifiedRedirectTo, setVerifiedRedirectTo] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(OTP_RESEND_COOLDOWN_SECONDS);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function handleVerify() {
    const trimmed = otp.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/acquisition/verify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken, otp: trimmed }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Verification failed. Please try again.");
        return;
      }
      setVerified(true);
      setVerifiedRedirectTo(typeof payload.redirectTo === "string" ? payload.redirectTo : null);
      setExistingAccountAuthRequired(payload.existingAccountAuthRequired === true);
      if (typeof payload.debug_temporary_password === "string") {
        setTemporaryPassword(payload.debug_temporary_password);
      } else if (payload.passwordMethod === "generated" && payload.requiresTemporaryPasswordDelivery === true) {
        setError("Temporary password delivery is not available yet. Please request a new verification code.");
        setVerified(false);
      } else if (payload.existingAccountAuthRequired === true) {
        return;
      } else {
        setTimeout(() => onVerified({ redirectTo: typeof payload.redirectTo === "string" ? payload.redirectTo : null }), 1200);
      }
    } catch {
      setError("Unable to verify. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      const res = await fetch("/api/acquisition/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Could not resend. Please try again.");
        return;
      }
      setCountdown(OTP_RESEND_COOLDOWN_SECONDS);
      setOtp("");
      inputRef.current?.focus();
    } catch {
      setError("Unable to resend. Please check your connection.");
    } finally {
      setResending(false);
    }
  }

  async function handleCopyTemporaryPassword() {
    if (!temporaryPassword) return;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setPasswordCopied(true);
      window.setTimeout(() => setPasswordCopied(false), 2000);
    } catch {
      setPasswordCopied(false);
      setCopyError("Unable to copy automatically. Select and copy the password manually.");
    }
  }

  if (verified) {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {temporaryPassword ? "Your temporary password" : "Email verified"}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            {temporaryPassword
              ? "Use this temporary password with your verified email to sign in. You will be required to create a new password immediately."
              : existingAccountAuthRequired
                ? "This email already has a DeployIQ account. Sign in with the existing password to continue setup."
              : "Taking you to sign in and continue setup…"}
          </p>
        </div>
        {temporaryPassword ? (
          <div className="w-full max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
            <p className="text-xs font-semibold text-amber-800">Verified email</p>
            <p className="mt-1 break-all text-sm font-medium text-slate-900">{email}</p>
            <p className="mt-3 text-xs font-semibold text-amber-800">Temporary password</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-white px-3 py-2">
              <code className="min-w-0 flex-1 break-all text-sm font-semibold text-slate-900">{temporaryPassword}</code>
              <button
                type="button"
                onClick={handleCopyTemporaryPassword}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Copy temporary password"
              >
                {passwordCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                <span className="sr-only">{passwordCopied ? "Copied" : "Copy password"}</span>
              </button>
            </div>
            {passwordCopied ? <p className="mt-2 text-xs font-semibold text-emerald-700">Copied</p> : null}
            {copyError ? <p className="mt-2 text-xs text-rose-600" role="alert">{copyError}</p> : null}
            <p className="mt-2 text-xs leading-relaxed text-amber-700">
              This password is shown once in development. You will be asked to create a new password after signing in.
            </p>
          </div>
        ) : null}
        {temporaryPassword || existingAccountAuthRequired ? (
          <button
            type="button"
            onClick={() => onVerified({ redirectTo: verifiedRedirectTo })}
            className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Continue to sign in
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
          Workspace Setup — Step 3 of 4
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Verify your email
        </h1>
        <p className="text-base text-slate-500 leading-relaxed">
          We've sent a 6-digit verification code to:
        </p>
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-2.5">
          <MailOpen className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-800">{email}</span>
        </div>
      </div>

      {/* Debug OTP (dev only) */}
      {debugOtp ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700">Development mode</p>
          <p className="mt-0.5 text-xs text-amber-600">
            Email service not configured. Your code is:{" "}
            <span className="font-mono font-bold">{debugOtp}</span>
          </p>
        </div>
      ) : null}

      {/* OTP input */}
      <div className="space-y-2">
        <label htmlFor="otp-input" className="block text-sm font-medium text-slate-700">
          Verification code
        </label>
        <input
          id="otp-input"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={OTP_LENGTH}
          value={otp}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH);
            setOtp(val);
            setError(null);
            if (val.length === OTP_LENGTH) {
              // Auto-submit when full length pasted/typed
              setOtp(val);
            }
          }}
          placeholder="000000"
          className="block w-full rounded-xl border border-slate-200 px-4 py-3.5 text-center text-2xl font-mono font-semibold tracking-[0.5em] placeholder:text-slate-200 placeholder:tracking-[0.5em] focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
          aria-describedby={error ? "otp-error" : undefined}
          autoComplete="one-time-code"
        />
        {error ? (
          <p id="otp-error" className="text-xs text-rose-600" role="alert">{error}</p>
        ) : null}
      </div>

      {/* Verify button */}
      <button
        type="button"
        onClick={handleVerify}
        disabled={loading || otp.length !== OTP_LENGTH}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Verify
      </button>

      {/* Resend + change email */}
      <div className="flex flex-col items-center gap-3">
        <div className="text-sm text-slate-500">
          Didn't receive a code?{" "}
          {countdown > 0 ? (
            <span className="text-slate-400">Resend in {countdown}s</span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="font-medium text-orange-600 hover:text-orange-700 underline underline-offset-2 disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend code"}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onChangeEmail}
          className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
        >
          Change email address
        </button>
      </div>

      {/* Back */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>
      </div>
    </div>
  );
}
