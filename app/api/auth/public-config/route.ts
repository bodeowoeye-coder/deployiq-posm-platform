import { NextResponse } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/supabaseEnv";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getPublicSupabaseConfig();
    const response = NextResponse.json(config);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("[auth-public-config] unavailable", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json({ error: "Public auth configuration unavailable." }, { status: 500 });
  }
}
