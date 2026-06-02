"use client";

import { useEffect, useMemo, useState } from "react";

type ErrorProps = {
  error: Error & {
    digest?: string;
    componentStack?: string;
    cause?: unknown;
  };
};

export default function Error({ error }: ErrorProps) {
  const [isRecoveringChunk, setIsRecoveringChunk] = useState(false);
  const isChunkLoadError = useMemo(() => {
    const message = error.message.toLowerCase();
    return message.includes("loading chunk") || message.includes("chunkloaderror") || message.includes("/_next/static/chunks/");
  }, [error.message]);

  useEffect(() => {
    const route = typeof window === "undefined" ? "server-render" : window.location.pathname;
    const diagnosticPayload = {
      route,
      name: error.name,
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      componentStack: error.componentStack,
      cause: error.cause,
      error
    };
    console.error("[global-error] app/error.tsx received exception", diagnosticPayload);
  }, [error]);

  useEffect(() => {
    if (!isChunkLoadError || typeof window === "undefined") return;
    const recoveryKey = `deployiq-chunk-recovery:${window.location.pathname}`;
    if (window.sessionStorage.getItem(recoveryKey) === "1") return;
    window.sessionStorage.setItem(recoveryKey, "1");
    setIsRecoveringChunk(true);
    window.location.reload();
  }, [isChunkLoadError]);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900/95 p-8 shadow-2xl">
        <h1 className="text-3xl font-semibold">{isRecoveringChunk ? "Refreshing app..." : "Something went wrong"}</h1>
        <p className="mt-3 text-sm text-slate-400">
          {isRecoveringChunk
            ? "A stale app file was detected. DeployIQ is refreshing this page once."
            : "The app encountered an error while loading. Please try again or return to the login screen."}
        </p>
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Error details</p>
          <pre className="mt-2 max-h-40 overflow-auto text-xs leading-5 text-slate-200">{error.message}</pre>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/login" className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
            Go to Login
          </a>
          <a href="/" className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500">
            Go to Home
          </a>
        </div>
      </div>
    </main>
  );
}
