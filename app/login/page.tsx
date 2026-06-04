"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { createBrowserSupabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  function logLoginDiagnostic(stage: string, extra: Record<string, unknown> = {}) {
    if (typeof window === "undefined") return;

    const payload = {
      stage,
      emailPresent: Boolean(email.trim()),
      passwordPresent: Boolean(password),
      isSubmitting,
      publicConfigLoaded: extra.publicConfigLoaded,
      href: window.location.href,
      userAgent: window.navigator.userAgent,
      online: window.navigator.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      ...extra
    };

    console.info("[login] diagnostic", payload);

    fetch("/api/auth/login-diagnostics", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch((diagnosticError) => {
      console.warn("[login] diagnostic post failed", diagnosticError);
    });
  }

  function timingMs(start: number) {
    return Math.round((performance.now() - start) * 10) / 10;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const loggedOut = searchParams.get("loggedOut") === "1";
    const nextReturnTo = searchParams.get("returnTo");
    setReturnTo(nextReturnTo);
    window.history.replaceState(null, "", nextReturnTo ? `/login?returnTo=${encodeURIComponent(nextReturnTo)}` : "/login");

    if (loggedOut) {
      window.history.replaceState(null, "", "/login");
      return;
    }

    fetch(`/api/auth/session${nextReturnTo ? `?returnTo=${encodeURIComponent(nextReturnTo)}` : ""}`, { cache: "no-store", credentials: "include" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((session) => {
        if (session?.authenticated && session.redirectTo) {
          console.info("[login] existing session redirect", { redirectTo: session.redirectTo });
          router.replace(session.redirectTo);
        }
      })
      .catch(() => null);
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    logLoginDiagnostic("submit-received");
    if (isSubmitting) {
      logLoginDiagnostic("submit-ignored-already-submitting");
      return;
    }
    setIsSubmitting(true);
    setError("");
    console.info("[login] submit", { emailPresent: Boolean(email.trim()), passwordPresent: Boolean(password), online: typeof navigator !== "undefined" ? navigator.onLine : null });
    const totalStart = performance.now();

    try {
      const publicConfigStart = performance.now();
      logLoginDiagnostic("public-config-fetch-start");
      const configResponse = await fetch("/api/auth/public-config", {
        cache: "no-store",
        credentials: "include"
      });
      logLoginDiagnostic("public-config-fetch-complete", { status: configResponse.status, ok: configResponse.ok, durationMs: timingMs(publicConfigStart) });

      if (!configResponse.ok) {
        throw new Error("Could not load login configuration.");
      }

      const config = (await configResponse.json()) as { url: string; anonKey: string };
      logLoginDiagnostic("public-config-json-parsed", {
        publicConfigLoaded: Boolean(config.url && config.anonKey),
        supabaseUrlHost: config.url ? new URL(config.url).host : null,
        anonKeyPresent: Boolean(config.anonKey)
      });
      const supabase = createBrowserSupabase(config);
      const loginEmail = email.trim().toLowerCase();
      const signInStart = performance.now();
      logLoginDiagnostic("supabase-signin-start", { emailDomain: loginEmail.includes("@") ? loginEmail.split("@").pop() : null });
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      logLoginDiagnostic("supabase-signin-complete", {
        durationMs: timingMs(signInStart),
        hasSession: Boolean(data?.session),
        hasUser: Boolean(data?.user),
        errorMessage: signInError?.message ?? null,
        errorName: signInError?.name ?? null,
        errorStatus: "status" in (signInError ?? {}) ? (signInError as { status?: number }).status ?? null : null
      });

      if (signInError || !data?.session) {
        throw new Error("Invalid email or password");
      }
      console.info("[login] supabase success");

      const sessionCreateStart = performance.now();
      logLoginDiagnostic("app-session-post-start");
      const response = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token
        })
      });
      logLoginDiagnostic("app-session-post-complete", { status: response.status, ok: response.ok, durationMs: timingMs(sessionCreateStart) });

      if (!response.ok) {
        throw new Error("Could not create app session.");
      }

      const roleLookupStart = performance.now();
      logLoginDiagnostic("app-session-verify-start");
      const verificationResponse = await fetch(`/api/auth/session${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`, {
        cache: "no-store",
        credentials: "include"
      });

      const verifiedSession = (await verificationResponse.json()) as { authenticated: boolean; redirectTo?: string; reason?: string };
      logLoginDiagnostic("app-session-verify-complete", {
        durationMs: timingMs(roleLookupStart),
        status: verificationResponse.status,
        ok: verificationResponse.ok,
        authenticated: verifiedSession.authenticated,
        redirectTo: verifiedSession.redirectTo ?? null,
        reason: verifiedSession.reason ?? null
      });
      if (!verificationResponse.ok) {
        throw new Error(
          verifiedSession.reason === "access_cookie_missing"
            ? "App session cookie was not saved. Please try again."
            : verifiedSession.reason === "role_or_user_context_unavailable"
            ? "User exists but no app role/profile found."
            : "App session was not accepted. Please try again."
        );
      }

      if (!verifiedSession.authenticated) {
        throw new Error(
          verifiedSession.reason === "role_or_user_context_unavailable"
            ? "User exists but no app role/profile found."
            : "App session was not accepted. Please try again."
        );
      }

      const redirectTo = verifiedSession.redirectTo || "/portal";
      showToast("Signed in successfully.");
      const redirectStart = performance.now();
      console.info("[login-timing]", {
        redirectTo,
        redirectPreparationMs: timingMs(redirectStart),
        totalLoginMs: timingMs(totalStart)
      });
      window.history.replaceState(null, "", redirectTo);
      router.replace(redirectTo);
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Could not sign in.";
      logLoginDiagnostic("login-error", {
        message,
        errorName: loginError instanceof Error ? loginError.name : null,
        errorStack: loginError instanceof Error ? loginError.stack : null
      });
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-slate-950 lg:flex">
      {/* Left side - Login form */}
      <div className="flex flex-col lg:w-1/2 lg:flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 lg:border-b-0 lg:border-r">
          <BrandMark />
          <ThemeToggle />
        </header>

        <section className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-8 md:px-10 lg:px-12">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-3xl font-bold leading-tight">Sign in</h1>
            <p className="mt-2 text-sm text-slate-600">Access your DeployIQ workspace.</p>

            <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-sm font-semibold">
                Email
                <input
                  className="min-h-11 rounded-lg border border-slate-200 px-3 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                  type="email"
                  name="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Password
                <input
                  className="min-h-11 rounded-lg border border-slate-200 px-3 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  autoCapitalize="none"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {error ? <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
              <button
                className="min-h-11 rounded-lg bg-slate-950 px-4 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                disabled={isSubmitting}
                onClick={() => logLoginDiagnostic("sign-in-button-click")}
                type="submit"
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* Right side - Hero image */}
      <div className="hidden overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-10 sm:px-8 md:px-10 lg:flex lg:w-1/2 lg:items-center lg:justify-center lg:px-12">
        <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/40 shadow-2xl shadow-slate-950/50">
          <img
            src="/deployiq-login-hero.png"
            alt="DeployIQ admin dashboard on laptop and installer mobile upload screen"
            className="h-auto w-full object-cover"
          />
        </div>
      </div>
    </main>
  );
}
