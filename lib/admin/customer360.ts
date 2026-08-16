import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { deriveProjectRegions, normalizeStates } from "@/lib/geography";
import {
  UNAVAILABLE,
  resolveWorkspaceDestination,
  type ActivationStatus,
  type CommercialStatus,
  type CustomerSource,
  type ProvisioningStatus,
  type WorkspaceStatus,
} from "@/lib/admin/customerControl";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function elapsedMs(startedAt: number) {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

function customerControlLog(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[customer-control-performance]", payload);
}

function workspaceUrlFor(slug: string) {
  if (!slug) return null;
  return resolveWorkspaceDestination(slug).hostname;
}

export type Customer360Project = {
  id: string;
  projectName: string;
  campaignName: string | null;
  brand: string | null;
  status: string;
  targetQuantity: number;
  regions: string[];
  states: string[];
  agencyName: string | null;
  leadInstallerName: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type Customer360Person = {
  userId: string;
  fullName: string;
  email: string;
  roleKey: string;
  membershipStatus: string;
};

export type Customer360 = Awaited<ReturnType<typeof getPlatformCustomer360>>;

// Shell payload: organisation, workspace, commercial/provisioning, people and projects.
// Operational health is loaded separately so the shell can render immediately.
export async function getPlatformCustomer360(clientId: string) {
  const startedAt = nowMs();
  const supabase = createAdminSupabase();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id,name,status,created_at")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError) throw clientError;
  if (!client) return null;

  const [
    { data: profile },
    { data: workspace },
    { data: entitlement },
    { data: memberships },
    { data: projects },
    { data: statuses },
  ] = await Promise.all([
    supabase.from("client_profiles").select("client_id,contact_person,email,phone,industry_category").eq("client_id", clientId).maybeSingle(),
    supabase.from("workspace_settings").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("product_entitlements").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("workspace_memberships").select("user_id,role_key,status,created_at").eq("client_id", clientId),
    supabase.from("projects").select("id,name,campaign,brand,status,target_quantity,regions_covered,project_regions,primary_target_region,primary_target_state,agency_id,lead_installer_id,start_date,end_date").eq("client_id", clientId).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("workspace_statuses").select("category,status_key,label,sequence,active").eq("client_id", clientId).order("sequence", { ascending: true }),
  ]);
  customerControlLog({ step: "Customer 360 core lookups", clientId, elapsedMs: elapsedMs(startedAt) });

  const membershipRows = (memberships ?? []) as Row[];
  const projectRows = (projects ?? []) as Row[];
  const draftId = text(entitlement?.acquisition_draft_id);
  const slug = text(workspace?.workspace_slug);
  const commercialReference = text(workspace?.commercial_reference) || text(entitlement?.commercial_reference);

  const userIds = [...new Set(membershipRows.map((row) => text(row.user_id)).filter(Boolean))];
  const agencyIds = [...new Set(projectRows.map((row) => text(row.agency_id)).filter(Boolean))];
  const installerIds = [...new Set(projectRows.map((row) => text(row.lead_installer_id)).filter(Boolean))];

  const [
    { data: userProfiles },
    { data: agencies },
    { data: installers },
    { data: job },
    { data: draft },
  ] = await Promise.all([
    userIds.length > 0
      ? supabase.schema("public").from("user_profiles").select("user_id,full_name,email,phone").in("user_id", userIds)
      : Promise.resolve({ data: [] as Row[] }),
    agencyIds.length > 0
      ? supabase.from("agencies").select("id,agency_name").eq("client_id", clientId).in("id", agencyIds)
      : Promise.resolve({ data: [] as Row[] }),
    installerIds.length > 0
      ? supabase.from("installers").select("id,installer_name").eq("client_id", clientId).in("id", installerIds)
      : Promise.resolve({ data: [] as Row[] }),
    draftId
      ? supabase.from("provisioning_jobs").select("*").eq("acquisition_draft_id", draftId).maybeSingle()
      : slug
        ? supabase.from("provisioning_jobs").select("*").eq("workspace_slug", slug).maybeSingle()
        : Promise.resolve({ data: null as Row | null }),
    draftId
      ? supabase.from("onboarding_drafts").select("id,status,current_step,selected_product,email,created_at,completed_at").eq("id", draftId).maybeSingle()
      : Promise.resolve({ data: null as Row | null }),
  ]);

  const profileById = new Map(((userProfiles ?? []) as Row[]).map((row) => [text(row.user_id), row]));
  const agencyById = new Map(((agencies ?? []) as Row[]).map((row) => [text(row.id), text(row.agency_name)]));
  const installerById = new Map(((installers ?? []) as Row[]).map((row) => [text(row.id), text(row.installer_name)]));

  const provisioningJob = (job ?? null) as Row | null;
  const provisioningResult = provisioningJob?.result_data && typeof provisioningJob.result_data === "object" ? provisioningJob.result_data as Row : {};
  const shadowPlanning = provisioningResult.shadowPlanning && typeof provisioningResult.shadowPlanning === "object" ? provisioningResult.shadowPlanning as Row : null;
  const shadowValidation = shadowPlanning?.validation && typeof shadowPlanning.validation === "object" ? shadowPlanning.validation as Row : null;
  const { data: provisioningEvents } = provisioningJob?.id
    ? await supabase.from("provisioning_events").select("stage,event_type,message,created_at").eq("provisioning_job_id", text(provisioningJob.id)).order("created_at", { ascending: false }).limit(10)
    : { data: [] as Row[] };

  const people: Customer360Person[] = membershipRows.map((row) => {
    const userId = text(row.user_id);
    const userProfile = profileById.get(userId);
    return {
      userId,
      fullName: text(userProfile?.full_name) || text(userProfile?.email) || "Unknown user",
      email: text(userProfile?.email),
      roleKey: text(row.role_key),
      membershipStatus: text(row.status),
    };
  }).sort((a, b) => a.fullName.localeCompare(b.fullName));

  const primaryAdministrator = people.find((person) => person.roleKey === "workspace_owner")
    ?? people.find((person) => person.roleKey === "customer_admin")
    ?? null;

  const customerProjects: Customer360Project[] = projectRows.map((row) => {
    const states = normalizeStates((row.regions_covered as string[] | null) ?? []);
    return {
      id: text(row.id),
      projectName: text(row.name),
      campaignName: text(row.campaign) || null,
      brand: text(row.brand) || null,
      status: text(row.status) || "Planning",
      targetQuantity: Number(row.target_quantity ?? 0),
      states,
      regions: deriveProjectRegions({
        states,
        storedRegions: [...((row.project_regions as string[] | null) ?? []), text(row.primary_target_region)],
      }),
      agencyName: agencyById.get(text(row.agency_id)) || null,
      leadInstallerName: installerById.get(text(row.lead_installer_id)) || null,
      startDate: text(row.start_date) || null,
      endDate: text(row.end_date) || null,
    };
  });

  const provisionedAt = text(workspace?.provisioned_at) || null;
  const provisioningStatus: ProvisioningStatus = provisioningJob
    ? ({ queued: "Pending", running: "Running", completed: "Completed", failed: "Failed" } as const)[text(provisioningJob.status) as "queued" | "running" | "completed" | "failed"] ?? "Not available"
    : "Not available";
  const draftStatus = text(draft?.status).toLowerCase();
  const commercialStatus: CommercialStatus = !draft
    ? "Not available"
    : draftStatus === "completed" || draftStatus === "provisioned" || draftStatus === "paid"
      ? "Paid"
      : draftStatus === "awaiting_payment" || draftStatus === "payment_pending" || draftStatus === "checkout"
        ? "Awaiting Payment"
        : "Draft";
  const workspaceStatus: WorkspaceStatus = !workspace
    ? "Not provisioned"
    : text(workspace.status) === "active" ? "Active"
      : text(workspace.status) === "suspended" ? "Suspended"
        : text(workspace.status) === "archived" ? "Archived" : "Inactive";
  const activationStatus: ActivationStatus = provisionedAt ? "Completed" : workspace ? "Pending" : "Not available";
  const source: CustomerSource = provisioningJob ? "Self-service commercial journey" : workspace ? "Assisted provisioning" : "Legacy / Unknown";

  customerControlLog({ step: "Customer 360 shell total", clientId, elapsedMs: elapsedMs(startedAt) });

  return {
    organisation: {
      clientId: text(client.id),
      name: text(client.name),
      status: text(client.status),
      createdAt: text(client.created_at) || null,
      contactPerson: text(profile?.contact_person) || null,
      contactEmail: text(profile?.email) || null,
      contactPhone: text(profile?.phone) || null,
      industry: text(profile?.industry_category) || null,
      commercialReference: commercialReference || null,
      source,
    },
    workspace: {
      exists: Boolean(workspace),
      clientId: text(client.id),
      displayName: text(workspace?.workspace_display_name) || null,
      slug: slug || null,
      url: workspaceUrlFor(slug),
      destination: resolveWorkspaceDestination(slug),
      productKey: text(workspace?.product_key) || text(entitlement?.product_key) || null,
      productName: text(workspace?.product_name) || null,
      plan: text(workspace?.commercial_model) || text(entitlement?.commercial_model) || null,
      status: workspaceStatus,
      activationStatus,
      provisionedAt,
      manifestVersion: text(workspace?.manifest_version) || null,
      enabledModules: Array.isArray(workspace?.enabled_modules) ? (workspace.enabled_modules as unknown[]).map((item) => text(item)).filter(Boolean) : [],
      country: text(workspace?.country) || null,
      timezone: text(workspace?.timezone) || null,
      currency: text(workspace?.currency) || null,
      lifecycleStatuses: ((statuses ?? []) as Row[]).map((row) => ({
        category: text(row.category),
        label: text(row.label),
        active: Boolean(row.active),
      })),
    },
    commercial: {
      commercialReference: commercialReference || null,
      onboardingDraftId: draftId || null,
      provisioningJobId: text(provisioningJob?.id) || null,
      productKey: text(entitlement?.product_key) || null,
      plan: text(entitlement?.commercial_model) || null,
      programmeQuantity: Number(entitlement?.programme_quantity ?? 0) || null,
      entitlementStatus: text(entitlement?.status) || null,
      commercialStatus,
      provisioningStatus,
      provisioningStage: text(provisioningJob?.current_stage) || null,
      progressPercent: provisioningJob ? Number(provisioningJob.progress_percent ?? 0) : null,
      attemptCount: provisioningJob ? Number(provisioningJob.attempt_count ?? 0) : null,
      startedAt: text(provisioningJob?.started_at) || null,
      completedAt: text(provisioningJob?.completed_at) || null,
      failedAt: text(provisioningJob?.failed_at) || null,
      failureCode: text(provisioningJob?.failure_code) || null,
      failureMessage: text(provisioningJob?.failure_message) || null,
      shadowPlanning: shadowPlanning ? {
        generated: true,
        status: text(shadowPlanning.status) || null,
        validationStatus: text(shadowValidation?.status) || null,
        providerVersion: text(shadowPlanning.providerVersion) || null,
        generatedAt: text(shadowPlanning.generatedAt) || null,
        warnings: Array.isArray((shadowPlanning.proposedPlan as Row | undefined)?.warnings) ? (shadowPlanning.proposedPlan as Row).warnings as string[] : [],
        differences: Array.isArray(shadowPlanning.differences) ? shadowPlanning.differences as Array<{ path?: string; classification?: string }> : [],
      } : null,
      activationDate: text(entitlement?.activation_date) || null,
      events: ((provisioningEvents ?? []) as Row[]).map((row) => ({
        stage: text(row.stage),
        eventType: text(row.event_type),
        message: text(row.message),
        createdAt: text(row.created_at) || null,
      })),
    },
    people: {
      primaryAdministrator,
      members: people,
      activeCount: people.filter((person) => person.membershipStatus === "active").length,
      invitedCount: people.filter((person) => person.membershipStatus === "invited").length,
      byRole: people.reduce<Record<string, number>>((counts, person) => {
        counts[person.roleKey] = (counts[person.roleKey] ?? 0) + 1;
        return counts;
      }, {}),
    },
    projects: {
      items: customerProjects,
      total: customerProjects.length,
      active: customerProjects.filter((project) => project.status === "Active").length,
      planning: customerProjects.filter((project) => project.status === "Planning").length,
      onHold: customerProjects.filter((project) => project.status === "On Hold").length,
      completed: customerProjects.filter((project) => project.status === "Completed").length,
    },
  };
}

export type Customer360Operations = Awaited<ReturnType<typeof getPlatformCustomerOperations>>;

// Heavier operational snapshot, loaded after the shell. Counts only — no row payloads.
export async function getPlatformCustomerOperations(clientId: string) {
  const startedAt = nowMs();
  const supabase = createAdminSupabase();
  const submissions = () => supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", clientId);

  const [
    { data: projectTargets },
    { count: actual },
    { count: approved },
    { count: pending },
    { count: rejected },
    { count: gpsVerified },
    { count: alerts },
    { data: recentSubmissions },
    { data: auditEvents },
  ] = await Promise.all([
    supabase.from("projects").select("target_quantity").eq("client_id", clientId).is("archived_at", null),
    submissions(),
    submissions().eq("status", "Approved"),
    submissions().eq("status", "Pending"),
    submissions().eq("status", "Rejected"),
    submissions().not("gps_latitude", "is", null),
    supabase.from("notification_events").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    supabase.from("submissions").select("id,project_name,installer_name,status,submitted_at").eq("client_id", clientId).order("submitted_at", { ascending: false }).limit(8),
    supabase.from("audit_logs").select("action_type,actor_user_id,target_user_id,created_at,new_value").order("created_at", { ascending: false }).limit(50),
  ]);

  const expected = ((projectTargets ?? []) as Row[]).reduce((total, row) => total + Number(row.target_quantity ?? 0), 0);
  const actualCount = actual ?? 0;
  customerControlLog({ step: "Customer 360 operations", clientId, elapsedMs: elapsedMs(startedAt) });

  return {
    expected,
    actual: actualCount,
    outstanding: Math.max(expected - actualCount, 0),
    // Same completion formula the workspace operations helpers use.
    completionPercent: expected === 0 ? 0 : Math.round((actualCount / expected) * 100),
    approved: approved ?? 0,
    pending: pending ?? 0,
    rejected: rejected ?? 0,
    gpsVerified: gpsVerified ?? 0,
    alerts: alerts ?? 0,
    recentSubmissions: ((recentSubmissions ?? []) as Row[]).map((row) => ({
      id: text(row.id),
      projectName: text(row.project_name) || UNAVAILABLE,
      installerName: text(row.installer_name) || UNAVAILABLE,
      status: text(row.status),
      submittedAt: text(row.submitted_at) || null,
    })),
    activity: ((auditEvents ?? []) as Row[])
      .filter((row) => text((row.new_value as Row | null)?.clientId) === clientId)
      .slice(0, 10)
      .map((row) => ({
        actionType: text(row.action_type),
        createdAt: text(row.created_at) || null,
      })),
  };
}
