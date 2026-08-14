import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";

export default function WorkspaceSessionExpiredPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 text-slate-950">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <BrandMark />
        <h1 className="mt-6 text-2xl font-bold">Your session has expired.</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Please sign in again.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a href="/login?returnTo=%2Fworkspace%2Fadmin" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">
            Sign In Again
          </a>
          <a href="/" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
            Return Home
          </a>
        </div>
      </section>
    </main>
  );
}
