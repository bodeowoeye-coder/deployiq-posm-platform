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
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    console.info("[login] submit");

    try {
      const configResponse = await fetch("/api/auth/public-config", {
        cache: "no-store",
        credentials: "include"
      });

      if (!configResponse.ok) {
        throw new Error("Could not load login configuration.");
      }

      const config = (await configResponse.json()) as { url: string; anonKey: string };
      const supabase = createBrowserSupabase(config);
      const loginEmail = email.trim().toLowerCase();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: loginEmail, password });

      if (signInError || !data?.session) {
        throw new Error("Invalid email or password");
      }
      console.info("[login] supabase success");

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

      if (!response.ok) {
        throw new Error("Could not create app session.");
      }

      const verificationResponse = await fetch(`/api/auth/session${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`, {
        cache: "no-store",
        credentials: "include"
      });

      const verifiedSession = (await verificationResponse.json()) as { authenticated: boolean; redirectTo?: string; reason?: string };
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
      console.info("[login] redirect target", { redirectTo });
      window.history.replaceState(null, "", redirectTo);
      router.replace(redirectTo);
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Could not sign in.";
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
