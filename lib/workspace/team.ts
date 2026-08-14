import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { writeAuditLog } from "@/lib/userManagement";
import {
  resolveCustomerWorkspaceContext,
  type CustomerWorkspaceContext,
  workspacePerformanceLog,
} from "@/lib/workspace/customerAdmin";

export type WorkspaceTeamRoleKey =
  | "primary_administrator"
  | "administrator"
  | "project_manager"
  | "supervisor"
  | "field_coordinator"
  | "installer"
  | "viewer";

export type WorkspaceTeamMemberStatus = "Active" | "Pending Invitation" | "Suspended" | "Disabled";

export type WorkspaceTeamMember = {
  id: string;
  userId: string;
  avatarInitials: string;
  fullName: string;
  email: string;
  roleKey: WorkspaceTeamRoleKey;
  roleLabel: string;
  status: WorkspaceTeamMemberStatus;
  lastActive: string | null;
  joinedDate: string | null;
  invitationStatus: string;
  invitationDeliveryStatus?: "not_applicable" | "link_created" | "delivery_not_configured" | "sent" | "failed";
  assignedProjectNames: string[];
  assignedRegions: string[];
  showsAssignedProjects: boolean;
  recentActivity: string[];
  isCurrentUser: boolean;
  isPrimaryAdministrator: boolean;
};

export type WorkspaceTeamInvitation = {
  id: string;
  userId: string;
  name: string;
  email: string;
  roleKey: WorkspaceTeamRoleKey;
  roleLabel: string;
  status: WorkspaceTeamMemberStatus;
  createdAt: string | null;
  invitationStatus: string;
  invitationDeliveryStatus: "link_created" | "delivery_not_configured" | "sent" | "failed";
  invitationLink: string | null;
};

export type WorkspaceTeamAuditEvent = {
  id: string;
  action: string;
  actor: string;
  target: string;
  createdAt: string | null;
};

export type WorkspacePermissionSection = {
  key: string;
  label: string;
  permissions: { key: string; label: string }[];
};

export type WorkspaceTeamRoleDefinition = {
  key: WorkspaceTeamRoleKey;
  label: string;
  description: string;
  appRole: "admin" | "client" | "installer";
  technicalRoleKey: string;
  permissions: string[];
};

export type InvitationIdentityState = "new_user" | "existing_user" | "already_member" | "pending_invitation";

export type WorkspaceInvitationPrecheck = {
  state: InvitationIdentityState;
  message: string;
  email: string;
  displayName: string | null;
  roleLabel?: string | null;
  membershipId?: string | null;
  invitationLink?: string | null;
  nameMismatch: boolean;
};

export type WorkspaceTeamDashboard = {
  workspace: CustomerWorkspaceContext;
  canManageTeam: boolean;
  members: WorkspaceTeamMember[];
  invitations: WorkspaceTeamInvitation[];
  roles: WorkspaceTeamRoleDefinition[];
  permissionMatrix: WorkspacePermissionSection[];
  auditLog: WorkspaceTeamAuditEvent[];
  summary: {
    workspaceMembers: number;
    pendingInvitations: number;
    availableLicences: string;
    activeSessions: number;
    primaryAdministrator: string;
    recentlyJoinedUsers: WorkspaceTeamMember[];
    licenceSummary: {
      seatAllowance: number | null;
      allowanceSource: "not_configured";
      activeUsersCounted: number;
      pendingInvitationsCounted: number;
      disabledUsersCounted: number;
      pendingInvitationsReserveSeats: boolean;
    };
  };
};

type WorkspaceInvitationDuplicate = {
  state: "available" | "already_member" | "pending_invitation";
  membershipId: string | null;
};

const FIELD_ASSIGNMENT_ROLE_KEYS = new Set<WorkspaceTeamRoleKey>([
  "project_manager",
  "supervisor",
  "field_coordinator",
  "installer",
]);

export const CUSTOMER_WORKSPACE_ROLES: WorkspaceTeamRoleDefinition[] = [
  {
    key: "primary_administrator",
    label: "Primary Administrator",
    description: "Owns the workspace, billing, security and administrator recovery.",
    appRole: "client",
    technicalRoleKey: "customer_admin",
    permissions: ["projects.manage", "campaigns.manage", "submissions.review", "deployment_locations.manage", "reports.view", "analytics.view", "users.manage", "billing.view", "settings.manage", "notifications.manage"],
  },
  {
    key: "administrator",
    label: "Administrator",
    description: "Manages workspace configuration, users and operational modules.",
    appRole: "client",
    technicalRoleKey: "workspace_manager",
    permissions: ["projects.manage", "campaigns.manage", "submissions.review", "deployment_locations.manage", "reports.view", "analytics.view", "users.manage", "settings.manage", "notifications.manage"],
  },
  {
    key: "project_manager",
    label: "Project Manager",
    description: "Creates projects, manages campaigns and reviews delivery progress.",
    appRole: "client",
    technicalRoleKey: "project_manager",
    permissions: ["projects.manage", "campaigns.manage", "submissions.review", "deployment_locations.view", "reports.view", "analytics.view", "notifications.view"],
  },
  {
    key: "supervisor",
    label: "Supervisor",
    description: "Reviews submissions and coordinates assigned field activity.",
    appRole: "client",
    technicalRoleKey: "workspace_manager",
    permissions: ["projects.view", "campaigns.view", "submissions.review", "deployment_locations.view", "reports.view", "notifications.view"],
  },
  {
    key: "field_coordinator",
    label: "Field Coordinator",
    description: "Coordinates installers, locations and field readiness.",
    appRole: "client",
    technicalRoleKey: "agency_manager",
    permissions: ["projects.view", "campaigns.view", "deployment_locations.manage", "submissions.view", "notifications.view"],
  },
  {
    key: "installer",
    label: "Installer",
    description: "Submits assigned field work and views assigned projects and territories.",
    appRole: "installer",
    technicalRoleKey: "installer",
    permissions: ["projects.view", "campaigns.view", "deployment_locations.view", "submissions.view", "notifications.view"],
  },
  {
    key: "viewer",
    label: "Viewer",
    description: "Reads workspace projects, reports and activity without making changes.",
    appRole: "client",
    technicalRoleKey: "client_viewer",
    permissions: ["projects.view", "campaigns.view", "submissions.view", "deployment_locations.view", "reports.view", "analytics.view", "notifications.view"],
  },
];

