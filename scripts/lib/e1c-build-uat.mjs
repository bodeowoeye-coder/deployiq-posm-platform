import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { assertSafeSupabaseTarget, parseSupabaseDatabaseTarget, parseSupabaseProjectRef } from "./assert-safe-supabase-target.mjs";

export const E1C_FIXTURE = Object.freeze({
  clientId: "e1c00000-0000-4000-8000-000000000001",
  foreignClientId: "e1c00000-0000-4000-8000-000000000002",
  projectId: "e1c10000-0000-4000-8000-000000000001",
  foreignProjectId: "e1c10000-0000-4000-8000-000000000002",
  siteId: "e1c20000-0000-4000-8000-000000000001",
  templateId: "e1c30000-0000-4000-8000-000000000001",
  categoryId: "e1c40000-0000-4000-8000-000000000001",
  organisation: "Meridian Civil Works Ltd",
  project: "Lagos Eastern Drainage & Bridge Rehabilitation — Phase 1",
  projectCode: "MCW-LEK-001",
});

export const E1C_PERSONAS = Object.freeze({
  customerAdmin: ["customer-admin@e1c.deployiq.test", "customer_admin", "Ada Okafor"],
  workspaceOwner: ["workspace-owner@e1c.deployiq.test", "workspace_owner", "Emeka Nwosu"],
  projectManager: ["project-manager@e1c.deployiq.test", "project_manager", "Kemi Adeyemi"],
  supervisor: ["supervisor@e1c.deployiq.test", "supervisor", "Tunde Adebayo"],
  fieldCoordinator: ["field-coordinator@e1c.deployiq.test", "field_coordinator", "Chiamaka Eze"],
  viewer: ["viewer@e1c.deployiq.test", "client_viewer", "Musa Bello"],
  unassigned: ["unassigned@e1c.deployiq.test", "project_manager", "Yusuf Bello"],
  crossTenant: ["cross-tenant@e1c.deployiq.test", "project_manager", "Amaka Obi"],
  retailInstaller: ["retail-installer@e1c.deployiq.test", "installer", "Retail Installer"],
  ambiguousManager: ["historical-manager@e1c.deployiq.test", "workspace_manager", "Historical Workspace Manager"],
});

const WORK_PACKAGES = [
  ["e1c50000-0000-4000-8000-000000000001", "WP-01", "Survey and Site Preparation"],
  ["e1c50000-0000-4000-8000-000000000002", "WP-02", "Drainage and Earthworks"],
  ["e1c50000-0000-4000-8000-000000000003", "WP-03", "Reinforced Concrete Works"],
  ["e1c50000-0000-4000-8000-000000000004", "WP-04", "Inspection and Handover"],
];
const ACTIVITIES = [
  ["e1c60000-0000-4000-8000-000000000001", "A100", "Site survey and set-out", 2, true, true, false],
  ["e1c60000-0000-4000-8000-000000000002", "A110", "Trench excavation", 3, true, false, false],
  ["e1c60000-0000-4000-8000-000000000003", "A120", "Drainage bedding", 2, true, false, false],
  ["e1c60000-0000-4000-8000-000000000004", "A130", "Reinforcement and formwork", 4, true, false, false],
  ["e1c60000-0000-4000-8000-000000000005", "A140", "Concrete pour", 1, true, true, true],
  ["e1c60000-0000-4000-8000-000000000006", "A150", "Curing and quality inspection", 7, false, false, true],
  ["e1c60000-0000-4000-8000-000000000007", "A160", "Section handover", 1, true, false, true],
];

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`e1c_${key.toLowerCase()}_missing`);
  return value;
}

export function assertE1CLocalTarget(env = process.env) {
  if (env.DEPLOYIQ_ENVIRONMENT !== "local") throw new Error("e1c_local_environment_required");
  const apiUrl = required(env, "NEXT_PUBLIC_SUPABASE_URL");
  const dbUrl = required(env, "SUPABASE_DB_URL");
  if (parseSupabaseProjectRef(apiUrl) !== "local") throw new Error("e1c_loopback_api_required");
  if (parseSupabaseDatabaseTarget(dbUrl).kind !== "local") throw new Error("e1c_loopback_database_required");
  assertSafeSupabaseTarget({ operationClass: "E1C synthetic fixture", databaseUrl: dbUrl, env, log: () => {} });
  return { apiUrl, dbUrl };
}

