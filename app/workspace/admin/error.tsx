"use client";

import { useEffect } from "react";
import { SignOutButton } from "@/components/SignOutButton";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function CustomerWorkspaceError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[customer-workspace-error]", {
      route: "/workspace/admin",
      name: error.name,
      message: error.message,
      digest: error.digest ?? null,
    });
  }, [error]);

  const transient = error.name === "CustomerWorkspaceTransientError";

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
        <div
          className={transient ? "mx-auto mb-4 h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-[var(--accent)] motion-safe:animate-spin" : "mx-auto mb-4 h-10 w-10 rounded-full border border-amber-200 bg-amber-50"}
          aria-hidden="true"
        />
        <h1 className="text-xl font-bold">
          {transient ? "We're having trouble opening your workspace." : "We couldn't open this workspace."}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {transient
            ? "Please try again. Your account and workspace have not been changed."
            : "Your account does not currently have access to this workspace."}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            Try Again
          </button>
          <SignOutButton className="min-h-11 rounded-lg px-4 text-sm" />
        </div>
      </section>
    </main>
  );
}
