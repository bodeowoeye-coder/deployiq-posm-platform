import { AdminDashboard } from "@/components/AdminDashboard";
import { requireRole } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Submission, SubmissionStatusHistory } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireRole(["admin"]);
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const submissionIds = (data ?? []).map((item) => item.id);
  const { data: history } =
    submissionIds.length > 0
      ? await supabase
          .from("submission_status_history")
          .select("*")
          .in("submission_id", submissionIds)
          .order("created_at", { ascending: false })
      : { data: [] };

  return <AdminDashboard submissions={(data ?? []) as Submission[]} history={(history ?? []) as SubmissionStatusHistory[]} />;
}
