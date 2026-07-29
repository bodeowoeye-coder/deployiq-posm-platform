import { createAdminSupabase } from "@/lib/supabaseAdmin";

export async function upsertPlatformProvisioningContext(input: {
  organisationName: string;
  contactPerson: string;
  businessEmail: string;
  phoneNumber: string;
  country: string;
  userId?: string | null;
}) {
  const adminSupabase = createAdminSupabase();
  const { data: existingClient, error: clientLookupError } = await adminSupabase
    .from("clients")
    .select("id")
    .ilike("name", input.organisationName)
    .maybeSingle();

  if (clientLookupError) throw clientLookupError;

  if (existingClient?.id) {
    return { organisationId: existingClient.id, created: false };
  }

  const { data, error } = await adminSupabase
    .from("clients")
    .insert({
      name: input.organisationName,
      status: "Active"
    })
    .select("id")
    .single();

  if (error) throw error;
  return { organisationId: data.id, created: true };
}
