import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { cleanString, requireAdminContext, writeAuditLog } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

const DEMO_EMAILS = ["admin@test.com", "installer@test.com", "darling@test.com", "client@test.com"];
const DEMO_PROJECT_NAMES = ["Salon Dealer Board for Godrej", "MegaGrowth Retail Push"];

type ClientOption = { id: string; name: string; status: string | null };
type ProjectOption = { id: string; project_name: string; client_id: string | null; archived_at: string | null };
type UserPreview = {
  user_id: string;
  email: string;
  full_name: string;
  role: string | null;
  client_id: string | null;
  status: string | null;
  match_reason: string;
};
type ProjectPreview = {
  id: string;
  project_name: string;
  client_id: string | null;
  client_name: string | null;
  archived_at: string | null;
  match_reason: string;
};
type SubmissionPreview = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  client_id: string | null;
  brand_name: string | null;
  installer_user_id: string | null;
  installer_name: string | null;
  status: string | null;
  submitted_at: string | null;
  match_reason: string;
};
type ReportPreview = { id: string; alert_type: string | null; created_at: string | null; match_reason: string };

type DemoPlan = {
  mode: "seeded" | "client" | "project";
  selectedClientId: string | null;
  selectedProjectId: string | null;
  clients: ClientOption[];
  projectsForSelectedClient: ProjectOption[];
  users: UserPreview[];
  projects: ProjectPreview[];
  submissions: SubmissionPreview[];
  reports: ReportPreview[];
  rules: string[];
  warnings: string[];
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function projectName(row: Record<string, unknown>) {
  return cleanString(row.project_name) || cleanString(row.name);
}

function isDemoEmail(value: unknown) {
  const email = normalize(value);
  return DEMO_EMAILS.includes(email) || email.endsWith("@test.com");
}

function isDemoProjectName(value: unknown) {
  const name = cleanString(value);
  const key = normalize(name);
  return DEMO_PROJECT_NAMES.some((demoName) => normalize(demoName) === key) || key.includes("demo") || key.includes("sample") || key.includes("test");
}

function isMissingOptionalTableError(error: { code?: string; message?: string; details?: string } | null | undefined) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("could not find the table") || message.includes("does not exist");
}

function isMissingOptionalColumnError(error: { code?: string; message?: string; details?: string } | null | undefined) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return error?.code === "42703" || message.includes("could not find") || message.includes("schema cache") || message.includes("column");
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.filter((row) => row.id).map((row) => [row.id, row])).values());
}

function uniqueUsers(rows: UserPreview[]) {
  return Array.from(new Map(rows.filter((row) => row.user_id).map((row) => [row.user_id, row])).values());
}