export const CUSTOMER_WORKSPACE_PERMISSION_MATRIX: WorkspacePermissionSection[] = [
  { key: "projects", label: "Projects", permissions: [{ key: "projects.view", label: "View" }, { key: "projects.manage", label: "Manage" }] },
  { key: "campaigns", label: "Campaigns", permissions: [{ key: "campaigns.view", label: "View" }, { key: "campaigns.manage", label: "Manage" }] },
  { key: "submissions", label: "Submissions", permissions: [{ key: "submissions.view", label: "View" }, { key: "submissions.review", label: "Review" }] },
  { key: "deployment_locations", label: "Deployment Locations", permissions: [{ key: "deployment_locations.view", label: "View" }, { key: "deployment_locations.manage", label: "Manage" }] },
  { key: "reports", label: "Reports", permissions: [{ key: "reports.view", label: "View" }] },
  { key: "analytics", label: "Analytics", permissions: [{ key: "analytics.view", label: "View" }] },
  { key: "users", label: "Users", permissions: [{ key: "users.manage", label: "Manage" }] },
  { key: "billing", label: "Billing", permissions: [{ key: "billing.view", label: "View" }] },
  { key: "settings", label: "Settings", permissions: [{ key: "settings.manage", label: "Manage" }] },
  { key: "notifications", label: "Notifications", permissions: [{ key: "notifications.view", label: "View" }, { key: "notifications.manage", label: "Manage" }] },
];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function elapsedMs(startedAt: number) {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

export function teamPerformanceLog(input: {
  operation: string;
  step: string;
  elapsedMs: number;
  totalElapsedMs?: number | null;
}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[team-performance]", {
    operation: input.operation,
    step: input.step,
    elapsedMs: input.elapsedMs,
    totalElapsedMs: input.totalElapsedMs ?? input.elapsedMs,
  });
}

export function invitePerformanceLog(input: {
  operation: string;
  step: string;
  elapsedMs: number;
  totalElapsedMs?: number | null;
}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[invite-performance]", {
    operation: input.operation,
    step: input.step,
    elapsedMs: input.elapsedMs,
    totalElapsedMs: input.totalElapsedMs ?? input.elapsedMs,
  });
}

function normalizeEmail(value: unknown) {
  return text(value).toLowerCase();
}

function roleDefinition(roleKey: string) {
  return CUSTOMER_WORKSPACE_ROLES.find((role) => role.key === roleKey || role.technicalRoleKey === roleKey) ?? CUSTOMER_WORKSPACE_ROLES[5];
}

function statusLabel(status: string): WorkspaceTeamMemberStatus {
  if (status === "active" || status === "Active") return "Active";
  if (status === "invited" || status === "pending") return "Pending Invitation";
  if (status === "suspended") return "Suspended";
  return "Disabled";
}

function initials(name: string, email: string) {
  const source = name || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "U").concat(parts[1]?.[0] ?? "").toUpperCase();
}

function accountNameFromAuthUser(user: { user_metadata?: Record<string, unknown> | null; email?: string | null } | null | undefined) {
  const metadata = user?.user_metadata ?? {};
  return text(metadata.full_name) || text(metadata.name) || text(user?.email).split("@")[0] || null;
}

function invitationRedirectTo() {
  const baseUrl = text(process.env.NEXT_PUBLIC_APP_URL) || text(process.env.NEXT_PUBLIC_SITE_URL);
  const path = "/workspace/admin";
  return baseUrl ? `${baseUrl.replace(/\/+$/, "")}${path}` : path;
}

function namesDiffer(enteredName: string, existingName: string | null) {
  if (!enteredName || !existingName) return false;
  return enteredName.trim().toLowerCase() !== existingName.trim().toLowerCase();
}

async function loadAuthUsersByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const users: Array<{ id: string; email: string | null; user_metadata: Record<string, unknown> | null; created_at: string | null; last_sign_in_at: string | null }> = [];
  const supabase = createAdminSupabase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const pageUsers = data.users ?? [];
    for (const user of pageUsers) {
      if (normalizeEmail(user.email) === normalizedEmail) {
        users.push({
          id: user.id,
          email: user.email ?? null,
          user_metadata: user.user_metadata ?? null,
          created_at: user.created_at ?? null,
          last_sign_in_at: user.last_sign_in_at ?? null,
        });
      }
    }
    if (pageUsers.length < 1000) break;
  }
  return users;
}

