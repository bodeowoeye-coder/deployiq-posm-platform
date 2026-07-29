import { createAdminSupabase } from "@/lib/supabaseAdmin";

export async function provisionRetailProduct(input: { organisationId: string; userId?: string | null; campaignName: string; projectName: string; brandName: string; capacity: number; productKey: string }) {
  const adminSupabase = createAdminSupabase();

  const { data: brand, error: brandError } = await adminSupabase
    .from("brands")
    .insert({
      client_id: input.organisationId,
      brand_name: input.brandName
    })
    .select("id")
    .single();

  if (brandError) throw brandError;

  const { data: project, error: projectError } = await adminSupabase
    .from("projects")
    .insert({
      client_id: input.organisationId,
      brand_id: brand.id,
      project_name: input.projectName,
      campaign_name: input.campaignName,
      target_quantity: input.capacity,
      status: "Planning",
      regions_covered: [],
      assigned_installers: []
    })
    .select("id")
    .single();

  if (projectError) throw projectError;

  return { brandId: brand.id, projectId: project.id, created: true };
}