async function getDemoPlan(requestUrl: string): Promise<DemoPlan> {
  const supabase = createAdminSupabase();
  const url = new URL(requestUrl);
  const selectedClientId = cleanString(url.searchParams.get("clientId")) || null;
  const selectedProjectId = cleanString(url.searchParams.get("projectId")) || null;
  const mode: DemoPlan["mode"] = selectedProjectId ? "project" : selectedClientId ? "client" : "seeded";
  const warnings: string[] = [];

  const [
    { data: rawClients, error: clientsError },
    { data: rawProjects, error: projectsError },
    { data: rawProfiles, error: profilesError },
    { data: rawRoles, error: rolesError },
    { data: rawSubmissions, error: submissionsError }
  ] = await Promise.all([
    supabase.from("clients").select("*").order("name", { ascending: true }),
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.schema("public").from("user_profiles").select("*"),
    supabase.schema("public").from("user_roles").select("*"),
    supabase.from("submissions").select("*")
  ]);

  if (clientsError) warnings.push(`Could not inspect clients: ${clientsError.message}`);
  if (projectsError) warnings.push(`Could not inspect projects: ${projectsError.message}`);
  if (profilesError) warnings.push(`Could not inspect users: ${profilesError.message}`);
  if (rolesError) warnings.push(`Could not inspect user roles: ${rolesError.message}`);
  if (submissionsError) warnings.push(`Could not inspect submissions: ${submissionsError.message}`);

  const clients = ((rawClients ?? []) as Array<Record<string, unknown>>).map((client) => ({
    id: cleanString(client.id),
    name: cleanString(client.name),
    status: cleanString(client.status) || null
  })).filter((client) => client.id);
  const clientNameById = new Map(clients.map((client) => [client.id, client.name]));
  const allProjects = ((rawProjects ?? []) as Array<Record<string, unknown>>).map((project) => ({
    id: cleanString(project.id),
    project_name: projectName(project),
    client_id: cleanString(project.client_id) || null,
    archived_at: cleanString(project.archived_at) || null
  })).filter((project) => project.id);
  const projectsForSelectedClient = selectedClientId ? allProjects.filter((project) => project.client_id === selectedClientId && !project.archived_at) : [];
  const roles = (rawRoles ?? []) as Array<Record<string, unknown>>;
  const profiles = (rawProfiles ?? []) as Array<Record<string, unknown>>;
  const submissionsRaw = (rawSubmissions ?? []) as Array<Record<string, unknown>>;

  const selectedProjects = allProjects.filter((project) => {
    if (project.archived_at) return false;
    if (selectedProjectId) return project.id === selectedProjectId;
    if (selectedClientId) return project.client_id === selectedClientId;
    return isDemoProjectName(project.project_name);
  });
  const selectedProjectIds = new Set(selectedProjects.map((project) => project.id));
  const selectedProjectNames = new Set(selectedProjects.map((project) => normalize(project.project_name)));

  const submissions = submissionsRaw
    .filter((submission) => {
      if (submission.archived_at) return false;
      const projectId = cleanString(submission.project_id);
      const projectNameValue = normalize(submission.project_name);
      const clientId = cleanString(submission.client_id);
      const installerEmail = cleanString(submission.installer_email);
      if (selectedProjectId) return projectId === selectedProjectId || selectedProjectNames.has(projectNameValue);
      if (selectedClientId) return clientId === selectedClientId || selectedProjectIds.has(projectId) || selectedProjectNames.has(projectNameValue);
      return isDemoEmail(installerEmail) || selectedProjectIds.has(projectId) || selectedProjectNames.has(projectNameValue);
    })
    .map((submission) => {
      const projectId = cleanString(submission.project_id) || null;
      const clientId = cleanString(submission.client_id) || null;
      let matchReason = "Seeded/test matcher";
      if (selectedProjectId && projectId === selectedProjectId) matchReason = "Submission project_id matches selected project";
      else if (selectedClientId && clientId === selectedClientId) matchReason = "Submission client_id matches selected client";
      else if (projectId && selectedProjectIds.has(projectId)) matchReason = "Submission belongs to a matched project";
      else if (selectedProjectNames.has(normalize(submission.project_name))) matchReason = "Submission project_name matches selected project";
      else if (isDemoEmail(submission.installer_email)) matchReason = "Installer email is a test/demo account";
      return {
        id: cleanString(submission.id),
        project_id: projectId,
        project_name: cleanString(submission.project_name) || null,
        client_id: clientId,
        brand_name: cleanString(submission.brand_name) || null,
        installer_user_id: cleanString(submission.installer_user_id) || null,
        installer_name: cleanString(submission.installer_name) || null,
        status: cleanString(submission.status) || null,
        submitted_at: cleanString(submission.submitted_at) || null,
        match_reason: matchReason
      };
    })
    .filter((submission) => submission.id);

  const submissionUserIds = new Set(submissions.map((submission) => submission.installer_user_id).filter(Boolean) as string[]);
  const submissionProjectIds = new Set(submissions.map((submission) => submission.project_id).filter(Boolean) as string[]);
  const selectedUserIds = new Set<string>();
  roles.forEach((role) => {
    const userId = cleanString(role.user_id);
    const roleClientId = cleanString(role.client_id);
    if (!userId) return;
    if (selectedClientId && roleClientId === selectedClientId) selectedUserIds.add(userId);
  });
  profiles.forEach((profile) => {
    const userId = cleanString(profile.user_id);
    if (!userId) return;
    const assignedProjects = Array.isArray(profile.assigned_project_ids) ? profile.assigned_project_ids.map(cleanString) : [];
    if (assignedProjects.some((projectId) => selectedProjectIds.has(projectId) || submissionProjectIds.has(projectId))) selectedUserIds.add(userId);
    if (isDemoEmail(profile.email)) selectedUserIds.add(userId);
  });
  submissionUserIds.forEach((userId) => selectedUserIds.add(userId));

  const users = uniqueUsers(
    profiles
      .filter((profile) => {
        const userId = cleanString(profile.user_id);
        if (!userId || normalize(profile.status) === "archived") return false;
        if (mode === "seeded") return isDemoEmail(profile.email) || selectedUserIds.has(userId);
        return selectedUserIds.has(userId);
      })
      .map((profile) => {
        const userId = cleanString(profile.user_id);
        const role = roles.find((item) => cleanString(item.user_id) === userId);
        let matchReason = "Matched through selected client/project scope";
        if (isDemoEmail(profile.email)) matchReason = "Email is a known test/demo account";
        else if (submissionUserIds.has(userId)) matchReason = "User has matched submissions";
        else if (selectedClientId && cleanString(role?.client_id) === selectedClientId) matchReason = "Client user role is assigned to selected client";
        return {
          user_id: userId,
          email: cleanString(profile.email),
          full_name: cleanString(profile.full_name) || "Unnamed user",
          role: cleanString(role?.role) || null,
          client_id: cleanString(role?.client_id) || null,
          status: cleanString(profile.status) || null,
          match_reason: matchReason
        };
      })
  );

  const projects = uniqueById(
    selectedProjects.map((project) => ({
      ...project,
      client_name: project.client_id ? clientNameById.get(project.client_id) ?? null : null,
      match_reason: selectedProjectId
        ? "Project selected directly"
        : selectedClientId
          ? "Project belongs to selected client"
          : "Project name matches seeded/demo rules"
    }))
  );

  const demoSubmissionIds = submissions.map((submission) => submission.id);
  let reports: DemoPlan["reports"] = [];
  if (demoSubmissionIds.length > 0) {
    const { data: rawReports, error: reportsError } = await supabase
      .from("alert_events")
      .select("id, alert_type, created_at, archived_at")
      .in("submission_id", demoSubmissionIds);
    if (reportsError) {
      if (isMissingOptionalTableError(reportsError) || isMissingOptionalColumnError(reportsError)) {
        warnings.push("Alert/report records skipped because the optional alert_events table or archive column is not available in this database.");
      } else {
        warnings.push(`Could not inspect alert/report records: ${reportsError.message}`);
      }
    } else {
      reports = ((rawReports ?? []) as Array<Record<string, unknown>>)
        .filter((report) => !report.archived_at)
        .map((report) => ({
          id: cleanString(report.id),
          alert_type: cleanString(report.alert_type) || null,
          created_at: cleanString(report.created_at) || null,
          match_reason: "Report/alert is linked to a matched submission"
        }))
        .filter((report) => report.id);
    }
  }

  const rules =
    mode === "project"
      ? [
          "Archive the selected project.",
          "Archive submissions where project_id matches the selected project.",
          "Also match legacy submissions where project_name equals the selected project name.",
          "Archive users assigned to the selected project or users who created matched submissions.",
          "Skip optional alert/report records if alert_events does not exist."
        ]
      : mode === "client"
        ? [
            "Archive all projects under the selected Client Company.",
            "Archive submissions where client_id matches the selected Client Company.",
            "Archive submissions attached to any matched project by project_id or project_name.",
            "Archive client users assigned to the selected Client Company and installers tied to matched submissions.",
            "Skip optional alert/report records if alert_events does not exist."
          ]
        : [
            `Known test emails: ${DEMO_EMAILS.join(", ")} plus any @test.com address.`,
            `Known seeded projects: ${DEMO_PROJECT_NAMES.join(", ")}.`,
            "Archive submissions tied to matched users or matched projects.",
            "Skip optional alert/report records if alert_events does not exist."
          ];

  return { mode, selectedClientId, selectedProjectId, clients, projectsForSelectedClient, users, projects, submissions, reports, rules, warnings };
}

