"use client";

import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

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
    <main className="min-h-screen bg-slate-50 text-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <BrandMark />
        <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ</p>
        <h1 className="mt-2 text-3xl font-semibold">{isRecoveringChunk ? "Refreshing DeployIQ..." : "DeployIQ needs a moment"}</h1>
        <p className="mt-3 text-sm text-slate-600">
          {isRecoveringChunk
            ? "A stale app file was detected. DeployIQ is refreshing this page once."
            : "The app encountered an error while loading. Please try again or return to the login screen."}
        </p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Details</p>
          <pre className="mt-2 max-h-40 overflow-auto text-xs leading-5 text-slate-700">{error.message}</pre>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/login" className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
            Go to Login
          </a>
          <a href="/" className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50">
            Go to Home
          </a>
        </div>
      </div>
    </main>
  );
}
