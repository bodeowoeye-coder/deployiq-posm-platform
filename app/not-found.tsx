import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <section className="mx-auto max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 p-6">
          <BrandMark />
        </div>
        <div className="p-6">
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="mt-2 text-sm text-slate-600">This DeployIQ page does not exist or is no longer available.</p>
          <Link
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            href="/portal"
          >
            Return to portal
          </Link>
        </div>
      </section>
    </main>
  );
}
