import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminEnterpriseHierarchyPage() {
  await requireRole(["admin"], "/admin/enterprise");

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-8 text-[var(--text-primary)] sm:px-6">
      <div className="mx-auto max-w-4xl rounded-xl border border-[var(--border-soft)] bg-[var(--card-bg)] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Enterprise Hierarchy Foundation</p>
        <h1 className="mt-2 text-2xl font-semibold">Business Units and Portfolios</h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Administration endpoints are prepared for Business Units and Portfolios. Full management UX is intentionally deferred until Sprint 2.
        </p>
      </div>
    </main>
  );
}
