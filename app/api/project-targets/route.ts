import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context || context.role.role !== "admin") return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json();
  const projectId = clean(body.projectId);
  const targetQuantity = Number(body.targetQuantity ?? 0);
  if (!projectId || !Number.isFinite(targetQuantity) || targetQuantity < 0) {
    return NextResponse.json({ error: "Project and valid quantity are required." }, { status: 400 });
  }
  const supabase = createAdminSupabase();
  const { data: target, error } = await supabase
    .from("project_targets")
    .insert({
      project_id: projectId,
      state: clean(body.state) || null,
      region: clean(body.region) || null,
      installer_name: clean(body.installerName) || null,
      agency_name: clean(body.agencyName) || null,
      target_quantity: targetQuantity
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ target });
}
