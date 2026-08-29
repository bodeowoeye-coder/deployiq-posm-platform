import "server-only";

import { resolveCanonicalBuildProject } from "./service.ts";
import type { CanonicalBuildProject } from "./types.ts";
import { createAdminSupabase } from "../../supabaseAdmin.ts";

export type BuildProjectWorkspaceSite = {
  id: string;
  siteCode: string;
  name: string;
  status: string;
  address: string | null;
  state: string | null;
  lga: string | null;
};

export type BuildProjectWorkspaceWorkPackage = {
  id: string;
  siteId: string;
  code: string;
  name: string;
  status: string;
  templateId: string | null;
  templateName: string | null;
  description: string | null;
  workPackageType: string | null;
  contractor: string | null;
};

export type BuildProjectWorkspaceTemplate = {
  id: string;
  code: string;
  name: string;
  isGlobal: boolean;
};

export type BuildProjectWorkspaceOverview = {
  project: CanonicalBuildProject;
  sites: BuildProjectWorkspaceSite[];
  workPackages: BuildProjectWorkspaceWorkPackage[];
  templates: BuildProjectWorkspaceTemplate[];
  counts: {
    sites: number;
    workPackages: number;
    templates: number;
    categories: number;
    activities: number;
    checklists: number;
    resources: number;
    dependencies: number;
  };
};

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function rows<T extends Row>(data: T[] | null) {
  return data ?? [];
}

function assertQuery(error: { message?: string } | null, label: string) {
  if (error) throw new Error(`Could not load Build ${label}: ${error.message ?? "Unknown database error"}`);
}

export async function getBuildProjectWorkspaceOverview(projectId: string): Promise<BuildProjectWorkspaceOverview> {
  const { project } = await resolveCanonicalBuildProject({
    projectId,
    requiredPermission: "projects:read",
  });
  const supabase = createAdminSupabase();

  const [{ data: siteData, error: siteError }, { data: resourceData, error: resourceError }] = await Promise.all([
    supabase
      .from("build_sites")
      .select("id,site_code,name,status,address,state,lga")
      .eq("client_id", project.client_id)
      .eq("project_id", project.id)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("build_resources")
      .select("id")
      .or(`client_id.eq.${project.client_id},is_global.eq.true`)
      .is("archived_at", null),
  ]);
  assertQuery(siteError, "sites");
  assertQuery(resourceError, "resources");

  const sites = rows(siteData as Row[] | null).map((site) => ({
    id: text(site.id),
    siteCode: text(site.site_code),
    name: text(site.name),
    status: text(site.status),
    address: text(site.address) || null,
    state: text(site.state) || null,
    lga: text(site.lga) || null,
  }));
  const siteIds = sites.map((site) => site.id).filter(Boolean);
  const workPackageResult = siteIds.length > 0
    ? await supabase
      .from("build_work_packages")
      .select("id,site_id,code,name,status,template_id,description,work_package_type,contractor")
      .eq("client_id", project.client_id)
      .eq("project_id", project.id)
      .in("site_id", siteIds)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  assertQuery(workPackageResult.error, "work packages");

  const workPackageRows = rows(workPackageResult.data as Row[] | null);
  const templateIds = [...new Set(workPackageRows.map((row) => text(row.template_id)).filter(Boolean))];
  const [templateResult, categoryResult, activityResult, dependencyResult] = templateIds.length > 0
    ? await Promise.all([
      supabase.from("build_work_package_templates").select("id,code,name,is_global").in("id", templateIds).or(`client_id.eq.${project.client_id},is_global.eq.true`).is("archived_at", null),
      supabase.from("build_activity_categories").select("id").in("template_id", templateIds).neq("status", "archived"),
      supabase.from("build_activity_templates").select("id").in("template_id", templateIds).is("archived_at", null),
      supabase.from("build_activity_template_dependencies").select("id").in("template_id", templateIds).is("archived_at", null),
    ])
    : [
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
  assertQuery(templateResult.error, "templates");
  assertQuery(categoryResult.error, "activity categories");
  assertQuery(activityResult.error, "activities");
  assertQuery(dependencyResult.error, "dependencies");

  const activityIds = rows(activityResult.data as Row[] | null).map((row) => text(row.id)).filter(Boolean);
  const checklistResult = activityIds.length > 0
    ? await supabase.from("build_checklist_templates").select("id").in("activity_template_id", activityIds).is("archived_at", null)
    : { data: [], error: null };
  assertQuery(checklistResult.error, "checklists");

  const templateNameById = new Map(rows(templateResult.data as Row[] | null).map((row) => [text(row.id), text(row.name)]));
  const workPackages = workPackageRows.map((workPackage) => {
    const templateId = text(workPackage.template_id) || null;
    return {
      id: text(workPackage.id),
      siteId: text(workPackage.site_id),
      code: text(workPackage.code),
      name: text(workPackage.name),
      status: text(workPackage.status),
      templateId,
      templateName: templateId ? templateNameById.get(templateId) ?? null : null,
      description: text(workPackage.description) || null,
      workPackageType: text(workPackage.work_package_type) || null,
      contractor: text(workPackage.contractor) || null,
    };
  });

  const { data: eligibleTemplateData, error: eligibleTemplateError } = await supabase
    .from("build_work_package_templates")
    .select("id,code,name,is_global")
    .eq("status", "active")
    .is("archived_at", null)
    .or(`client_id.eq.${project.client_id},is_global.eq.true`)
    .order("name", { ascending: true });
  assertQuery(eligibleTemplateError, "eligible templates");
  const templates = rows(eligibleTemplateData as Row[] | null).map((template) => ({
    id: text(template.id),
    code: text(template.code),
    name: text(template.name),
    isGlobal: template.is_global === true,
  }));

  return {
    project,
    sites,
    workPackages,
    templates,
    counts: {
      sites: sites.length,
      workPackages: workPackages.length,
      templates: rows(templateResult.data as Row[] | null).length,
      categories: rows(categoryResult.data as Row[] | null).length,
      activities: activityIds.length,
      checklists: rows(checklistResult.data as Row[] | null).length,
      resources: rows(resourceData as Row[] | null).length,
      dependencies: rows(dependencyResult.data as Row[] | null).length,
    },
  };
}
