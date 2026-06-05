import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { cleanString, requireAdminContext } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
}

export async function POST(request: Request) {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json();
  const name = cleanString(body.name);
  if (!name) return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  const supabase = createAdminSupabase();
  const { data: client, error } = await supabase.from("clients").insert({ name }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: profile } = await supabase
    .from("client_profiles")
    .upsert({
      client_id: client.id,
      contact_person: cleanString(body.contactPerson) || null,
      email: cleanString(body.email) || null,
      phone: cleanString(body.phone) || null
    })
    .select()
    .single();
  return NextResponse.json({ client, profile });
}

export async function PATCH(request: Request) {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json();
  const clientId = cleanString(body.clientId);
  if (!clientId) return NextResponse.json({ error: "Missing client id." }, { status: 400 });
  const { data, error } = await createAdminSupabase()
    .from("client_profiles")
    .upsert({
      client_id: clientId,
      contact_person: cleanString(body.contactPerson) || null,
      email: cleanString(body.email) || null,
      phone: cleanString(body.phone) || null,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
