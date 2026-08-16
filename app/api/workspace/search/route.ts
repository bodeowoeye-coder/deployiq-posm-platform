import { NextResponse } from "next/server";
import { getCurrentAccessToken } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { createUserSupabase } from "@/lib/supabaseUser";
import { isLegacyProvisioningPlaceholderProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

type SearchResult = {
  group: "Projects" | "Deployment Locations" | "Team & Users" | "Agencies" | "Installers" | "Assignments" | "Submissions";
  label: string;
  sublabel?: string;
  href: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function includesQuery(value: unknown, query: string) {
  return text(value).toLowerCase().includes(query);
}

function safeHref(value: string) {
  return value.startsWith("/workspace/admin") ? value : "/workspace/admin";
}

async function resolveSearchWorkspaceScope() {
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) throw Object.assign(new Error("Sign in to search this workspace."), { status: 401 });
  const { data, error } = await createUserSupabase(accessToken).auth.getUser(accessToken);
  if (error || !data.user) throw Object.assign(new Error("Sign in to search this workspace."), { status: 401 });

  const { data: membership, error: membershipError } = await createAdminSupabase()
    .from("workspace_memberships")
    .select("client_id,role_key,status")
    .eq("user_id", data.user.id)
    .eq("status", "active")
    .in("role_key", ["customer_admin", "workspace_owner", "workspace_manager", "project_manager"])
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  const clientId = text(membership?.client_id);
  if (!clientId) throw Object.assign(new Error("Workspace access is required to search."), { status: 403 });
  return { userId: data.user.id, clientId };
}

async function optionalResults(load: () => Promise<SearchResult[]>) {
  try {
    return await load();
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[workspace-search]", error instanceof Error ? error.message : error);
    }
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = text(searchParams.get("q")).toLowerCase().slice(0, 80);
    if (query.length < 2) return NextResponse.json({ results: [] });

    const workspace = await resolveSearchWorkspaceScope();
    const supabase = createAdminSupabase();
    const pattern = `%${query}%`;

    const [projects, locations, team, agencies, installers, assignments, submissions] = await Promise.all([
      optionalResults(async () => {
        const { data, error } = await supabase
          .from("projects")
          .select("id,project_name:name,status")
          .eq("client_id", workspace.clientId)
          .ilike("name", pattern)
          .limit(5);
        if (error) throw error;
        return ((data ?? []) as Array<Record<string, unknown>>).filter((project) => !isLegacyProvisioningPlaceholderProject(project)).map((project) => ({
          group: "Projects" as const,
          label: text(project.project_name) || "Untitled project",
          sublabel: text(project.status) || "Project",
          href: safeHref(`/workspace/admin/projects/${text(project.id)}`),
        }));
      }),
      optionalResults(async () => {
        const { data, error } = await supabase
          .from("deployment_locations")
          .select("id,location_name,outlet_name,outlet_code,external_id")
          .eq("client_id", workspace.clientId)
          .or(`location_name.ilike.${pattern},outlet_name.ilike.${pattern},outlet_code.ilike.${pattern},external_id.ilike.${pattern}`)
          .limit(5);
        if (error) throw error;
        return ((data ?? []) as Array<Record<string, unknown>>).map((location) => {
          const label = text(location.location_name) || text(location.outlet_name) || text(location.outlet_code) || "Deployment location";
          const sublabel = text(location.outlet_code) || text(location.external_id) || "Deployment Locations";
          return {
            group: "Deployment Locations" as const,
            label,
            sublabel,
            href: safeHref("/workspace/admin/upload-directory"),
          };
        });
      }),
      optionalResults(async () => {
        const { data: memberships, error: membershipsError } = await supabase
          .from("workspace_memberships")
          .select("id,user_id,role_key,status")
          .eq("client_id", workspace.clientId)
          .limit(50);
        if (membershipsError) throw membershipsError;
        const userIds = [...new Set(((memberships ?? []) as Array<Record<string, unknown>>).map((membership) => text(membership.user_id)).filter(Boolean))];
        if (userIds.length === 0) return [];
        const { data: profiles, error: profilesError } = await supabase
          .schema("public")
          .from("user_profiles")
          .select("user_id,full_name,email")
          .in("user_id", userIds);
        if (profilesError) throw profilesError;
        return ((profiles ?? []) as Array<Record<string, unknown>>)
          .filter((profile) => includesQuery(`${text(profile.full_name)} ${text(profile.email)}`, query))
          .slice(0, 5)
          .map((profile) => ({
            group: "Team & Users" as const,
            label: text(profile.full_name) || text(profile.email) || "Workspace user",
            sublabel: text(profile.email),
            href: safeHref("/workspace/admin/team"),
          }));
      }),
      optionalResults(async () => {
        const { data, error } = await supabase
          .from("agencies")
          .select("id,agency_name,phone,email")
          .eq("client_id", workspace.clientId)
          .or(`agency_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
          .limit(5);
        if (error) throw error;
        return ((data ?? []) as Array<Record<string, unknown>>).map((agency) => ({
          group: "Agencies" as const,
          label: text(agency.agency_name) || "Agency",
          sublabel: text(agency.phone) || text(agency.email) || "Agency",
          href: safeHref("/workspace/admin/agencies"),
        }));
      }),
      optionalResults(async () => {
        const { data, error } = await supabase
          .from("installers")
          .select("id,installer_name,phone,email")
          .eq("client_id", workspace.clientId)
          .or(`installer_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
          .limit(5);
        if (error) throw error;
        return ((data ?? []) as Array<Record<string, unknown>>).map((installer) => ({
          group: "Installers" as const,
          label: text(installer.installer_name) || "Installer",
          sublabel: text(installer.phone) || text(installer.email) || "Installer",
          href: safeHref(`/workspace/admin/installers/${text(installer.id)}`),
        }));
      }),
      optionalResults(async () => {
        const { data, error } = await supabase
          .from("workspace_field_assignments")
          .select("id,campaign_id,project_id,deployment_location_id,workspace_campaigns(campaign_name),deployment_locations(outlet_name,outlet_code,address)")
          .eq("client_id", workspace.clientId)
          .limit(50);
        if (error) throw error;
        return ((data ?? []) as Array<Record<string, unknown>>)
          .filter((assignment) => includesQuery(`${text((assignment.workspace_campaigns as Record<string, unknown> | null)?.campaign_name)} ${text((assignment.deployment_locations as Record<string, unknown> | null)?.outlet_name)} ${text((assignment.deployment_locations as Record<string, unknown> | null)?.outlet_code)} ${text((assignment.deployment_locations as Record<string, unknown> | null)?.address)}`, query))
          .slice(0, 5)
          .map((assignment) => ({
            group: "Assignments" as const,
            label: text((assignment.deployment_locations as Record<string, unknown> | null)?.outlet_name) || "Assignment",
            sublabel: text((assignment.workspace_campaigns as Record<string, unknown> | null)?.campaign_name) || "Campaign assignment",
            href: safeHref(`/workspace/admin/projects/${text(assignment.project_id)}`),
          }));
      }),
      optionalResults(async () => {
        const { data, error } = await supabase
          .from("submissions")
          .select("id,selected_outlet_name,installer_name,project_name,brand_name,status")
          .eq("client_id", workspace.clientId)
          .or(`selected_outlet_name.ilike.${pattern},installer_name.ilike.${pattern},project_name.ilike.${pattern},brand_name.ilike.${pattern}`)
          .limit(5);
        if (error) throw error;
        return ((data ?? []) as Array<Record<string, unknown>>).map((submission) => ({
          group: "Submissions" as const,
          label: text(submission.selected_outlet_name) || "Submission",
          sublabel: [text(submission.installer_name), text(submission.status)].filter(Boolean).join(" | "),
          href: safeHref("/workspace/admin/submissions"),
        }));
      }),
    ]);

    const results = [...projects, ...locations, ...team, ...agencies, ...installers, ...assignments, ...submissions].filter((result) => result.href.startsWith("/workspace/admin"));
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search this workspace.";
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
