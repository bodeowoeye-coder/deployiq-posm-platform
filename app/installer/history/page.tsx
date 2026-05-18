import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { requireRole } from "@/lib/auth";
import { displayProjectName } from "@/lib/projects";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatStage(stage: string | null) {
  if (!stage) return "Installed";
  return stage
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function InstallerHistoryPage() {
  const context = await requireRole(["installer"]);
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("installer_user_id", context.user.id)
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(error.message);
  const submissions = (data ?? []) as Submission[];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-[min(760px,calc(100%-28px))] min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <BrandMark />
          <div className="flex min-w-0 flex-wrap gap-2">
            <ThemeToggle />
            <Link href="/submit" className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50">
              New upload
            </Link>
          </div>
        </div>
      </header>
      <section className="mx-auto w-[min(760px,calc(100%-28px))] py-6">
        <h1 className="text-2xl font-bold leading-snug sm:text-3xl">My uploads</h1>
        <p className="mt-2 text-sm leading-snug text-slate-600">Only your own submitted reports are shown here.</p>
        <div className="mt-5 grid gap-3">
          {submissions.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No uploads yet.</div>
          ) : null}
          {submissions.map((item) => (
            <article key={item.id} className="grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[88px_minmax(0,1fr)]">
              <div className="h-24 w-full overflow-hidden rounded-lg bg-slate-100 sm:h-20">
                <img src={item.image_url} alt={item.salon_name || "Uploaded board"} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="min-w-0 break-words text-sm font-bold leading-snug">{item.salon_name || "Name not visible"}</h2>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold">{item.status}</span>
                </div>
                <p className="mt-1 break-words text-xs leading-snug text-slate-500">Project: {displayProjectName(item.project_name)}</p>
                <p className="mt-1 break-words text-xs leading-snug text-slate-500">
                  Submitted: {item.installation_date ?? item.submitted_at.slice(0, 10)} {item.installation_time ?? ""}
                </p>
                <p className="mt-1 break-words text-xs leading-snug text-slate-500">Stage: {formatStage(item.deployment_stage_code)}</p>
                {item.rejection_reason ? <p className="mt-2 break-words text-xs leading-snug text-rose-700">Rejection reason: {item.rejection_reason}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
