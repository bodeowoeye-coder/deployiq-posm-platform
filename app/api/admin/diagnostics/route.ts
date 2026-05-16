import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
    return NextResponse.json(
      {
        ok: false,
        stage: "configuration",
        error: error instanceof Error ? error.message : "Unknown diagnostics error."
      },
      { status: 500 }
    );
  }
}
