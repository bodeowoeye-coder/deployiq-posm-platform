import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase.from("brands").select("id, brand_name").order("brand_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ brands: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load brands." },
      { status: 500 }
    );
  }
}
