"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { createBrowserSupabase } from "@/lib/supabaseClient";

type PublicSupabaseConfig = { url: string; anonKey: string };
const WORKSPACE_OPEN_TIMEOUT_MS = 12_000;
const MAX_WORKSPACE_OPEN_ATTEMPTS = 3;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState("");
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [intendedOnboardingUserId, setIntendedOnboardingUserId] = useState<string | null>(null);
  const [accountMismatch, setAccountMismatch] = useState<{ currentUserId: string; currentEmail: string | null; intendedUserId: string } | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicSupabaseConfig | null>(null);
  const [openingTrouble, setOpeningTrouble] = useState(false);
  const [hasCompletedInitialWorkspaceLoad, setHasCompletedInitialWorkspaceLoad] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();
  const loginInProgressRef = useRef(false);
  const pendingWorkspaceDestinationRef = useRef<string | null>(null);
  const workspaceOpenAttemptRef = useRef(0);
  const overlayVisibleRef = useRef(false);
  const recentDiagnosticKeysRef = useRef<Map<string, number>>(new Map());

  function logLoginDiagnostic(stage: string, extra: Record<string, unknown> = {}) {
    if (typeof window === "undefined") return;
    const diagnosticKey = `${stage}:${JSON.stringify(extra)}`;
    const diagnosticNow = Date.now();
    const previousDiagnosticAt = recentDiagnosticKeysRef.current.get(diagnosticKey) ?? 0;
    if (diagnosticNow - previousDiagnosticAt < 750) return;
    recentDiagnosticKeysRef.current.set(diagnosticKey, diagnosticNow);
    for (const [key, timestamp] of recentDiagnosticKeysRef.current) {
      if (diagnosticNow - timestamp > 5_000) recentDiagnosticKeysRef.current.delete(key);
    }

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

    if (process.env.NODE_ENV !== "development") return;

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

  function logWorkspaceOverlay(action: "SHOW" | "HIDE", reason: string) {
    if (typeof window === "undefined") return;
    console.info("[workspace-overlay]", {
      action,
      reason,
      pathname: window.location.pathname,
    });
  }

  function isSafeInternalDestination(destination: unknown): destination is string {
    if (typeof destination !== "string") return false;
    if (!destination.startsWith("/") || destination.startsWith("//")) return false;
    try {
      const url = new URL(destination, window.location.origin);
      return url.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  function logLoginNavigation(input: {
    sessionPostOk: boolean;
    responseRedirectTo: unknown;
    resolvedDestination: string | null;
    navigationMethod: string | null;
    navigationStarted: boolean;
  }) {
    if (process.env.NODE_ENV !== "development") return;
    console.info("[login-navigation]", input);
  }

  function openWorkspaceDestination(destination: string, source: string) {
    pendingWorkspaceDestinationRef.current = destination;
    workspaceOpenAttemptRef.current += 1;
    setOpeningTrouble(false);
    setIsRedirecting(true);
    console.info("[login-timing]", {
      stage: "workspace-open-attempt",
      source,
      redirectTo: destination,
      attempt: workspaceOpenAttemptRef.current,
      maxAttempts: MAX_WORKSPACE_OPEN_ATTEMPTS,
    });
    router.replace(destination);
  }

  async function signOutAfterOpeningTrouble() {
    setIsSubmitting(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "include", cache: "no-store" });
    } finally {
      router.replace("/login?loggedOut=1");
    }
  }

  function classifySignInError(error: unknown) {
    const status = typeof error === "object" && error && "status" in error
      ? (error as { status?: number }).status
      : null;
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "").toLowerCase()
      : "";

    if (message.includes("email not confirmed")) return "email_not_confirmed";
    if (status === 400 && message.includes("invalid")) return "invalid_credentials";
    if (status === 422 && message.includes("not found")) return "auth_user_not_found";
    if (message.includes("fetch") || message.includes("project")) return "wrong_supabase_project";
    return error ? "credential_write_failed" : null;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mountStart = performance.now();
    console.info("[login-timing]", {
      stage: "login-page-mounted",
      href: window.location.href,
      viewport: `${window.innerWidth}x${window.innerHeight}`
    });
    const searchParams = new URLSearchParams(window.location.search);
    const loggedOut = searchParams.get("loggedOut") === "1";
    const nextReturnTo = searchParams.get("returnTo");
    const nextIdentityConfirmed = searchParams.get("identityConfirmed") === "1";
    const nextOnboardingUserId = searchParams.get("onboardingUserId");
    setReturnTo(nextReturnTo);
    setIdentityConfirmed(nextIdentityConfirmed);
    setIntendedOnboardingUserId(nextOnboardingUserId);
    const cleanParams = new URLSearchParams();
    if (nextReturnTo) cleanParams.set("returnTo", nextReturnTo);
    if (nextIdentityConfirmed) cleanParams.set("identityConfirmed", "1");
    if (nextOnboardingUserId) cleanParams.set("onboardingUserId", nextOnboardingUserId);
    window.history.replaceState(null, "", cleanParams.size > 0 ? `/login?${cleanParams.toString()}` : "/login");

    const publicConfigStart = performance.now();
    fetch("/api/auth/public-config", {
      cache: "no-store",
      credentials: "include"
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load login configuration.");
        return (await response.json()) as PublicSupabaseConfig;
      })
      .then((config) => {
        setPublicConfig(config);
        console.info("[login-timing]", {
          stage: "public-config-prefetch",
          ok: Boolean(config.url && config.anonKey),
          durationMs: timingMs(publicConfigStart)
        });
      })
      .catch((configError) => {
        console.info("[login-timing]", {
          stage: "public-config-prefetch-error",
          message: configError instanceof Error ? configError.message : "Unknown error",
          durationMs: timingMs(publicConfigStart)
        });
      });

    if (loggedOut) {
      console.info("[login-timing]", { stage: "logged-out-login-page", durationMs: timingMs(mountStart) });
      window.history.replaceState(null, "", "/login");
      return;
    }

    const existingSessionStart = performance.now();
    fetch(`/api/auth/session${nextReturnTo ? `?returnTo=${encodeURIComponent(nextReturnTo)}` : ""}`, { cache: "no-store", credentials: "include" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((session) => {
        if (loginInProgressRef.current) return;
        console.info("[login-timing]", {
          stage: "existing-session-check",
          authenticated: Boolean(session?.authenticated),
          currentSessionUserId: session?.userId ?? null,
          intendedOnboardingUserId: nextOnboardingUserId ?? null,
          sessionMatchesOnboardingUser: Boolean(session?.userId && nextOnboardingUserId && session.userId === nextOnboardingUserId),
          redirectTo: session?.redirectTo ?? null,
          redirectReason: session?.redirectTo?.includes("/login/create-password") ? "password_change_required" : "existing_session",
          durationMs: timingMs(existingSessionStart)
        });
        if (
          nextIdentityConfirmed
          && nextOnboardingUserId
          && session?.authenticated
          && typeof session.userId === "string"
          && session.userId !== nextOnboardingUserId
        ) {
          setAccountMismatch({ currentUserId: session.userId, currentEmail: session.email ?? null, intendedUserId: nextOnboardingUserId });
          setIsRedirecting(false);
          return;
        }
        if (session?.authenticated && session.redirectTo) {
          console.info("[login] existing session redirect", { redirectTo: session.redirectTo });
          if (!hasCompletedInitialWorkspaceLoad) setIsRedirecting(true);
          router.replace(session.redirectTo);
        }
      })
      .catch((sessionError) => {
        console.info("[login-timing]", {
          stage: "existing-session-check-error",
          message: sessionError instanceof Error ? sessionError.message : "Unknown error",
          durationMs: timingMs(existingSessionStart)
        });
      });
  }, [router]);

  useEffect(() => {
    const overlayVisible = (isSubmitting || isRedirecting || openingTrouble) && !hasCompletedInitialWorkspaceLoad;
    if (overlayVisible === overlayVisibleRef.current) return;
    overlayVisibleRef.current = overlayVisible;
    logWorkspaceOverlay(overlayVisible ? "SHOW" : "HIDE", openingTrouble ? "opening-trouble" : isRedirecting ? "login-transition" : "login-idle");
  }, [hasCompletedInitialWorkspaceLoad, isRedirecting, isSubmitting, openingTrouble]);

  useEffect(() => {
    if (hasCompletedInitialWorkspaceLoad || !isRedirecting || !pendingWorkspaceDestinationRef.current) return;
    const timer = window.setTimeout(() => {
      const destination = pendingWorkspaceDestinationRef.current;
      if (!destination) return;
      if (workspaceOpenAttemptRef.current < MAX_WORKSPACE_OPEN_ATTEMPTS) {
        openWorkspaceDestination(destination, "bounded-retry");
        return;
      }
      console.warn("[login-timing]", {
        stage: "workspace-open-timeout",
        redirectTo: destination,
        attempts: workspaceOpenAttemptRef.current,
        terminalState: "retry_screen",
      });
      loginInProgressRef.current = false;
      setIsSubmitting(false);
      setIsRedirecting(false);
      setOpeningTrouble(true);
      setError("We're having trouble opening your workspace.");
    }, WORKSPACE_OPEN_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [hasCompletedInitialWorkspaceLoad, isRedirecting]);

  async function handleSignOutMismatch() {
    setIsSubmitting(true);
    setError("");
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "include", cache: "no-store" });
      if (publicConfig) {
        await createBrowserSupabase(publicConfig).auth.signOut();
      }
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("deployiq:onboarding-resume-token");
        window.sessionStorage.removeItem("deployiq:onboarding-resume-token");
      }
      setAccountMismatch(null);
      setIsSubmitting(false);
      const params = new URLSearchParams();
      if (returnTo) params.set("returnTo", returnTo);
      if (identityConfirmed) params.set("identityConfirmed", "1");
      if (intendedOnboardingUserId) params.set("onboardingUserId", intendedOnboardingUserId);
      router.replace(params.size > 0 ? `/login?${params.toString()}` : "/login");
    } catch {
      setError("Could not sign out of the current session. Please refresh and try again.");
      setIsSubmitting(false);
    }
  }

  function continueAsCurrentAccount() {
    router.replace(returnTo || "/workspace/admin");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    logLoginDiagnostic("submit-received");
    if (isSubmitting) {
      logLoginDiagnostic("submit-ignored-already-submitting");
      return;
    }
    loginInProgressRef.current = true;
    pendingWorkspaceDestinationRef.current = null;
    workspaceOpenAttemptRef.current = 0;
    setHasCompletedInitialWorkspaceLoad(false);
    setOpeningTrouble(false);
    setIsSubmitting(true);
    setIsRedirecting(true);
    setError("");
    console.info("[login] submit", { emailPresent: Boolean(email.trim()), passwordPresent: Boolean(password), online: typeof navigator !== "undefined" ? navigator.onLine : null });
    const totalStart = performance.now();
    let didStartRedirect = false;

    try {
      const publicConfigStart = performance.now();
      logLoginDiagnostic("public-config-fetch-start");
      let config = publicConfig;
      if (!config) {
        config = await fetch("/api/auth/public-config", {
          cache: "no-store",
          credentials: "include"
        }).then(async (configResponse) => {
          logLoginDiagnostic("public-config-fetch-complete", { status: configResponse.status, ok: configResponse.ok, durationMs: timingMs(publicConfigStart) });
          if (!configResponse.ok) throw new Error("Could not load login configuration.");
          return (await configResponse.json()) as PublicSupabaseConfig;
        });
      } else {
        logLoginDiagnostic("public-config-cache-hit", { durationMs: timingMs(publicConfigStart) });
      }
      if (!config?.url || !config.anonKey) {
        throw new Error("Could not load login configuration.");
      }
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
        errorClassification: classifySignInError(signInError),
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
          refreshToken: data.session.refresh_token,
          returnTo
        })
      });

      const sessionBody = (await response.json().catch(() => null)) as { authenticated?: boolean; redirectTo?: string; error?: string } | null;
      const responseRedirectTo = sessionBody?.redirectTo ?? null;
      logLoginDiagnostic("app-session-post-complete", {
        status: response.status,
        ok: response.ok,
        responseRedirectTo,
        durationMs: timingMs(sessionCreateStart)
      });
      if (!response.ok) {
        logLoginNavigation({
          sessionPostOk: false,
          responseRedirectTo,
          resolvedDestination: null,
          navigationMethod: null,
          navigationStarted: false,
        });
        throw new Error(sessionBody?.error || "Could not create app session.");
      }

      if (!sessionBody?.authenticated) {
        logLoginNavigation({
          sessionPostOk: true,
          responseRedirectTo,
          resolvedDestination: null,
          navigationMethod: null,
          navigationStarted: false,
        });
        throw new Error(sessionBody?.error || "App session was not accepted. Please try again.");
      }

      if (!isSafeInternalDestination(responseRedirectTo)) {
        logLoginNavigation({
          sessionPostOk: true,
          responseRedirectTo,
          resolvedDestination: null,
          navigationMethod: null,
          navigationStarted: false,
        });
        throw new Error("Sign in succeeded, but DeployIQ could not determine where to send you. Please try again.");
      }

      const redirectTo = responseRedirectTo;
      showToast("Signed in successfully.");
      didStartRedirect = true;
      const redirectStart = performance.now();
      logLoginNavigation({
        sessionPostOk: true,
        responseRedirectTo,
        resolvedDestination: redirectTo,
        navigationMethod: "router.replace",
        navigationStarted: true,
      });
      console.info("[login-timing]", {
        stage: "redirect-start",
        redirectTo,
        redirectPreparationMs: timingMs(redirectStart),
        totalLoginMs: timingMs(totalStart)
      });
      openWorkspaceDestination(redirectTo, "session-created");
    } catch (loginError) {
      loginInProgressRef.current = false;
      const message = loginError instanceof Error ? loginError.message : "Could not sign in.";
      logLoginDiagnostic("login-error", {
        message,
        errorName: loginError instanceof Error ? loginError.name : null
      });
      setError(message);
      showToast(message, "error");
    } finally {
      if (!didStartRedirect) {
        setIsSubmitting(false);
        setIsRedirecting(false);
      }
    }
  }

  return (
    <main className="min-h-[100dvh] bg-white text-slate-950 lg:flex">
      {/* Left side - Login form */}
      <div className="flex flex-col lg:w-1/2 lg:flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 lg:border-b-0 lg:border-r">
          <BrandMark />
          <ThemeToggle />
        </header>

        <section className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-8 md:px-10 lg:px-12">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-3xl font-bold leading-tight">Sign in</h1>
            <p className="mt-2 text-sm text-slate-600">
              {identityConfirmed
                ? "Your email has been confirmed. Sign in to continue setting up your DeployIQ workspace."
                : "Access your DeployIQ workspace."}
            </p>

            {accountMismatch ? (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold text-amber-900">You&apos;re currently signed in as:</p>
                <p className="mt-1 font-mono text-xs">{accountMismatch.currentEmail ?? accountMismatch.currentUserId}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={continueAsCurrentAccount}
                    disabled={isSubmitting}
                    className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                  >
                    Continue as this account
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOutMismatch}
                    disabled={isSubmitting}
                    className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    Switch accounts
                  </button>
                </div>
              </div>
            ) : null}

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
                disabled={isSubmitting || isRedirecting}
                onClick={() => logLoginDiagnostic("sign-in-button-click")}
                type="submit"
              >
                {isRedirecting ? "Opening workspace..." : isSubmitting ? "Signing in..." : "Sign in"}
              </button>
              <a href="/login" className="text-center text-sm font-medium text-orange-600 hover:text-orange-700">
                Forgot Password?
              </a>
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
      {(isSubmitting || isRedirecting || openingTrouble) && !hasCompletedInitialWorkspaceLoad ? (
        <div className="fixed inset-0 z-50 grid min-h-[100dvh] place-items-center overflow-hidden bg-white/95 px-6 text-center backdrop-blur-sm" aria-busy={!openingTrouble} aria-live="polite">
          <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            {openingTrouble ? (
              <>
                <div className="mx-auto mb-3 h-9 w-9 rounded-full border border-amber-200 bg-amber-50" aria-hidden="true" />
                <p className="text-sm font-bold text-slate-950">We&apos;re having trouble opening your workspace.</p>
                <p className="mt-1 text-xs leading-snug text-slate-500">Please try again. Your account and workspace have not been changed.</p>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const destination = pendingWorkspaceDestinationRef.current || returnTo || "/workspace/admin";
                      loginInProgressRef.current = true;
                      openWorkspaceDestination(destination, "manual-retry");
                    }}
                    className="min-h-10 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={signOutAfterOpeningTrouble}
                    className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto mb-3 h-9 w-9 rounded-full border-[3px] border-slate-200 border-t-[var(--accent)] motion-safe:animate-spin" aria-hidden="true" />
                <p className="text-sm font-bold text-slate-950">Opening workspace...</p>
                <p className="mt-1 text-xs leading-snug text-slate-500">Please hold on while DeployIQ loads your workspace.</p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
