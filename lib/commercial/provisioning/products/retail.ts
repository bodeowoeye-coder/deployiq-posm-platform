import { createAdminSupabase } from "@/lib/supabaseAdmin";

function isMissingSchemaObject(error: unknown) {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
  const message = typeof (error as { message?: unknown })?.message === "string" ? (error as { message: string }).message : "";
  return code === "42703" || code === "42P01" || code === "PGRST205" || message.includes("schema cache");
}

export async function provisionRetailProduct(input: { organisationId: string; userId?: string | null; campaignName: string; projectName: string; brandName: string; capacity: number; productKey: string }) {
  const adminSupabase = createAdminSupabase();

  let existingBrandResult = await adminSupabase
    .from("brands")
    .select("id")
    .eq("client_id", input.organisationId)
    .eq("brand_name", input.brandName)
    .maybeSingle();
  if (isMissingSchemaObject(existingBrandResult.error)) {
    existingBrandResult = await adminSupabase
      .from("brands")
      .select("id")
      .eq("brand_name", input.brandName)
      .maybeSingle();
  }
  if (isMissingSchemaObject(existingBrandResult.error)) {
    existingBrandResult = await adminSupabase
      .from("brands")
      .select("id")
      .eq("name", input.brandName)
      .maybeSingle();
  }
  if (existingBrandResult.error) throw existingBrandResult.error;

  let brand = existingBrandResult.data;
  if (!brand) {
    let brandInsertResult = await adminSupabase
      .from("brands")
      .insert({
        client_id: input.organisationId,
        brand_name: input.brandName
      })
      .select("id")
      .single();
    if (isMissingSchemaObject(brandInsertResult.error)) {
      brandInsertResult = await adminSupabase
        .from("brands")
        .insert({
          brand_name: input.brandName,
          name: input.brandName
        })
        .select("id")
        .single();
    }
    const { data, error } = brandInsertResult;
    if (error) throw error;
    brand = data;
  }

  if (!brand?.id) throw new Error("Could not create retail brand.");

  let existingProjectResult = await adminSupabase
    .from("projects")
    .select("id")
    .eq("client_id", input.organisationId)
    .eq("project_name", input.projectName)
    .maybeSingle();
  if (isMissingSchemaObject(existingProjectResult.error)) {
    existingProjectResult = await adminSupabase
      .from("projects")
      .select("id")
      .eq("client_id", input.organisationId)
      .eq("name", input.projectName)
      .maybeSingle();
  }
  if (existingProjectResult.error) throw existingProjectResult.error;

  let project = existingProjectResult.data;
  if (!project) {
    let insertResult = await adminSupabase
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
    if (isMissingSchemaObject(insertResult.error)) {
      insertResult = await adminSupabase
        .from("projects")
        .insert({
          client_id: input.organisationId,
          brand_id: brand.id,
          name: input.projectName,
          campaign: input.campaignName,
          target_quantity: input.capacity,
          status: "Planning",
          regions_covered: [],
          assigned_installers: []
        })
        .select("id")
        .single();
    }
    const { data, error } = insertResult;
    if (error) throw error;
    project = data;
  }

  if (!project?.id) throw new Error("Could not create retail project.");

  const linkResult = await adminSupabase
    .from("client_projects")
    .upsert({ client_id: input.organisationId, project_id: project.id }, { onConflict: "client_id,project_id" });
  if (linkResult.error && !isMissingSchemaObject(linkResult.error)) throw linkResult.error;

  return { brandId: brand.id, projectId: project.id, created: !existingProjectResult.data };
}
