"use client";

import { FormEvent, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { createBrowserSupabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { showToast } = useToast();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const supabase = createBrowserSupabase();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError || !data.session) {
        throw new Error(signInError?.message || "Could not sign in.");
      }

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

      showToast("Signed in successfully.");
      window.location.assign("/portal");
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Could not sign in.";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:py-10">
      <div className="mx-auto flex max-w-5xl justify-end">
        <ThemeToggle />
      </div>
      <section className="mx-auto mt-8 max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 p-6">
          <BrandMark />
        </div>
        <div className="p-6">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Access your deployment dashboard.</p>

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm font-semibold">
            Email
            <input className="min-h-11 rounded-lg border border-slate-200 px-3 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Password
            <input className="min-h-11 rounded-lg border border-slate-200 px-3 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error ? <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
          <button className="min-h-11 rounded-lg bg-slate-950 px-4 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        </div>
      </section>
    </main>
  );
}
