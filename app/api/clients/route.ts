import { NextResponse } from "next/server";
import { accessControlErrorResponse, requireAdmin } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { cleanString } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const [{ data: clients, error: clientsError }, { data: profiles, error: profilesError }, { data: roles, error: rolesError }] = await Promise.all([
      createAdminSupabase().from("clients").select("*").order("name"),
      createAdminSupabase().from("client_profiles").select("*"),
      createAdminSupabase().from("user_roles").select("user_id, role, client_id").eq("role", "client")
    ]);
    console.info("[clients-api] clients loaded for admin", {
      clients: clients?.length ?? 0,
      profiles: profiles?.length ?? 0,
      clientRoleAssignments: roles?.length ?? 0,
      clientsError: clientsError?.message ?? null,
      profilesError: profilesError?.message ?? null,
      rolesError: rolesError?.message ?? null
    });
    if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });
    return NextResponse.json({ clients: clients ?? [], profiles: profiles ?? [] });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const name = cleanString(body.name);
    const status = cleanString(body.status) === "Inactive" ? "Inactive" : "Active";
    if (!name) return NextResponse.json({ error: "Client company name is required." }, { status: 400 });
    const supabase = createAdminSupabase();

    let clientResult = await supabase.from("clients").insert({ name, status }).select().single();
    if (clientResult.error?.code === "42703") {
      clientResult = await supabase.from("clients").insert({ name }).select().single();
    }
    if (clientResult.error) {
      const duplicate = clientResult.error.code === "23505";
      return NextResponse.json(
        { error: duplicate ? "A client company with this name already exists." : clientResult.error.message },
        { status: duplicate ? 409 : 500 }
      );
    }

    const profilePayload = {
      client_id: clientResult.data.id,
      contact_person: cleanString(body.contactPerson) || null,
      email: cleanString(body.email) || null,
      phone: cleanString(body.phone) || null,
      industry_category: cleanString(body.industryCategory) || null
    };
    let profileResult = await supabase
      .from("client_profiles")
      .upsert(profilePayload)
      .select()
      .single();
    if (profileResult.error?.code === "42703") {
      const { industry_category: _industryCategory, ...fallbackProfilePayload } = profilePayload;
      profileResult = await supabase
        .from("client_profiles")
        .upsert(fallbackProfilePayload)
        .select()
        .single();
    }
    if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500 });
    return NextResponse.json({ client: clientResult.data, profile: profileResult.data });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const clientId = cleanString(body.clientId);
    if (!clientId) return NextResponse.json({ error: "Missing client id." }, { status: 400 });
    const supabase = createAdminSupabase();
    const name = cleanString(body.name);
    const status = cleanString(body.status) === "Inactive" ? "Inactive" : "Active";
    let client = null;
    if (name) {
      let clientResult = await supabase
        .from("clients")
        .update({ name, status })
        .eq("id", clientId)
        .select()
        .single();
      if (clientResult.error?.code === "42703") {
        clientResult = await supabase
          .from("clients")
          .update({ name })
          .eq("id", clientId)
          .select()
          .single();
      }
      if (clientResult.error) return NextResponse.json({ error: clientResult.error.message }, { status: 500 });
      client = clientResult.data;
    }

    const profilePayload = {
      client_id: clientId,
      contact_person: cleanString(body.contactPerson) || null,
      email: cleanString(body.email) || null,
      phone: cleanString(body.phone) || null,
      industry_category: cleanString(body.industryCategory) || null,
      updated_at: new Date().toISOString()
    };
    let profileResult = await supabase
      .from("client_profiles")
      .upsert(profilePayload)
      .select()
      .single();
    if (profileResult.error?.code === "42703") {
      const { industry_category: _industryCategory, ...fallbackProfilePayload } = profilePayload;
      profileResult = await supabase
        .from("client_profiles")
        .upsert(fallbackProfilePayload)
        .select()
        .single();
    }
    if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500 });
    return NextResponse.json({ client, profile: profileResult.data });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const clientId = cleanString(searchParams.get("clientId"));
    if (!clientId) return NextResponse.json({ error: "Missing client id." }, { status: 400 });

    const supabase = createAdminSupabase();
    const [{ count: projectCount, error: projectError }, { count: userCount, error: userError }, { count: submissionCount, error: submissionError }] = await Promise.all([
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("client_id", clientId),
      supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", clientId)
    ]);

    const countError = projectError || userError || submissionError;
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    const linkedRecords = (projectCount ?? 0) + (userCount ?? 0) + (submissionCount ?? 0);
    if (linkedRecords > 0) {
      return NextResponse.json(
        { error: "This client has linked records. Archive it instead to preserve history." },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true, clientId });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
