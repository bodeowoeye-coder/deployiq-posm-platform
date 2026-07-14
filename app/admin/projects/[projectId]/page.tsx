import { notFound } from "next/navigation";
import { ProjectDashboardShell } from "@/components/ProjectDashboardShell";
import { requireRole } from "@/lib/auth";
import { getBuildSitesForProject } from "@/lib/build/sites/service";
import { getWorkPackages } from "@/lib/build/workPackages/service";
import { normalizeProjectRecord } from "@/lib/projects";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminProjectDashboardPage({
  params,
  searchParams
}: {
  params: { projectId: string };
  searchParams?: { tab?: string; siteId?: string };
}) {
  await requireRole(["admin"], `/admin/projects/${params.projectId}`);
  const supabase = createAdminSupabase();

  const { data: project } = await supabase.from("projects").select("*").eq("id", params.projectId).maybeSingle();
  if (!project) notFound();

  const normalized = normalizeProjectRecord(project) as Project;
  const sites =
    (normalized.project_type || "Retail Deployment").toLowerCase() === "retail deployment"
      ? []
      : await getBuildSitesForProject({ projectId: normalized.id });
  const selectedSite = searchParams?.siteId ? sites.find((site) => site.id === searchParams.siteId) ?? null : null;
  const workPackages = selectedSite
    ? await getWorkPackages({
        projectId: normalized.id,
        siteId: selectedSite.id
      })
    : [];

  const [clientRow, businessUnitRow, portfolioRow] = await Promise.all([
    supabase.from("clients").select("name").eq("id", normalized.client_id).maybeSingle(),
    normalized.business_unit_id
      ? supabase
          .from("business_units")
          .select("name")
          .eq("id", normalized.business_unit_id)
          .eq("client_id", normalized.client_id)
          .maybeSingle()
      : Promise.resolve({ data: null as { name?: string | null } | null }),
    normalized.portfolio_id
      ? supabase
          .from("project_portfolios")
          .select("name")
          .eq("id", normalized.portfolio_id)
          .eq("client_id", normalized.client_id)
          .maybeSingle()
      : Promise.resolve({ data: null as { name?: string | null } | null })
  ]);

  return (
    <ProjectDashboardShell
      project={normalized}
      audience="admin"
      activeTab={searchParams?.tab}
      basePath={`/admin/projects/${params.projectId}`}
      sites={sites}
      clientName={clientRow.data?.name ?? null}
      businessUnitName={businessUnitRow.data?.name ?? null}
      portfolioName={portfolioRow.data?.name ?? null}
      currentSiteName={selectedSite?.name ?? null}
      selectedSiteId={selectedSite?.id ?? null}
      workPackages={workPackages}
    />
  );
}