async function must(result, label) {
  if (result.error) throw new Error(`${label}:${result.error.code ?? "unknown"}:${result.error.message}`);
  return result.data;
}

async function findOrCreateUser(admin, email, fullName, password) {
  const listed = await must(await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }), "list_users");
  const existing = listed.users.find((user) => user.email?.toLowerCase() === email);
  if (existing) {
    return (await must(await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { full_name: fullName }, app_metadata: { password_change_required: false, first_login_completed: true } }), "update_user")).user;
  }
  return (await must(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName }, app_metadata: { password_change_required: false, first_login_completed: true } }), "create_user")).user;
}

export async function seedE1CBuildFixture({ env = process.env, outputPath, assertTarget = assertE1CLocalTarget } = {}) {
  const { apiUrl } = assertTarget(env);
  const serviceKey = required(env, "SUPABASE_SERVICE_ROLE_KEY");
  const password = required(env, "E1C_UAT_PASSWORD");
  if (password.length < 12) throw new Error("e1c_password_too_short");
  const admin = createClient(apiUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  await must(await admin.from("clients").upsert([
    { id: E1C_FIXTURE.clientId, name: E1C_FIXTURE.organisation, status: "Active" },
    { id: E1C_FIXTURE.foreignClientId, name: "E1C Foreign Tenant Ltd", status: "Active" },
  ]), "clients");
  await must(await admin.from("projects").upsert([
    { id: E1C_FIXTURE.projectId, client_id: E1C_FIXTURE.clientId, project_name: E1C_FIXTURE.project, project_code: E1C_FIXTURE.projectCode, project_type: "Construction", status: "Active", target_quantity: 0 },
    { id: E1C_FIXTURE.foreignProjectId, client_id: E1C_FIXTURE.foreignClientId, project_name: "Foreign Build Project", project_code: "E1C-XTENANT", project_type: "Construction", status: "Active", target_quantity: 0 },
  ]), "projects");

  const identities = {};
  for (const [key, [email, roleKey, fullName]] of Object.entries(E1C_PERSONAS)) {
    const user = await findOrCreateUser(admin, email, fullName, password);
    identities[key] = { userId: user.id, email, roleKey, fullName };
    const clientId = key === "crossTenant" ? E1C_FIXTURE.foreignClientId : E1C_FIXTURE.clientId;
    const appRole = key === "retailInstaller" ? "installer" : "client";
    await must(await admin.from("user_profiles").upsert({ user_id: user.id, email, full_name: fullName, status: "Active", assigned_project_ids: [
      ...(new Set(["customerAdmin", "workspaceOwner", "projectManager", "fieldCoordinator", "viewer", "ambiguousManager"]).has(key) ? [E1C_FIXTURE.projectId] : []),
      ...(key === "crossTenant" ? [E1C_FIXTURE.foreignProjectId] : []),
    ] }, { onConflict: "user_id" }), `profile_${key}`);
    await must(await admin.from("user_roles").upsert({ user_id: user.id, role: appRole, client_id: key === "retailInstaller" ? null : clientId }, { onConflict: "user_id" }), `user_role_${key}`);
  }

  const roleDefinitions = [
    ["customer_admin", "Customer Admin", ["projects.manage", "reports.view", "notifications.view", "notifications.manage"]],
    ["workspace_owner", "Workspace Owner", ["projects.manage", "reports.view", "notifications.view", "notifications.manage"]],
    ["project_manager", "Project Manager", ["projects.manage", "reports.view", "notifications.view"]],
    ["supervisor", "Supervisor", ["projects.view", "submissions.review", "reports.view", "notifications.view"]],
    ["field_coordinator", "Field Coordinator", ["projects.view", "submissions.create", "evidence.create", "notifications.view"]],
    ["client_viewer", "Client Viewer", ["projects.view", "reports.view", "notifications.view"]],
    ["workspace_manager", "Workspace Manager", ["projects.manage", "reports.view"]],
  ];
  const roles = {};
  for (const clientId of [E1C_FIXTURE.clientId, E1C_FIXTURE.foreignClientId]) {
    for (const [roleKey, label, permissions] of roleDefinitions) {
      const row = await must(await admin.from("workspace_roles").upsert({ client_id: clientId, role_key: roleKey, label, app_role: "client", status: "active" }, { onConflict: "client_id,role_key" }).select("id").single(), `workspace_role_${roleKey}`);
      roles[`${clientId}:${roleKey}`] = row.id;
      await must(await admin.from("workspace_role_permissions").upsert(permissions.map((permission) => ({ role_id: row.id, permission })), { onConflict: "role_id,permission" }), `permissions_${roleKey}`);
    }
  }
  for (const [key, identity] of Object.entries(identities)) {
    if (key === "retailInstaller") continue;
    const clientId = key === "crossTenant" ? E1C_FIXTURE.foreignClientId : E1C_FIXTURE.clientId;
    await must(await admin.from("workspace_memberships").upsert({ client_id: clientId, user_id: identity.userId, role_id: roles[`${clientId}:${identity.roleKey}`], role_key: identity.roleKey, status: "active" }, { onConflict: "client_id,user_id" }), `membership_${key}`);
  }

  await must(await admin.from("build_sites").upsert({ id: E1C_FIXTURE.siteId, client_id: E1C_FIXTURE.clientId, project_id: E1C_FIXTURE.projectId, site_code: "LEK-A", name: "Lekki Corridor — Section A", state: "Lagos", status: "active", created_by: identities.customerAdmin.userId }), "site");
  await must(await admin.from("build_work_package_templates").upsert({ id: E1C_FIXTURE.templateId, client_id: E1C_FIXTURE.clientId, code: "E1C-CIVIL-V1", name: "E1C Civil Works Plan", version: 1, is_global: false, status: "active", created_by: identities.customerAdmin.userId }), "template");
  await must(await admin.from("build_activity_categories").upsert({ id: E1C_FIXTURE.categoryId, template_id: E1C_FIXTURE.templateId, sequence: 1, code: "CIVIL", name: "Civil Works", category_type: "general", status: "active" }), "category");
  await must(await admin.from("build_activity_templates").upsert(ACTIVITIES.map(([id, code, name, duration, mandatory, photo, approval], index) => ({ id, template_id: E1C_FIXTURE.templateId, activity_category_id: E1C_FIXTURE.categoryId, sequence: index + 1, code, name, estimated_duration: duration, duration_unit: "days", mandatory, requires_photo: photo, requires_gps: code === "A100", requires_approval: approval, status: "active" }))), "activities");
  await must(await admin.from("build_activity_template_dependencies").upsert(ACTIVITIES.slice(1).map((activity, index) => ({ id: `e1c70000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, template_id: E1C_FIXTURE.templateId, predecessor_activity_template_id: ACTIVITIES[index][0], successor_activity_template_id: activity[0], dependency_type: "FS", lag_value: 0, lag_unit: "days", mandatory: true }))), "dependencies");
  await must(await admin.from("build_checklist_templates").upsert([
    { id: "e1c80000-0000-4000-8000-000000000001", activity_template_id: ACTIVITIES[4][0], sequence: 1, item: "Confirm reinforcement spacing and concrete cover", mandatory: true, requires_photo: false, requires_comment: true, acceptance_type: "pass_fail" },
    { id: "e1c80000-0000-4000-8000-000000000002", activity_template_id: ACTIVITIES[5][0], sequence: 1, item: "Confirm curing and surface quality", mandatory: true, requires_photo: false, requires_comment: true, acceptance_type: "pass_fail" },
  ]), "checklists");
  await must(await admin.from("build_work_packages").upsert(WORK_PACKAGES.map(([id, code, name], index) => ({ id, client_id: E1C_FIXTURE.clientId, project_id: E1C_FIXTURE.projectId, site_id: E1C_FIXTURE.siteId, template_id: index === 2 ? E1C_FIXTURE.templateId : null, code, name, status: "active", created_by: identities.customerAdmin.userId }))), "work_packages");

  const manifest = { schemaVersion: 1, fixture: E1C_FIXTURE, workPackages: WORK_PACKAGES.map(([id, code, name]) => ({ id, code, name })), activityTemplates: ACTIVITIES.map(([id, code, name]) => ({ id, code, name })), identities };
  if (outputPath) await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifest;
}
