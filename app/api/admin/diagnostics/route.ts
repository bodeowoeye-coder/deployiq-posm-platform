import { NextResponse } from "next/server";
import { accessControlErrorResponse, requireAdmin } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    // Intentionally uses service role for platform diagnostics after explicit admin auth check.
    const supabase = createAdminSupabase();
    const { count, error: countError } = await supabase
      .from("submissions")
      .select("*", { count: "exact", head: true });

    if (countError) {
      return NextResponse.json(
        {
          ok: false,
          stage: "submissions_count",
          error: countError.message
        },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from("submissions")
      .select("id, installer_name, brand_name, status, submitted_at")
      .order("submitted_at", { ascending: false })
      .limit(5);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          stage: "recent_rows",
          error: error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      submissionCount: count ?? 0,
      recentSubmissions: data ?? []
    });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(
      {
        ok: false,
        stage: "configuration",
        error: payload.error
      },
      { status }
    );
  }
}
