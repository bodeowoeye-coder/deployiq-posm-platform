import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { cleanArray, cleanString, requireAdminContext } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data } = await createAdminSupabase().from("agencies").select("*").order("agency_name");
  return NextResponse.json({ agencies: data ?? [] });
}

export async function POST(request: Request) {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json();
  const agencyName = cleanString(body.agencyName);
  if (!agencyName) return NextResponse.json({ error: "Agency name is required." }, { status: 400 });
  const { data, error } = await createAdminSupabase()
    .from("agencies")
    .insert({
      agency_name: agencyName,
      contact_person: cleanString(body.contactPerson) || null,
      email: cleanString(body.email) || null,
      phone: cleanString(body.phone) || null,
      assigned_regions: cleanArray(body.assignedRegions),
      status: cleanString(body.status) || "Active"
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agency: data });
}

export async function PATCH(request: Request) {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json();
  const id = cleanString(body.id);
  if (!id) return NextResponse.json({ error: "Missing agency id." }, { status: 400 });
  const { data, error } = await createAdminSupabase()
    .from("agencies")
    .update({
      contact_person: cleanString(body.contactPerson) || null,
      email: cleanString(body.email) || null,
      phone: cleanString(body.phone) || null,
      assigned_regions: cleanArray(body.assignedRegions),
      status: cleanString(body.status) || "Active"
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agency: data });
}
