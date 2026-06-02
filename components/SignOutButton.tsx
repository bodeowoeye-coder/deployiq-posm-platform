"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton({ className = "" }: { className?: string }) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const router = useRouter();

  const clearBrowserAuthStorage = () => {
    const clearStorage = (storage: Storage) => {
      const keysToRemove: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        const normalizedKey = key.toLowerCase();
        if (normalizedKey.startsWith("sb-") || normalizedKey.includes("supabase") || normalizedKey.includes("auth-token")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => storage.removeItem(key));
    };

    try {
      clearStorage(window.localStorage);
      clearStorage(window.sessionStorage);
    } catch {
      // Storage can be unavailable in private browsing modes; server logout still clears cookies.
    }
  };

  const onClick = async () => {
    if (isSigningOut) return;
    if (typeof window !== "undefined") {
      setIsSigningOut(true);
      clearBrowserAuthStorage();
      try {
        await fetch("/api/auth/session", {
          method: "DELETE",
          cache: "no-store",
          credentials: "include"
        });
        console.info("[logout] success");
      } catch {
        // The dedicated logout route performs the final cookie cleanup.
        console.info("[logout] session delete failed; continuing to login");
      } finally {
        router.replace("/login?loggedOut=1");
      }
    }
  };

  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-[#FF8A3D] px-4 text-sm font-bold text-white shadow-sm shadow-orange-950/20 transition hover:from-orange-600 hover:to-orange-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-wait disabled:opacity-80",
        className
      ].join(" ") as string}
      disabled={isSigningOut}
      type="button"
    >
      {isSigningOut ? "Signing out..." : "Sign out"}
    </button>
  );
}
