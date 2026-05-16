"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await createBrowserSupabase().auth.signOut();
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" onClick={handleSignOut}>
      Sign out
    </button>
  );
}
