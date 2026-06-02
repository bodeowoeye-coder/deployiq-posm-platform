import type { SupabaseClient } from "@supabase/supabase-js";
import { clientCanSeeSubmission, getClientVisibilityScope } from "@/lib/clientVisibility";
import type { Brand, Client, Project, Submission } from "@/lib/types";

function hierarchyKey(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesLegacyBrandClientName(clientName: string, brandName: string) {
  const clientKey = hierarchyKey(clientName)
    .replace(/nigeria/g, "")
    .replace(/limited/g, "")
    .replace(/ltd/g, "");
  const brandKey = hierarchyKey(brandName);
  return Boolean(brandKey && (clientKey === brandKey || clientKey.startsWith(brandKey)));
}

function isOptionalBrandIdColumnError(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.code === "42703" || message.includes("brand_id") || message.includes("schema cache");
}

export async function loadClientSubmissionScope(supabase: SupabaseClient, client: Client, clientId: string) {
  const { data: exactBrandAccountMatch, error: exactBrandError } = await supabase
    .from("brands")
    .select("client_id, brand_name")
    .ilike("brand_name", client.name)
    .maybeSingle();
  const { data: allBrandRows, error: allBrandRowsError } = await supabase
    .from("brands")
    .select("client_id, brand_name");
  if (exactBrandError) {
    console.warn("[client-scope] exact brand lookup skipped", exactBrandError.message);
  }
  if (allBrandRowsError) {
    console.warn("[client-scope] brand ownership lookup skipped", allBrandRowsError.message);
  }
  const legacyBrandAccountMatch =
    exactBrandAccountMatch ??
    (allBrandRows ?? []).find((brand) => matchesLegacyBrandClientName(client.name, brand.brand_name)) ??
    null;
  const effectiveClientId = legacyBrandAccountMatch?.client_id ?? clientId;
  const { data: owningClient } =
    effectiveClientId !== clientId
      ? await supabase.from("clients").select("*").eq("id", effectiveClientId).maybeSingle()
      : { data: null };
  const effectiveClient = (owningClient as Client | null) ?? client;
  const [{ data: brands }, { data: projects }] = await Promise.all([
    supabase
      .from("brands")
      .select("id, brand_name")
      .eq("client_id", effectiveClientId)
      .order("brand_name", { ascending: true }),
    supabase
      .from("projects")
      .select("*")
      .eq("client_id", effectiveClientId)
      .order("created_at", { ascending: false })
  ]);
  const brandRows = (brands ?? []) as Array<Pick<Brand, "id" | "brand_name">>;
  const projectRows = (projects ?? []) as Project[];
  const visibilityScope = getClientVisibilityScope(effectiveClient, brandRows, projectRows);
  const submissionQueries = [
    supabase.from("submissions").select("*").eq("client_id", effectiveClientId).order("submitted_at", { ascending: false })
  ];

  if (visibilityScope.brandNames.length > 0) {
    submissionQueries.push(
      supabase
        .from("submissions")
        .select("*")
        .in("brand_name", visibilityScope.brandNames)
        .order("submitted_at", { ascending: false })
    );
  }
  if (visibilityScope.brandIds.length > 0) {
    submissionQueries.push(
      supabase
        .from("submissions")
        .select("*")
        .in("brand_id", visibilityScope.brandIds)
        .order("submitted_at", { ascending: false })
    );
  }
  if (visibilityScope.isGodrejClient && visibilityScope.projectIds.length > 0) {
    submissionQueries.push(
      supabase
        .from("submissions")
        .select("*")
        .in("project_id", visibilityScope.projectIds)
        .order("submitted_at", { ascending: false })
    );
  }
  if (visibilityScope.isGodrejClient && visibilityScope.projectNames.length > 0) {
    submissionQueries.push(
      supabase
        .from("submissions")
        .select("*")
        .in("project_name", visibilityScope.projectNames)
        .order("submitted_at", { ascending: false })
    );
  }

  const submissionResults = await Promise.all(submissionQueries);
  const submissionError = submissionResults.find((result) => result.error && !isOptionalBrandIdColumnError(result.error))?.error;
  if (submissionError) throw new Error(submissionError.message);

  const submissions = Array.from(
    new Map(
      submissionResults
        .filter((result) => !result.error)
        .flatMap((result) => result.data ?? [])
        .filter((item) => clientCanSeeSubmission(item as Submission, effectiveClientId, visibilityScope))
        .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))
        .map((item) => [item.id, item])
    ).values()
  ) as Submission[];

  return {
    brands: brandRows,
    projects: projectRows,
    submissions,
    visibilityScope,
    effectiveClient,
    effectiveClientId,
    legacyBrandClientName: legacyBrandAccountMatch?.brand_name ?? null,
    directClientRows: submissionResults[0]?.data?.length ?? 0
  };
}
