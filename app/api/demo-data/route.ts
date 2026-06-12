import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { cleanString, requireAdminContext, writeAuditLog } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

const DEMO_EMAILS = ["admin@test.com", "installer@test.com", "darling@test.com", "client@test.com"];
const DEMO_PROJECT_NAMES = ["Salon Dealer Board for Godrej", "MegaGrowth Retail Push"];

type DemoPlan = {
  users: Array<{ user_id: string; email: string; full_name: string; status: string | null }>;
  projects: Array<{ id: string; project_name: string; client_id: string | null; archived_at: string | null }>;
  submissions: Array<{ id: string; project_name: string | null; installer_name: string | null; status: string | null; submitted_at: string | null }>;
  reports: Array<{ id: string; alert_type: string | null; created_at: string | null }>;
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

async function getDemoPlan(): Promise<DemoPlan> {
  const supabase = createAdminSupabase();
  const warnings: string[] = [];
  const [{ data: profiles }, { data: rawProjects }] = await Promise.all([
    supabase.schema("public").from("user_profiles").select("user_id, email, full_name, status, archived_at"),
    supabase.from("projects").select("*")
  ]);

  const users = ((profiles ?? []) as Array<Record<string, unknown>>)
    .filter((profile) => isDemoEmail(profile.email) && normalize(profile.status) !== "archived")
    .map((profile) => ({
      user_id: cleanString(profile.user_id),
      email: cleanString(profile.email),
      full_name: cleanString(profile.full_name) || "Unnamed test user",
      status: cleanString(profile.status) || null
    }))
    .filter((profile) => profile.user_id);

  const projects = ((rawProjects ?? []) as Array<Record<string, unknown>>)
    .filter((project) => isDemoProjectName(projectName(project)) && !project.archived_at)
    .map((project) => ({
      id: cleanString(project.id),
      project_name: projectName(project),
      client_id: cleanString(project.client_id) || null,
      archived_at: cleanString(project.archived_at) || null
    }))
    .filter((project) => project.id);

  const demoUserIds = new Set(users.map((user) => user.user_id));
  const demoProjectIds = new Set(projects.map((project) => project.id));
  const demoProjectNames = new Set(projects.map((project) => normalize(project.project_name)));
  const { data: rawSubmissions, error: submissionsError } = await supabase.from("submissions").select("*");
  if (submissionsError) {
    warnings.push(`Could not inspect submissions: ${submissionsError.message}`);
  }

  const submissions = ((rawSubmissions ?? []) as Array<Record<string, unknown>>)
    .filter((submission) => {
      if (submission.archived_at) return false;
      if (demoUserIds.has(cleanString(submission.installer_user_id))) return true;
      if (isDemoEmail(submission.installer_email)) return true;
      if (demoProjectIds.has(cleanString(submission.project_id))) return true;
      if (demoProjectNames.has(normalize(submission.project_name))) return true;
      return false;
    })
    .map((submission) => ({
      id: cleanString(submission.id),
      project_name: cleanString(submission.project_name) || null,
      installer_name: cleanString(submission.installer_name) || null,
      status: cleanString(submission.status) || null,
      submitted_at: cleanString(submission.submitted_at) || null
    }))
    .filter((submission) => submission.id);

  const demoSubmissionIds = submissions.map((submission) => submission.id);
  let reports: DemoPlan["reports"] = [];
  if (demoSubmissionIds.length > 0) {
    const { data: rawReports, error: reportsError } = await supabase
      .from("alert_events")
      .select("id, alert_type, created_at, archived_at")
      .in("submission_id", demoSubmissionIds);
    if (reportsError) {
      warnings.push(`Could not inspect alert/report records: ${reportsError.message}`);
    } else {
      reports = ((rawReports ?? []) as Array<Record<string, unknown>>)
        .filter((report) => !report.archived_at)
        .map((report) => ({
          id: cleanString(report.id),
          alert_type: cleanString(report.alert_type) || null,
          created_at: cleanString(report.created_at) || null
        }))
        .filter((report) => report.id);
    }
  }

  return { users, projects, submissions, reports, warnings };
}

export async function GET() {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const plan = await getDemoPlan();
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

export async function POST() {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const supabase = createAdminSupabase();
  const plan = await getDemoPlan();
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
    if (error) errors.push(`Reports: ${error.message}`);
    else archived.reports = plan.reports.length;
  }

  await writeAuditLog({
    actorUserId: context.user.id,
    targetUserId: null,
    actionType: "demo_data_archived",
    newValue: { archived, errors, archivedAt: now }
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
