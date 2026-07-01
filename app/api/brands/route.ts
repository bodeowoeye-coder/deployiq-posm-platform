import { NextResponse } from "next/server";
import { accessControlErrorResponse, getAuthenticatedUserContext } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getAuthenticatedUserContext();
    const supabase = createAdminSupabase();
    let query = supabase.from("brands").select("id, brand_name").order("brand_name", { ascending: true });
    if (context.role === "client" && context.client_id) {
      query = query.eq("client_id", context.client_id);
    }
    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ brands: data ?? [] });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