async function getWorkspaceRoleId(clientId: string, roleKey: WorkspaceTeamRoleKey) {
  const definition = roleDefinition(roleKey);
  const supabase = createAdminSupabase();
  const { data: existing, error } = await supabase
    .from("workspace_roles")
    .select("id")
    .eq("client_id", clientId)
    .eq("role_key", definition.technicalRoleKey)
    .maybeSingle();
  if (error) throw error;
  if (existing?.id) return String(existing.id);

  const { data, error: insertError } = await supabase
    .from("workspace_roles")
    .insert({
      client_id: clientId,
      role_key: definition.technicalRoleKey,
      label: definition.label,
      description: definition.description,
      app_role: definition.appRole,
      status: "active",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return String(data.id);
}

async function loadAuthUsersById(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const users = new Map<string, { email: string | null; lastSignInAt: string | null; createdAt: string | null }>();
  await Promise.all(uniqueIds.map(async (userId) => {
    const { data } = await createAdminSupabase().auth.admin.getUserById(userId);
    if (data.user) {
      users.set(userId, {
        email: data.user.email ?? null,
        lastSignInAt: data.user.last_sign_in_at ?? null,
        createdAt: data.user.created_at ?? null,
      });
    }
  }));
  return users;
}

function displayUserName(userId: string, profilesById: Map<string, Record<string, unknown>>, authUsers: Map<string, { email: string | null; lastSignInAt: string | null; createdAt: string | null }>) {
  if (!userId) return "";
  const profile = profilesById.get(userId);
  const auth = authUsers.get(userId);
  return text(profile?.full_name) || text(profile?.email) || text(auth?.email);
}

type TeamAssignmentSummary = {
  assignedProjectNames: string[];
  assignedRegions: string[];
};

async function loadTeamAssignmentSummaries(workspace: CustomerWorkspaceContext, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.map((userId) => text(userId)).filter(Boolean))];
  const summaries = new Map<string, TeamAssignmentSummary>();
  for (const userId of uniqueUserIds) summaries.set(userId, { assignedProjectNames: [], assignedRegions: [] });
  if (uniqueUserIds.length === 0) return summaries;

  try {
    const supabase = createAdminSupabase();
    const { data: installers, error: installersError } = await supabase
      .from("installers")
      .select("id,user_id,assigned_regions,assigned_states")
      .eq("client_id", workspace.clientId)
      .in("user_id", uniqueUserIds);
    if (installersError) throw installersError;

    const installerUserById = new Map<string, string>();
    for (const row of (installers ?? []) as Array<Record<string, unknown>>) {
      const installerId = text(row.id);
      const userId = text(row.user_id);
      if (!installerId || !userId) continue;
      installerUserById.set(installerId, userId);
      const summary = summaries.get(userId) ?? { assignedProjectNames: [], assignedRegions: [] };
      const regions = Array.isArray(row.assigned_regions) ? row.assigned_regions : row.assigned_states;
      for (const region of Array.isArray(regions) ? regions : []) {
        const label = text(region);
        if (label && !summary.assignedRegions.includes(label)) summary.assignedRegions.push(label);
      }
      summaries.set(userId, summary);
    }

    const assignmentUserIds = new Set(uniqueUserIds);
    const { data: assignments, error: assignmentsError } = await supabase
      .from("workspace_field_assignments")
      .select("project_id,installer_id,supervisor_id,coordinator_id")
      .eq("client_id", workspace.clientId)
      .eq("workspace_id", workspace.clientId)
      .is("removed_at", null)
      .limit(5000);
    if (assignmentsError) throw assignmentsError;

    const assignmentsByUser = new Map<string, Set<string>>();
    const projectIds = new Set<string>();
    for (const row of (assignments ?? []) as Array<Record<string, unknown>>) {
      const projectId = text(row.project_id);
      if (!projectId) continue;
      const usersForAssignment = [
        installerUserById.get(text(row.installer_id)) ?? "",
        text(row.supervisor_id),
        text(row.coordinator_id),
      ].filter((userId) => assignmentUserIds.has(userId));
      for (const userId of usersForAssignment) {
        if (!assignmentsByUser.has(userId)) assignmentsByUser.set(userId, new Set());
        assignmentsByUser.get(userId)?.add(projectId);
        projectIds.add(projectId);
      }
    }

    const projectNameById = new Map<string, string>();
    if (projectIds.size > 0) {
      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id,name,campaign")
        .eq("client_id", workspace.clientId)
        .in("id", [...projectIds]);
      if (projectsError) throw projectsError;
      for (const row of (projects ?? []) as Array<Record<string, unknown>>) {
        const projectId = text(row.id);
        if (projectId) projectNameById.set(projectId, text(row.name) || text(row.campaign) || projectId);
      }
    }

    for (const [userId, assignedProjectIds] of assignmentsByUser) {
      const summary = summaries.get(userId) ?? { assignedProjectNames: [], assignedRegions: [] };
      summary.assignedProjectNames = [...assignedProjectIds].map((projectId) => projectNameById.get(projectId) ?? projectId).sort((a, b) => a.localeCompare(b));
      summaries.set(userId, summary);
    }
  } catch (error) {
    console.warn("[team-performance]", {
      operation: "team_dashboard",
      step: "Optional assigned projects skipped",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return summaries;
}

function auditActionLabel(row: Record<string, unknown>) {
  const actionType = text(row.action_type);
  const newValue = typeof row.new_value === "object" && row.new_value ? row.new_value as Record<string, unknown> : {};
  const role = text(newValue.role);
  if (actionType === "invitation_link_generated") return role ? `Invitation link created for ${role}` : "Invitation link created";
  if (actionType === "user_invited") return role ? `Invitation created for ${role}` : "Invitation created";
  if (actionType === "invitation_resent") return "Invitation link regenerated";
  if (actionType === "invitation_cancelled") return "Invitation cancelled";
  if (actionType === "role_changed") return role ? `Role changed to ${role}` : "Role changed";
  if (actionType === "permission_updated") return role ? `${role} permissions updated` : "Permissions updated";
  if (actionType === "user_removed") return "User removed";
  return actionType.replace(/_/g, " ") || "Workspace activity";
}

async function roleDefinitionsForWorkspace(clientId: string) {
  const supabase = createAdminSupabase();
  const { data: roles } = await supabase.from("workspace_roles").select("id,role_key").eq("client_id", clientId).eq("status", "active");
  const roleIdByTechnicalKey = new Map<string, string>();
  for (const row of (roles ?? []) as Array<Record<string, unknown>>) {
    const definition = CUSTOMER_WORKSPACE_ROLES.find((role) => role.technicalRoleKey === text(row.role_key));
    const roleId = text(row.id);
    if (definition && roleId) roleIdByTechnicalKey.set(definition.technicalRoleKey, roleId);
  }

  const roleIds = [...roleIdByTechnicalKey.values()];
  const { data: permissionRows } = roleIds.length > 0
    ? await supabase.from("workspace_role_permissions").select("role_id,permission").in("role_id", roleIds)
    : { data: [] };
  const permissionsByRoleId = new Map<string, string[]>();
  for (const row of (permissionRows ?? []) as Array<Record<string, unknown>>) {
    const roleId = text(row.role_id);
    const permission = text(row.permission);
    if (!roleId || !permission) continue;
    permissionsByRoleId.set(roleId, [...(permissionsByRoleId.get(roleId) ?? []), permission]);
  }

  return CUSTOMER_WORKSPACE_ROLES.map((role) => {
    const roleId = roleIdByTechnicalKey.get(role.technicalRoleKey);
    return {
      ...role,
      permissions: roleId && permissionsByRoleId.has(roleId) ? permissionsByRoleId.get(roleId)! : role.permissions,
    };
  });
}

async function resolveWorkspaceInvitationIdentity(workspace: CustomerWorkspaceContext, email: string, enteredName = ""): Promise<WorkspaceInvitationPrecheck & { userId: string | null; profileExists: boolean }> {
  const totalStartedAt = nowMs();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw Object.assign(new Error("Enter a valid email address."), { status: 400 });
  const supabase = createAdminSupabase();
  const identityStartedAt = nowMs();
  const [{ data: profiles, error: profilesError }, authUsers] = await Promise.all([
    supabase.schema("public").from("user_profiles").select("user_id,full_name,email,status,created_at,updated_at").ilike("email", normalizedEmail).limit(10),
    loadAuthUsersByEmail(normalizedEmail),
  ]);
  if (profilesError) throw profilesError;
  invitePerformanceLog({
    operation: "identity_precheck",
    step: "Auth identity lookup",
    elapsedMs: elapsedMs(identityStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });

  const profileRows = ((profiles ?? []) as Array<Record<string, unknown>>).filter((profile) => normalizeEmail(profile.email) === normalizedEmail);
  const userIds = [...new Set([...profileRows.map((profile) => text(profile.user_id)), ...authUsers.map((user) => user.id)].filter(Boolean))];
  const membershipStartedAt = nowMs();
  const { data: memberships, error: membershipsError } = userIds.length > 0
    ? await supabase.from("workspace_memberships").select("id,user_id,role_key,status,created_at").eq("client_id", workspace.clientId).in("user_id", userIds)
    : { data: [], error: null };
  if (membershipsError) throw membershipsError;
  invitePerformanceLog({
    operation: "identity_precheck",
    step: "Membership lookup",
    elapsedMs: elapsedMs(membershipStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });

  const membership = ((memberships ?? []) as Array<Record<string, unknown>>)[0] ?? null;
  const role = membership ? roleDefinition(text(membership.role_key)) : null;
  const existingUserId = authUsers[0]?.id ?? (text(profileRows[0]?.user_id) || null);
  const profile = existingUserId ? profileRows.find((row) => text(row.user_id) === existingUserId) ?? profileRows[0] : null;
  const authUser = existingUserId ? authUsers.find((user) => user.id === existingUserId) ?? authUsers[0] : null;
  const displayName = text(profile?.full_name) || accountNameFromAuthUser(authUser) || null;
  const base = {
    email: normalizedEmail,
    displayName,
    roleLabel: role?.label ?? null,
    membershipId: membership ? text(membership.id) : null,
    invitationLink: null,
    nameMismatch: namesDiffer(enteredName, displayName),
    userId: existingUserId,
    profileExists: Boolean(profile),
  };

  if (membership && text(membership.status) === "active") {
    return { ...base, state: "already_member", message: "This person already belongs to this workspace." };
  }
  if (membership && text(membership.status) === "invited") {
    return { ...base, state: "pending_invitation", message: "An invitation is already pending for this email." };
  }
  if (existingUserId) {
    return {
      ...base,
      state: "existing_user",
      message: displayName
        ? `This email already belongs to ${displayName} on DeployIQ.`
        : "This email is already associated with an existing DeployIQ account.",
    };
  }

  return { ...base, state: "new_user", message: "No existing DeployIQ account was found for this email.", userId: null, profileExists: false };
}

async function checkWorkspaceInvitationDuplicateByEmail(clientId: string, email: string): Promise<WorkspaceInvitationDuplicate> {
  const normalizedEmail = normalizeEmail(email);
  const supabase = createAdminSupabase();
  const { data: memberships, error: membershipsError } = await supabase
    .from("workspace_memberships")
    .select("id,user_id,status")
    .eq("client_id", clientId)
    .in("status", ["active", "invited"]);
  if (membershipsError) throw membershipsError;

  const membershipRows = (memberships ?? []) as Array<Record<string, unknown>>;
  const userIds = [...new Set(membershipRows.map((membership) => text(membership.user_id)).filter(Boolean))];
  if (userIds.length === 0) return { state: "available", membershipId: null };

  const { data: profiles, error: profilesError } = await supabase
    .schema("public")
    .from("user_profiles")
    .select("user_id,email")
    .in("user_id", userIds);
  if (profilesError) throw profilesError;

  const profileByUserId = new Map(((profiles ?? []) as Array<Record<string, unknown>>).map((profile) => [text(profile.user_id), normalizeEmail(profile.email)]));
  const duplicate = membershipRows.find((membership) => profileByUserId.get(text(membership.user_id)) === normalizedEmail);
  if (!duplicate) return { state: "available", membershipId: null };
  return {
    state: text(duplicate.status) === "invited" ? "pending_invitation" : "already_member",
    membershipId: text(duplicate.id) || null,
  };
}

async function generateInvitationLink(input: { email: string; name: string; supabase: ReturnType<typeof createAdminSupabase> }) {
  const inviteResult = await input.supabase.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: {
      data: { full_name: input.name },
      redirectTo: invitationRedirectTo(),
    },
  });
  if (!inviteResult.error) return inviteResult;

  const magicLinkResult = await input.supabase.auth.admin.generateLink({
    type: "magiclink",
    email: input.email,
    options: {
      redirectTo: invitationRedirectTo(),
    },
  });
  if (!magicLinkResult.error) return magicLinkResult;
  throw inviteResult.error;
}

export async function precheckWorkspaceInvitation(input: { name?: string; email: string }): Promise<WorkspaceInvitationPrecheck> {
  const totalStartedAt = nowMs();
  const contextStartedAt = nowMs();
  const workspace = await resolveCustomerWorkspaceContext();
  invitePerformanceLog({
    operation: "identity_precheck",
    step: "Context resolution",
    elapsedMs: elapsedMs(contextStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  assertCanManage(workspace);
  const precheckStartedAt = nowMs();
  const result = await resolveWorkspaceInvitationIdentity(workspace, normalizeEmail(input.email), text(input.name));
  invitePerformanceLog({
    operation: "identity_precheck",
    step: "Identity precheck total",
    elapsedMs: elapsedMs(precheckStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  return {
    state: result.state,
    message: result.message,
    email: result.email,
    displayName: result.displayName,
    roleLabel: result.roleLabel,
    membershipId: result.membershipId,
    invitationLink: result.invitationLink,
    nameMismatch: result.nameMismatch,
  };
}

export async function getWorkspaceTeamDashboard(): Promise<WorkspaceTeamDashboard> {
  const totalStartedAt = nowMs();
  const workspace = await resolveCustomerWorkspaceContext();
  const supabase = createAdminSupabase();
  const [
    roleDefinitions,
    { data: memberships, error: membershipsError },
    { data: profiles, error: profilesError },
    { data: auditRows },
  ] = await Promise.all([
    roleDefinitionsForWorkspace(workspace.clientId),
    supabase.from("workspace_memberships").select("id,user_id,role_key,status,created_at,updated_at").eq("client_id", workspace.clientId).order("created_at", { ascending: true }),
    supabase.schema("public").from("user_profiles").select("user_id,full_name,email,status,created_at,updated_at").limit(1000),
    supabase.from("audit_logs").select("id,action_type,actor_user_id,target_user_id,created_at,new_value").order("created_at", { ascending: false }).limit(25),
  ]);
  if (membershipsError) throw membershipsError;
  if (profilesError) throw profilesError;

  const userIds = (memberships ?? []).map((membership) => text(membership.user_id));
  const authStartedAt = nowMs();
  const authUsers = await loadAuthUsersById(userIds);
  workspacePerformanceLog({
    route: "/workspace/admin/team",
    step: "Team auth users lookup",
    elapsedMs: elapsedMs(authStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  const profilesById = new Map((profiles ?? []).map((profile) => [text(profile.user_id), profile as Record<string, unknown>]));
  const assignmentSummaries = await loadTeamAssignmentSummaries(workspace, userIds);

  const members: WorkspaceTeamMember[] = ((memberships ?? []) as Array<Record<string, unknown>>).map((membership) => {
    const userId = text(membership.user_id);
    const profile = profilesById.get(userId);
    const auth = authUsers.get(userId);
    const email = text(profile?.email) || text(auth?.email) || "pending-user@workspace.local";
    const fullName = text(profile?.full_name) || email.split("@")[0] || "Workspace user";
    const role = roleDefinition(text(membership.role_key));
    const status = statusLabel(text(membership.status));
    const assignmentSummary = assignmentSummaries.get(userId) ?? { assignedProjectNames: [], assignedRegions: [] };
    return {
      id: text(membership.id),
      userId,
      avatarInitials: initials(fullName, email),
      fullName,
      email,
      roleKey: role.key,
      roleLabel: role.label,
      status,
      lastActive: auth?.lastSignInAt ?? null,
      joinedDate: text(membership.created_at) || (auth?.createdAt ?? null),
      invitationStatus: status === "Pending Invitation" ? "Invitation sent" : "Accepted",
      invitationDeliveryStatus: status === "Pending Invitation" ? "link_created" : "not_applicable",
      assignedProjectNames: assignmentSummary.assignedProjectNames,
      assignedRegions: assignmentSummary.assignedRegions,
      showsAssignedProjects: FIELD_ASSIGNMENT_ROLE_KEYS.has(role.key),
      recentActivity: [
        `${role.label} access assigned`,
        status === "Pending Invitation" ? "Invitation awaiting acceptance" : "Workspace access active",
      ],
      isCurrentUser: userId === workspace.userId,
      isPrimaryAdministrator: role.key === "primary_administrator" || text(membership.role_key) === "customer_admin",
    };
  });

  const invitations: WorkspaceTeamInvitation[] = members
    .filter((member) => member.status === "Pending Invitation")
    .map((member) => {
      const deliveryStatus: WorkspaceTeamInvitation["invitationDeliveryStatus"] =
        member.invitationDeliveryStatus === "delivery_not_configured" ? "delivery_not_configured" : "link_created";
      return {
        id: member.id,
        userId: member.userId,
        name: member.fullName,
        email: member.email,
        roleKey: member.roleKey,
        roleLabel: member.roleLabel,
        status: member.status,
        createdAt: member.joinedDate,
        invitationStatus: member.invitationStatus,
        invitationDeliveryStatus: deliveryStatus,
        invitationLink: null,
      };
    });

  const activeSessions = members.filter((member) => {
    if (!member.lastActive) return false;
    return Date.now() - new Date(member.lastActive).getTime() < 1000 * 60 * 60 * 24;
  }).length;
  const recentlyJoinedUsers = [...members].sort((a, b) => new Date(b.joinedDate ?? 0).getTime() - new Date(a.joinedDate ?? 0).getTime()).slice(0, 5);
  const primaryAdministrator = members.find((member) => member.isPrimaryAdministrator)?.fullName ?? workspace.email ?? "Primary Administrator";
  const activeUsersCounted = members.filter((member) => member.status === "Active").length;
  const pendingInvitationsCounted = invitations.length;
  const disabledUsersCounted = members.filter((member) => member.status === "Disabled").length;
  const seatAllowance: number | null = null;

  const auditLog: WorkspaceTeamAuditEvent[] = ((auditRows ?? []) as Array<Record<string, unknown>>)
    .filter((row) => JSON.stringify(row.new_value ?? {}).includes(workspace.clientId))
    .map((row) => ({
      id: text(row.id),
      action: auditActionLabel(row),
      actor: displayUserName(text(row.actor_user_id), profilesById, authUsers) || "DeployIQ",
      target: displayUserName(text(row.target_user_id), profilesById, authUsers) || "Workspace",
      createdAt: text(row.created_at) || null,
    }));

  const dashboard = {
    workspace,
    canManageTeam: workspace.role === "customer_admin",
    members,
    invitations,
    roles: roleDefinitions,
    permissionMatrix: CUSTOMER_WORKSPACE_PERMISSION_MATRIX,
    auditLog,
    summary: {
      workspaceMembers: members.filter((member) => member.status === "Active").length,
      pendingInvitations: invitations.length,
      availableLicences: seatAllowance === null ? "Not configured" : String(Math.max(0, seatAllowance - activeUsersCounted - pendingInvitationsCounted)),
      activeSessions,
      primaryAdministrator,
      recentlyJoinedUsers,
      licenceSummary: {
        seatAllowance,
        allowanceSource: "not_configured" as const,
        activeUsersCounted,
        pendingInvitationsCounted,
        disabledUsersCounted,
        pendingInvitationsReserveSeats: true,
      },
    },
  };
  workspacePerformanceLog({
    route: "/workspace/admin/team",
    step: "Team & Users dashboard query",
    elapsedMs: elapsedMs(totalStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  return dashboard;
}

function assertCanManage(workspace: CustomerWorkspaceContext) {
  if (workspace.role !== "customer_admin") {
    throw Object.assign(new Error("This account has read-only team access."), { status: 403 });
  }
}

export async function inviteWorkspaceUser(input: {
  name: string;
  email: string;
  roleKey: WorkspaceTeamRoleKey;
  sendEmail?: boolean;
}) {
  const totalStartedAt = nowMs();
  const contextStartedAt = nowMs();
  const workspace = await resolveCustomerWorkspaceContext();
  invitePerformanceLog({
    operation: "invite_user",
    step: "Context resolution",
    elapsedMs: elapsedMs(contextStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  assertCanManage(workspace);
  const name = text(input.name);
  const email = normalizeEmail(input.email);
  if (!name || !email || !email.includes("@")) throw Object.assign(new Error("Enter a valid name and email address."), { status: 400 });
  const role = roleDefinition(input.roleKey);
  if (role.key === "primary_administrator") throw Object.assign(new Error("Primary Administrator cannot be assigned through invitation."), { status: 400 });

  const supabase = createAdminSupabase();
  const duplicateStartedAt = nowMs();
  const duplicate = await checkWorkspaceInvitationDuplicateByEmail(workspace.clientId, email);
  invitePerformanceLog({
    operation: "invite_user",
    step: "Workspace duplicate check",
    elapsedMs: elapsedMs(duplicateStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  if (duplicate.state === "already_member") throw Object.assign(new Error("This person already belongs to this workspace."), { status: 409 });
  if (duplicate.state === "pending_invitation") throw Object.assign(new Error("An invitation is already pending for this email."), { status: 409 });

  const linkStartedAt = nowMs();
  const generated = await generateInvitationLink({ email, name, supabase });
  invitePerformanceLog({
    operation: "invite_user",
    step: "Generate invitation link",
    elapsedMs: elapsedMs(linkStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  const userId = generated.data.user?.id ?? "";
  const actionLink = generated.data.properties?.action_link ?? null;
  if (!userId) throw Object.assign(new Error("Could not create the invitation."), { status: 500 });
  if (!actionLink) throw Object.assign(new Error("Could not create a secure invitation link."), { status: 500 });

  const profileStartedAt = nowMs();
  const { data: profile, error: profileLookupError } = await supabase.schema("public").from("user_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (profileLookupError) throw profileLookupError;
  if (!profile?.user_id) {
    const { error: profileError } = await supabase.schema("public").from("user_profiles").upsert({
      user_id: userId,
      full_name: name,
      email,
      status: "Invited",
    }, { onConflict: "user_id" });
    if (profileError) throw profileError;
  }
  invitePerformanceLog({
    operation: "invite_user",
    step: "Profile persistence",
    elapsedMs: elapsedMs(profileStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });

  const userRoleStartedAt = nowMs();
  const { data: existingRole, error: roleLookupError } = await supabase.schema("public").from("user_roles").select("user_id").eq("user_id", userId).maybeSingle();
  if (roleLookupError) throw roleLookupError;
  if (!existingRole) {
    const { error: userRoleError } = await supabase.schema("public").from("user_roles").insert({
      user_id: userId,
      role: "client",
      client_id: workspace.clientId,
    });
    if (userRoleError) throw userRoleError;
  }
  invitePerformanceLog({
    operation: "invite_user",
    step: "User role persistence",
    elapsedMs: elapsedMs(userRoleStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });

  const roleStartedAt = nowMs();
  const roleId = await getWorkspaceRoleId(workspace.clientId, role.key);
  invitePerformanceLog({
    operation: "invite_user",
    step: "Role lookup",
    elapsedMs: elapsedMs(roleStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  const persistStartedAt = nowMs();
  const { data: membership, error } = await supabase.from("workspace_memberships").insert({
    client_id: workspace.clientId,
    user_id: userId,
    role_id: roleId,
    role_key: role.technicalRoleKey,
    status: "invited",
  }).select("id,created_at").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw Object.assign(new Error("This person already belongs to this workspace or has a pending invitation."), { status: 409 });
    }
    throw error;
  }
  invitePerformanceLog({
    operation: "invite_user",
    step: "Membership persistence",
    elapsedMs: elapsedMs(persistStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  const actionType = input.sendEmail === false ? "invitation_link_generated" : "user_invited";
  const deliveryStatus = input.sendEmail === false ? "link_created" : "delivery_not_configured";
  const auditStartedAt = nowMs();
  void writeAuditLog({
    actorUserId: workspace.userId,
    targetUserId: userId,
    actionType,
    newValue: { clientId: workspace.clientId, role: role.label, deliveryStatus },
  }).catch((error) => {
    console.warn("[invite-performance]", {
      operation: "invite_user",
      step: "Audit write",
      result: "failed_after_response",
      error: error instanceof Error ? error.message : "Unknown audit error",
    });
  });
  invitePerformanceLog({
    operation: "invite_user",
    step: "Audit scheduled",
    elapsedMs: elapsedMs(auditStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  invitePerformanceLog({
    operation: "invite_user",
    step: "Email delivery",
    elapsedMs: 0,
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  invitePerformanceLog({
    operation: "invite_user",
    step: "Total",
    elapsedMs: elapsedMs(totalStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  const displayName = name;
  const deliveryMessage = "Invitation created. Email delivery is not configured. Copy the invitation link to share it manually.";
  const member: WorkspaceTeamMember = {
    id: text(membership.id),
    userId,
    avatarInitials: initials(displayName, email),
    fullName: displayName,
    email,
    roleKey: role.key,
    roleLabel: role.label,
    status: "Pending Invitation",
    lastActive: null,
    joinedDate: text(membership.created_at) || new Date().toISOString(),
    invitationStatus: input.sendEmail === false ? "Invitation link created" : deliveryMessage,
    invitationDeliveryStatus: deliveryStatus,
    assignedProjectNames: [],
    assignedRegions: [],
    showsAssignedProjects: FIELD_ASSIGNMENT_ROLE_KEYS.has(role.key),
    recentActivity: [`${role.label} invitation created`, "Invitation awaiting acceptance"],
    isCurrentUser: false,
    isPrimaryAdministrator: false,
  };
  return {
    ok: true,
    userId,
    invitationLink: actionLink,
    invitationStatus: member.invitationStatus,
    invitationDeliveryStatus: deliveryStatus,
    message: member.invitationStatus,
    member,
    invitation: {
      id: member.id,
      userId,
      name: member.fullName,
      email,
      roleKey: role.key,
      roleLabel: role.label,
      status: member.status,
      createdAt: member.joinedDate,
      invitationStatus: member.invitationStatus,
      invitationDeliveryStatus: deliveryStatus,
      invitationLink: actionLink,
    } satisfies WorkspaceTeamInvitation,
  };
}

async function activeAdminCount(clientId: string) {
  const { data, error } = await createAdminSupabase()
    .from("workspace_memberships")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "active")
    .in("role_key", ["customer_admin", "workspace_owner"]);
  if (error) throw error;
  return (data ?? []).length;
}

export async function updateWorkspaceMemberRole(input: { membershipId: string; roleKey: WorkspaceTeamRoleKey }) {
  const workspace = await resolveCustomerWorkspaceContext();
  assertCanManage(workspace);
  const role = roleDefinition(input.roleKey);
  if (role.key === "primary_administrator") throw Object.assign(new Error("Primary Administrator is protected."), { status: 400 });
  const supabase = createAdminSupabase();
  const { data: membership, error: lookupError } = await supabase.from("workspace_memberships").select("id,user_id,role_key,status").eq("id", input.membershipId).eq("client_id", workspace.clientId).maybeSingle();
  if (lookupError) throw lookupError;
  if (!membership) throw Object.assign(new Error("Member not found."), { status: 404 });
  if (text(membership.user_id) === workspace.userId) throw Object.assign(new Error("You cannot change your own administrator role."), { status: 400 });
  if (["customer_admin", "workspace_owner"].includes(text(membership.role_key)) && await activeAdminCount(workspace.clientId) <= 1) {
    throw Object.assign(new Error("You cannot remove the last administrator."), { status: 400 });
  }
  const roleId = await getWorkspaceRoleId(workspace.clientId, role.key);
  const { error } = await supabase.from("workspace_memberships").update({ role_id: roleId, role_key: role.technicalRoleKey, updated_at: new Date().toISOString() }).eq("id", input.membershipId).eq("client_id", workspace.clientId);
  if (error) throw error;
  await writeAuditLog({ actorUserId: workspace.userId, targetUserId: text(membership.user_id), actionType: "role_changed", newValue: { clientId: workspace.clientId, role: role.label } });
  return { ok: true };
}

export async function updateWorkspaceRolePermissions(input: { roleKey: WorkspaceTeamRoleKey; permissions: string[] }) {
  const totalStartedAt = nowMs();
  const contextStartedAt = nowMs();
  const workspace = await resolveCustomerWorkspaceContext();
  teamPerformanceLog({
    operation: "permission-save",
    step: "session + workspace-access",
    elapsedMs: elapsedMs(contextStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  assertCanManage(workspace);
  const role = roleDefinition(input.roleKey);
  if (role.key === "primary_administrator") throw Object.assign(new Error("Primary Administrator permissions are protected."), { status: 400 });
  const allowed = new Set(CUSTOMER_WORKSPACE_PERMISSION_MATRIX.flatMap((section) => section.permissions.map((permission) => permission.key)));
  const permissions = input.permissions.filter((permission) => allowed.has(permission));
  const supabase = createAdminSupabase();
  const roleStartedAt = nowMs();
  const roleId = await getWorkspaceRoleId(workspace.clientId, role.key);
  teamPerformanceLog({
    operation: "permission-save",
    step: "role-lookup",
    elapsedMs: elapsedMs(roleStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  const existingStartedAt = nowMs();
  const { data: existingRows, error: existingError } = await supabase
    .from("workspace_role_permissions")
    .select("permission")
    .eq("role_id", roleId);
  if (existingError) throw existingError;
  const existingPermissions = new Set(((existingRows ?? []) as Array<Record<string, unknown>>).map((row) => text(row.permission)).filter(Boolean));
  const nextPermissions = [...new Set(permissions)];
  const nextPermissionSet = new Set(nextPermissions);
  const permissionsToDelete = [...existingPermissions].filter((permission) => !nextPermissionSet.has(permission));
  const permissionsToInsert = nextPermissions.filter((permission) => !existingPermissions.has(permission));
  teamPerformanceLog({
    operation: "permission-save",
    step: "permission-read",
    elapsedMs: elapsedMs(existingStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });

  if (permissionsToDelete.length > 0) {
    const deleteStartedAt = nowMs();
    const { error } = await supabase
      .from("workspace_role_permissions")
      .delete()
      .eq("role_id", roleId)
      .in("permission", permissionsToDelete);
    if (error) throw error;
    teamPerformanceLog({
      operation: "permission-save",
      step: "delete-delta",
      elapsedMs: elapsedMs(deleteStartedAt),
      totalElapsedMs: elapsedMs(totalStartedAt),
    });
  }
  if (permissionsToInsert.length > 0) {
    const insertStartedAt = nowMs();
    const { error } = await supabase
      .from("workspace_role_permissions")
      .insert(permissionsToInsert.map((permission) => ({ role_id: roleId, permission })));
    if (error) throw error;
    teamPerformanceLog({
      operation: "permission-save",
      step: "insert-delta",
      elapsedMs: elapsedMs(insertStartedAt),
      totalElapsedMs: elapsedMs(totalStartedAt),
    });
  }
  const auditStartedAt = nowMs();
  void writeAuditLog({ actorUserId: workspace.userId, targetUserId: null, actionType: "permission_updated", newValue: { clientId: workspace.clientId, role: role.label, permissions: nextPermissions } }).catch((error) => {
    console.warn("[team-performance]", {
      operation: "permission-save",
      step: "audit",
      result: "failed_after_response",
      error: error instanceof Error ? error.message : "Unknown audit error",
    });
  });
  teamPerformanceLog({
    operation: "permission-save",
    step: "audit",
    elapsedMs: elapsedMs(auditStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  teamPerformanceLog({
    operation: "permission-save",
    step: "TOTAL",
    elapsedMs: elapsedMs(totalStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  return { ok: true, success: true, permissions: nextPermissions };
}

export async function removeWorkspaceMember(input: { membershipId: string }) {
  const workspace = await resolveCustomerWorkspaceContext();
  assertCanManage(workspace);
  const supabase = createAdminSupabase();
  const { data: membership, error: lookupError } = await supabase.from("workspace_memberships").select("id,user_id,role_key,status").eq("id", input.membershipId).eq("client_id", workspace.clientId).maybeSingle();
  if (lookupError) throw lookupError;
  if (!membership) throw Object.assign(new Error("Member not found."), { status: 404 });
  if (text(membership.user_id) === workspace.userId) throw Object.assign(new Error("You cannot remove yourself from the workspace."), { status: 400 });
  if (["customer_admin", "workspace_owner"].includes(text(membership.role_key)) && await activeAdminCount(workspace.clientId) <= 1) {
    throw Object.assign(new Error("You cannot remove the last administrator."), { status: 400 });
  }
  const { error } = await supabase.from("workspace_memberships").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", input.membershipId).eq("client_id", workspace.clientId);
  if (error) throw error;
  await writeAuditLog({ actorUserId: workspace.userId, targetUserId: text(membership.user_id), actionType: text(membership.status) === "invited" ? "invitation_cancelled" : "user_removed", newValue: { clientId: workspace.clientId } });
  return { ok: true };
}

export async function resendWorkspaceInvitation(input: { membershipId: string }) {
  const workspace = await resolveCustomerWorkspaceContext();
  assertCanManage(workspace);
  const supabase = createAdminSupabase();
  const { data: membership, error } = await supabase.from("workspace_memberships").select("id,user_id,status").eq("id", input.membershipId).eq("client_id", workspace.clientId).eq("status", "invited").maybeSingle();
  if (error) throw error;
  if (!membership) throw Object.assign(new Error("Pending invitation not found."), { status: 404 });
  const userId = text(membership.user_id);
  const { data: profile } = await supabase.schema("public").from("user_profiles").select("email").eq("user_id", userId).maybeSingle();
  const email = text(profile?.email);
  if (!email) throw Object.assign(new Error("Pending invitation email is unavailable."), { status: 409 });
  const generated = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: invitationRedirectTo() },
  });
  if (generated.error) throw generated.error;
  const actionLink = generated.data.properties?.action_link ?? null;
  if (!actionLink) throw Object.assign(new Error("Could not create a secure invitation link."), { status: 500 });
  await writeAuditLog({ actorUserId: workspace.userId, targetUserId: userId, actionType: "invitation_resent", newValue: { clientId: workspace.clientId, deliveryStatus: "link_created" } });
  return { ok: true, invitationLink: actionLink, message: "Invitation link created" };
}