export async function GET(request: Request) {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const plan = await getDemoPlan(request.url);
  return NextResponse.json({
    plan,
    counts: {
      users: plan.users.length,
      projects: plan.projects.length,
      submissions: plan.submissions.length,
      reports: plan.reports.length
    }
  });
}

export async function POST(request: Request) {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const supabase = createAdminSupabase();
  const plan = await getDemoPlan(request.url);
  const now = new Date().toISOString();
  const archived = {
    users: 0,
    projects: 0,
    submissions: 0,
    reports: 0
  };
  const errors: string[] = [];

  if (plan.projects.length > 0) {
    const { error } = await supabase
      .from("projects")
      .update({ archived_at: now, status: "Completed" })
      .in("id", plan.projects.map((project) => project.id));
    if (error) errors.push(`Projects: ${error.message}`);
    else archived.projects = plan.projects.length;
  }

  if (plan.users.length > 0) {
    const userIds = plan.users.map((user) => user.user_id);
    const { error: profileError } = await supabase
      .schema("public")
      .from("user_profiles")
      .update({ status: "Archived", archived_at: now, updated_at: now })
      .in("user_id", userIds);
    const { error: installerError } = await supabase
      .from("installers")
      .update({ status: "Inactive", access_status: "Inactive" })
      .in("user_id", userIds);
    if (profileError) errors.push(`Users: ${profileError.message}`);
    else archived.users = plan.users.length;
    if (installerError) errors.push(`Installers: ${installerError.message}`);
  }

  if (plan.submissions.length > 0) {
    const { error } = await supabase
      .from("submissions")
      .update({ archived_at: now })
      .in("id", plan.submissions.map((submission) => submission.id));
    if (error) errors.push(`Submissions: ${error.message}`);
    else archived.submissions = plan.submissions.length;
  }

  if (plan.reports.length > 0) {
    const { error } = await supabase
      .from("alert_events")
      .update({ archived_at: now })
      .in("id", plan.reports.map((report) => report.id));
    if (error && !isMissingOptionalTableError(error) && !isMissingOptionalColumnError(error)) errors.push(`Reports: ${error.message}`);
    else archived.reports = plan.reports.length;
  }

  await writeAuditLog({
    actorUserId: context.user.id,
    targetUserId: null,
    actionType: "demo_data_archived",
    newValue: {
      mode: plan.mode,
      selectedClientId: plan.selectedClientId,
      selectedProjectId: plan.selectedProjectId,
      archived,
      errors,
      archivedAt: now
    }
  }).catch((error) => {
    console.warn("[demo-data] audit log write failed", error);
  });

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: "Some demo records could not be archived. Confirm the latest Supabase migration has been applied.",
        archived,
        errors
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ archived, archivedAt: now });
}
