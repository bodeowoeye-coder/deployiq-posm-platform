"use client";

import { useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Copy, KeyRound, MailPlus, RotateCw, Search, ShieldCheck, UserMinus, UsersRound, X } from "lucide-react";
import type {
  WorkspaceTeamDashboard,
  WorkspaceTeamInvitation,
  WorkspaceTeamMember,
  WorkspaceTeamRoleKey,
} from "@/lib/workspace/team";

type Props = {
  initialDashboard: WorkspaceTeamDashboard;
};

const pageSize = 8;
function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function statusClass(status: string) {
  if (status === "Active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Pending Invitation") return "border-orange-200 bg-orange-50 text-orange-800";
  if (status === "Suspended") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function roleDescription(roleKey: WorkspaceTeamRoleKey, dashboard: WorkspaceTeamDashboard) {
  return dashboard.roles.find((role) => role.key === roleKey)?.description ?? "Workspace access role";
}

type InvitationCreateResult = {
  ok?: boolean;
  message?: string;
  invitationLink?: string;
  invitationStatus?: string;
  invitationDeliveryStatus?: "link_created" | "delivery_not_configured" | "sent" | "failed";
  member?: WorkspaceTeamMember;
  invitation?: WorkspaceTeamInvitation;
};

type InvitationActionState =
  | "idle"
  | "creating_link"
  | "link_ready"
  | "sending"
  | "invited"
  | "error";

export function WorkspaceTeamClient({ initialDashboard }: Props) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<WorkspaceTeamMember | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lastErrorRef = useRef("");

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return dashboard.members
      .filter((member) => {
        const matchesQuery = !normalizedQuery || `${member.fullName} ${member.email}`.toLowerCase().includes(normalizedQuery);
        const matchesRole = roleFilter === "all" || member.roleKey === roleFilter;
        const matchesStatus = statusFilter === "all" || member.status === statusFilter;
        return matchesQuery && matchesRole && matchesStatus;
      })
      .sort((a, b) => {
        if (sort === "role") return a.roleLabel.localeCompare(b.roleLabel);
        if (sort === "status") return a.status.localeCompare(b.status);
        if (sort === "joined") return new Date(b.joinedDate ?? 0).getTime() - new Date(a.joinedDate ?? 0).getTime();
        if (sort === "last_active") return new Date(b.lastActive ?? 0).getTime() - new Date(a.lastActive ?? 0).getTime();
        return a.fullName.localeCompare(b.fullName);
      });
  }, [dashboard.members, query, roleFilter, sort, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const visibleMembers = filteredMembers.slice((page - 1) * pageSize, page * pageSize);

  async function reloadTeam(message = "Changes saved. Refresh the page to see the latest server state.") {
    setMessage(message);
  }

  async function apiRequest(path: string, init: RequestInit) {
    setBusy(true);
    setMessage("");
    lastErrorRef.current = "";
    try {
      const response = await fetch(path, { ...init, credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || `Unable to update workspace team (HTTP ${response.status}).`);
      await reloadTeam();
      return body;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to update workspace team.";
      lastErrorRef.current = detail;
      setMessage(detail);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: WorkspaceTeamMember, roleKey: WorkspaceTeamRoleKey) {
    const body = await apiRequest("/api/workspace/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change_role", membershipId: member.id, roleKey }),
    });
    if (body?.ok) {
      setDashboard((current) => ({
        ...current,
        members: current.members.map((item) => item.id === member.id
          ? { ...item, roleKey, roleLabel: current.roles.find((role) => role.key === roleKey)?.label ?? item.roleLabel }
          : item),
      }));
      setSelectedMember((current) => current && current.id === member.id ? { ...current, roleKey, roleLabel: dashboard.roles.find((role) => role.key === roleKey)?.label ?? current.roleLabel } : current);
    }
  }

  async function removeMember(member: WorkspaceTeamMember) {
    const body = await apiRequest(`/api/workspace/team?membershipId=${encodeURIComponent(member.id)}`, { method: "DELETE" });
    if (body?.ok) {
      setDashboard((current) => ({
        ...current,
        members: current.members.map((item) => item.id === member.id ? { ...item, status: "Disabled" } : item),
      }));
      setSelectedMember((current) => current && current.id === member.id ? { ...current, status: "Disabled" } : current);
    }
  }

  async function updateAssignments(member: WorkspaceTeamMember, projectIds: string[], regions: string[]) {
    const body = await apiRequest("/api/workspace/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_assignments", membershipId: member.id, projectIds, regions }),
    });
    if (body?.ok) {
      const projectNames = projectIds.map((projectId) => dashboard.assignmentOptions.projects.find((project) => project.id === projectId)?.name ?? projectId);
      setDashboard((current) => ({ ...current, members: current.members.map((item) => item.id === member.id ? { ...item, assignedProjectIds: projectIds, assignedProjectNames: projectNames, assignedRegions: regions } : item) }));
      setSelectedMember((current) => current && current.id === member.id ? { ...current, assignedProjectIds: projectIds, assignedProjectNames: projectNames, assignedRegions: regions } : current);
    }
  }

  async function resendInvitation(member: WorkspaceTeamMember) {
    await apiRequest("/api/workspace/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resend_invitation", membershipId: member.id }),
    });
  }

  async function simulateInvitationAcceptance(member: WorkspaceTeamMember) {
    const body = await apiRequest("/api/workspace/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "simulate_invitation_acceptance", membershipId: member.id }),
    });
    if (body?.ok) {
      const activated = (item: WorkspaceTeamMember): WorkspaceTeamMember => ({ ...item, status: "Active", invitationStatus: "Accepted", invitationDeliveryStatus: "not_applicable" });
      setDashboard((current) => ({ ...current, members: current.members.map((item) => item.id === member.id ? activated(item) : item) }));
      setSelectedMember((current) => current && current.id === member.id ? activated(current) : current);
      setMessage("Test invitation activated. This member is now an active workspace member.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="workspace-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="workspace-eyebrow">Team & Users</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Workspace administration</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Manage workspace members, invitations, roles, permissions and administrator activity for {dashboard.workspace.organisationName}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            disabled={!dashboard.canManageTeam}
            className="workspace-button-primary"
            aria-disabled={!dashboard.canManageTeam}
          >
            <MailPlus className="h-4 w-4" aria-hidden="true" />
            Invite User
          </button>
        </div>
        {!dashboard.canManageTeam ? (
          <div className="workspace-alert-card mt-4 p-4 text-sm text-slate-700">
            You have read-only access to team administration. Ask a Customer Administrator to invite users or change roles.
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" aria-label="Team summary">
        <SummaryCard label="Workspace Members" value={String(dashboard.summary.workspaceMembers)} />
        <SummaryCard label="Pending Invitations" value={String(dashboard.summary.pendingInvitations)} />
        <SummaryCard label="Available Licences" value={String(dashboard.summary.availableLicences)} />
        <SummaryCard label="Active Sessions" value={String(dashboard.summary.activeSessions)} />
        <SummaryCard label="Primary Administrator" value={dashboard.summary.primaryAdministrator} />
        <SummaryCard label="Recently Joined Users" value={String(dashboard.summary.recentlyJoinedUsers.length)} />
      </section>

      {message ? <div className="workspace-alert-card p-4 text-sm font-semibold text-slate-700">{message}</div> : null}

      <section className="workspace-card p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-950">User directory</h3>
            <p className="mt-1 text-sm text-slate-600">Search, filter, sort and manage users in this workspace.</p>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Search
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="workspace-search-input w-full pl-9 normal-case tracking-normal" placeholder="Name or email" />
              </span>
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Role
              <select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }} className="workspace-input normal-case tracking-normal">
                <option value="all">All roles</option>
                {dashboard.roles.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Status
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="workspace-input normal-case tracking-normal">
                <option value="all">All statuses</option>
                {["Active", "Pending Invitation", "Suspended", "Disabled"].map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Sort
              <select value={sort} onChange={(event) => setSort(event.target.value)} className="workspace-input normal-case tracking-normal">
                <option value="name">Full Name</option>
                <option value="role">Role</option>
                <option value="status">Status</option>
                <option value="last_active">Last Active</option>
                <option value="joined">Joined Date</option>
              </select>
            </label>
          </div>
        </div>

        {dashboard.members.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-700">
              <UsersRound className="h-7 w-7" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-bold">Invite your first teammate</h3>
            <p className="mt-2 text-sm text-slate-600">Add administrators, project managers, supervisors and viewers to collaborate inside this workspace.</p>
            <button type="button" onClick={() => setInviteOpen(true)} className="workspace-button-primary mt-5" disabled={!dashboard.canManageTeam}>Invite User</button>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <tr>
                    {["Avatar", "Full Name", "Email", "Role", "Status", "Last Active", "Joined / Invited", "Actions"].map((heading) => (
                      <th key={heading} className="px-4 py-3">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleMembers.map((member) => (
                    <tr key={member.id} className="align-top">
                      <td className="px-4 py-3"><Avatar member={member} /></td>
                      <td className="px-4 py-3 font-bold text-slate-950">{member.fullName}</td>
                      <td className="px-4 py-3 text-slate-600">{member.email}</td>
                      <td className="px-4 py-3">{member.roleLabel}</td>
                      <td className="px-4 py-3"><StatusBadge status={member.status} /></td>
                      <td className="px-4 py-3">{member.status === "Pending Invitation" ? "Not joined yet" : formatDate(member.lastActive)}</td>
                      <td className="px-4 py-3">{formatDate(member.joinedDate)}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setSelectedMember(member)} className="font-bold text-orange-600 hover:text-orange-700">Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
              <span className="text-slate-600">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button type="button" className="workspace-button-tertiary min-h-9 px-3" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Previous</button>
                <button type="button" className="workspace-button-tertiary min-h-9 px-3" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>Next</button>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <PermissionMatrix
          dashboard={dashboard}
          busy={busy}
          updatePermissions={apiRequest}
          onPermissionsSaved={(roleKey, permissions) => {
            setDashboard((current) => ({
              ...current,
              roles: current.roles.map((role) => role.key === roleKey ? { ...role, permissions } : role),
            }));
          }}
        />
        <ActivityFeed dashboard={dashboard} />
      </div>

      {inviteOpen ? (
        <InviteModal
          dashboard={dashboard}
          close={() => setInviteOpen(false)}
          apiRequest={apiRequest}
          busy={busy}
          lastErrorRef={lastErrorRef}
          onInvitationCreated={(result) => {
            if (!result.member || !result.invitation) return;
            setDashboard((current) => ({
              ...current,
              members: [result.member!, ...current.members.filter((member) => member.id !== result.member!.id)],
              invitations: [result.invitation!, ...current.invitations.filter((invitation) => invitation.id !== result.invitation!.id)],
              summary: {
                ...current.summary,
                pendingInvitations: current.invitations.some((invitation) => invitation.id === result.invitation!.id)
                  ? current.summary.pendingInvitations
                  : current.summary.pendingInvitations + 1,
                availableLicences: current.summary.availableLicences,
                licenceSummary: {
                  ...current.summary.licenceSummary,
                  pendingInvitationsCounted: current.summary.licenceSummary.pendingInvitationsCounted + 1,
                },
              },
            }));
            setMessage(result.message ?? "Invitation link created");
          }}
        />
      ) : null}
      {selectedMember ? (
        <ProfileDrawer
          member={selectedMember}
          dashboard={dashboard}
          close={() => setSelectedMember(null)}
          changeRole={changeRole}
          updateAssignments={updateAssignments}
          removeMember={removeMember}
          resendInvitation={resendInvitation}
          simulateInvitationAcceptance={simulateInvitationAcceptance}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="workspace-card p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 truncate text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Avatar({ member }: { member: WorkspaceTeamMember }) {
  return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{member.avatarInitials}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${statusClass(status)}`}>{status}</span>;
}

function InviteModal({ dashboard, close, apiRequest, busy, onInvitationCreated, lastErrorRef }: {
  dashboard: WorkspaceTeamDashboard;
  close: () => void;
  busy: boolean;
  apiRequest: (path: string, init: RequestInit) => Promise<unknown>;
  onInvitationCreated?: (result: InvitationCreateResult) => void;
  lastErrorRef: MutableRefObject<string>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState<WorkspaceTeamRoleKey>("viewer");
  const [link, setLink] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [actionState, setActionState] = useState<InvitationActionState>("idle");
  const [copied, setCopied] = useState(false);

  async function submit(sendEmail: boolean) {
    if (sendEmail && link) {
      setActionState("invited");
      setLocalMessage("Invitation created. Email delivery is not configured. Copy the invitation link to share it manually.");
      return;
    }
    setActionState(sendEmail ? "sending" : "creating_link");
    setLocalMessage(sendEmail ? "Creating invitation..." : "Generating...");
    const body = await apiRequest("/api/workspace/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        roleKey,
        sendEmail,
      }),
    }) as InvitationCreateResult | null;
    if (!body) {
      setActionState("error");
      setLocalMessage(lastErrorRef.current || "Unable to process workspace team request. Check the team API response and try again.");
      return;
    }
    if (body?.invitationLink) {
      setLink(body.invitationLink);
      setActionState(sendEmail ? "invited" : "link_ready");
      setLocalMessage(body.message ?? (sendEmail ? "Invitation created. Email delivery is not configured. Copy the invitation link to share it manually." : "Invitation link created"));
      onInvitationCreated?.(body);
    } else {
      setActionState("error");
      setLocalMessage(body?.message || "The invitation could not be created. Please try again.");
    }
  }

  function copyInvitationLink() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <section className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="invite-title" className="text-xl font-bold">Invite User</h3>
            <p className="mt-1 text-sm text-slate-600">Invite a teammate to this workspace with a customer-facing role.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close invitation modal" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-1 text-sm font-semibold">Name<input value={name} onChange={(event) => { setName(event.target.value); setActionState("idle"); }} className="workspace-input" /></label>
          <label className="grid gap-1 text-sm font-semibold">Email<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setActionState("idle"); }} className="workspace-input" /></label>
          <label className="grid gap-1 text-sm font-semibold">
            Role
            <select value={roleKey} onChange={(event) => setRoleKey(event.target.value as WorkspaceTeamRoleKey)} className="workspace-input">
              {dashboard.roles.filter((role) => role.key !== "primary_administrator").map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
            </select>
          </label>
        </div>
        {localMessage ? (
          <div className={`mt-4 rounded-lg border p-3 text-sm font-semibold ${
            actionState === "error"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}>
            {localMessage}
          </div>
        ) : null}
        {link ? (
          <div className="workspace-subtle-card mt-4 p-3 text-sm">
            <p className="font-bold">Invitation link created</p>
            <p className="mt-1 break-all font-mono text-xs">{link}</p>
            <button type="button" onClick={copyInvitationLink} className="workspace-button-tertiary mt-3 min-h-9 px-3"><Copy className="h-4 w-4" />{copied ? "Copied" : "Copy link"}</button>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={close} className="workspace-button-tertiary">Cancel</button>
          <button type="button" onClick={() => submit(false)} disabled={busy || actionState === "creating_link" || actionState === "sending"} className="workspace-button-secondary"><KeyRound className="h-4 w-4" />{actionState === "creating_link" ? "Generating..." : "Generate invitation link"}</button>
          <button type="button" onClick={() => submit(true)} disabled={busy || actionState === "creating_link" || actionState === "sending"} className="workspace-button-primary">{actionState === "sending" ? "Creating invitation..." : "Send Invitation"}</button>
        </div>
      </section>
    </div>
  );
}

function ProfileDrawer({ member, dashboard, close, changeRole, updateAssignments, removeMember, resendInvitation, simulateInvitationAcceptance, busy }: {
  member: WorkspaceTeamMember;
  dashboard: WorkspaceTeamDashboard;
  close: () => void;
  changeRole: (member: WorkspaceTeamMember, roleKey: WorkspaceTeamRoleKey) => Promise<void>;
  updateAssignments: (member: WorkspaceTeamMember, projectIds: string[], regions: string[]) => Promise<void>;
  removeMember: (member: WorkspaceTeamMember) => Promise<void>;
  resendInvitation: (member: WorkspaceTeamMember) => Promise<void>;
  simulateInvitationAcceptance: (member: WorkspaceTeamMember) => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-labelledby="member-title">
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar member={member} />
            <div>
              <h3 id="member-title" className="text-xl font-bold">{member.fullName}</h3>
              <p className="text-sm text-slate-600">{member.email}</p>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close user profile drawer" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <dl className="mt-6 grid gap-3">
          <Info label="Role" value={member.roleLabel} />
          <Info label="Status" value={member.status} />
          <Info label="Last Login" value={formatDate(member.lastActive)} />
          <Info label="Invitation Status" value={member.invitationStatus} />
          <Info label="Role Summary" value={roleDescription(member.roleKey, dashboard)} />
          {member.showsAssignedProjects ? (
            <>
              <Info label="Assigned Projects" value={member.assignedProjectNames.join(", ") || "No projects assigned"} />
              <Info label="Assigned Regions" value={member.assignedRegions.join(", ") || "No regions assigned"} />
            </>
          ) : null}
        </dl>
        <div className="mt-6 grid gap-2">
          <label className="grid gap-1 text-sm font-semibold">
            Edit Role
            <select value={member.roleKey} onChange={(event) => changeRole(member, event.target.value as WorkspaceTeamRoleKey)} disabled={!dashboard.canManageTeam || member.isCurrentUser || busy} className="workspace-input">
              {dashboard.roles.filter((role) => role.key !== "primary_administrator").map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
            </select>
          </label>
          <button type="button" disabled={!dashboard.canManageTeam || member.isCurrentUser || busy} onClick={() => removeMember(member)} className="workspace-button-danger"><UserMinus className="h-4 w-4" />Remove User</button>
          <button type="button" disabled={!dashboard.canManageTeam || busy} className="workspace-button-tertiary"><KeyRound className="h-4 w-4" />Reset Password</button>
          <button type="button" disabled={!dashboard.canManageTeam || busy} className="workspace-button-tertiary"><ShieldCheck className="h-4 w-4" />Disable User</button>
          {member.status === "Pending Invitation" ? (
            <button type="button" disabled={!dashboard.canManageTeam || busy} onClick={() => resendInvitation(member)} className="workspace-button-secondary"><RotateCw className="h-4 w-4" />Resend invitation</button>
          ) : null}
          {dashboard.testInvitationAcceptanceEnabled && member.status === "Pending Invitation" ? (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-800">Test mode only</p>
              <p className="mt-1 text-xs text-amber-900">Email delivery is not configured locally. This runs the same activation as a real invitation acceptance.</p>
              <button type="button" disabled={!dashboard.canManageTeam || busy} onClick={() => simulateInvitationAcceptance(member)} className="workspace-button-secondary mt-2"><ShieldCheck className="h-4 w-4" />Activate test invitation</button>
            </div>
          ) : null}
        </div>
        {member.showsAssignedProjects ? (
          <AssignmentEditor member={member} dashboard={dashboard} updateAssignments={updateAssignments} busy={busy} />
        ) : null}
        <div className="mt-6">
          <h4 className="text-sm font-bold">Recent Activity</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {member.recentActivity.map((item) => <li key={item} className="workspace-subtle-card p-3">{item}</li>)}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function AssignmentEditor({ member, dashboard, updateAssignments, busy }: {
  member: WorkspaceTeamMember;
  dashboard: WorkspaceTeamDashboard;
  updateAssignments: (member: WorkspaceTeamMember, projectIds: string[], regions: string[]) => Promise<void>;
  busy: boolean;
}) {
  const [projectIds, setProjectIds] = useState<string[]>(member.assignedProjectIds);
  const [regions, setRegions] = useState<string[]>(member.assignedRegions);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const options = dashboard.assignmentOptions;
  const dirty = projectIds.slice().sort().join("|") !== member.assignedProjectIds.slice().sort().join("|")
    || regions.slice().sort().join("|") !== member.assignedRegions.slice().sort().join("|");

  function toggle(list: string[], setList: (next: string[]) => void, value: string) {
    setSaveState("idle");
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function save() {
    setSaveState("saving");
    await updateAssignments(member, projectIds, regions);
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1600);
  }

  return (
    <section className="mt-6">
      <h4 className="text-sm font-bold">Resource assignments</h4>
      <p className="mt-1 text-xs text-slate-600">Control which projects and regions this member can work on.</p>
      <div className="mt-3 grid gap-3">
        <div className="workspace-subtle-card p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Projects</p>
          <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto">
            {options.projects.length === 0 ? <p className="text-sm text-slate-500">No projects available in this workspace.</p> : null}
            {options.projects.map((project) => (
              <label key={project.id} className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={projectIds.includes(project.id)}
                  disabled={!dashboard.canManageTeam || busy}
                  onChange={() => toggle(projectIds, setProjectIds, project.id)}
                />
                <span className="truncate">{project.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="workspace-subtle-card p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Regions</p>
          <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto">
            {options.regions.length === 0 ? <p className="text-sm text-slate-500">No regions defined on workspace projects.</p> : null}
            {options.regions.map((region) => (
              <label key={region} className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={regions.includes(region)}
                  disabled={!dashboard.canManageTeam || busy}
                  onChange={() => toggle(regions, setRegions, region)}
                />
                <span className="truncate">{region}</span>
              </label>
            ))}
          </div>
        </div>
        <button type="button" disabled={!dashboard.canManageTeam || busy || !dirty || saveState === "saving"} onClick={save} className="workspace-button-secondary">
          {saveState === "saving" ? "Saving assignments..." : saveState === "saved" ? "Assignments saved" : "Save assignments"}
        </button>
      </div>
    </section>
  );
}

function PermissionMatrix({ dashboard, busy, updatePermissions, onPermissionsSaved }: {
  dashboard: WorkspaceTeamDashboard;
  busy: boolean;
  updatePermissions: (path: string, init: RequestInit) => Promise<unknown>;
  onPermissionsSaved?: (roleKey: WorkspaceTeamRoleKey, permissions: string[]) => void;
}) {
  const [roleKey, setRoleKey] = useState<WorkspaceTeamRoleKey>("administrator");
  const role = dashboard.roles.find((item) => item.key === roleKey) ?? dashboard.roles[1];
  const [selected, setSelected] = useState<string[]>([...role.permissions]);
  const [savedSelected, setSavedSelected] = useState<string[]>([...role.permissions]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const dirty = selected.slice().sort().join("|") !== savedSelected.slice().sort().join("|");

  function toggle(permission: string) {
    setSaveState("idle");
    setSelected((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  function selectRole(next: WorkspaceTeamRoleKey) {
    if (dirty && !window.confirm("You have unsaved permission changes. Discard them and switch roles?")) return;
    const nextPermissions = [...(dashboard.roles.find((item) => item.key === next)?.permissions ?? [])];
    setRoleKey(next);
    setSelected(nextPermissions);
    setSavedSelected(nextPermissions);
    setSaveState("idle");
  }

  async function savePermissions() {
    setSaveState("saving");
    const result = await updatePermissions("/api/workspace/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_permissions", roleKey, permissions: selected }),
    });
    if (result) {
      setSavedSelected([...selected]);
      onPermissionsSaved?.(roleKey, [...selected]);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1600);
    } else {
      setSaveState("failed");
    }
  }

  return (
    <section className="workspace-card p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-xl font-bold">Permission matrix</h3>
          <p className="mt-1 text-sm text-slate-600">Review and tune access by customer-facing role.</p>
        </div>
        <select value={roleKey} onChange={(event) => selectRole(event.target.value as WorkspaceTeamRoleKey)} className="workspace-input">
          {dashboard.roles.filter((item) => item.key !== "primary_administrator").map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {dashboard.permissionMatrix.map((section) => (
          <div key={section.key} className="workspace-subtle-card p-4">
            <p className="font-bold">{section.label}</p>
            <div className="mt-3 grid gap-2">
              {section.permissions.map((permission) => (
                <label key={permission.key} className="flex items-center justify-between gap-3 text-sm font-semibold">
                  {permission.label}
                  <input type="checkbox" role="switch" checked={selected.includes(permission.key)} onChange={() => toggle(permission.key)} disabled={!dashboard.canManageTeam || busy || role.key === "primary_administrator"} className="h-5 w-5 accent-orange-600 disabled:cursor-not-allowed disabled:opacity-50" />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={!dashboard.canManageTeam || busy || saveState === "saving" || !dirty}
        onClick={savePermissions}
        className="workspace-button-primary mt-5"
      >
        {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : saveState === "failed" ? "Could not save" : dirty ? "Save Permissions" : "Permissions Saved"}
      </button>
      {dirty ? <p className="mt-3 text-sm font-semibold text-amber-700">You have unsaved permission changes.</p> : null}
    </section>
  );
}

function ActivityFeed({ dashboard }: { dashboard: WorkspaceTeamDashboard }) {
  return (
    <section className="workspace-card p-5 xl:max-h-[560px] xl:overflow-y-auto">
      <h3 className="text-xl font-bold">Audit log</h3>
      <p className="mt-1 text-sm text-slate-600">Workspace administration activity for this organisation.</p>
      {dashboard.auditLog.length === 0 ? (
        <div className="workspace-subtle-card mt-5 p-4 text-sm font-semibold text-slate-600">No team administration activity yet.</div>
      ) : null}
      <ol className="mt-5 space-y-3">
        {dashboard.auditLog.map((event) => (
          <li key={event.id} className="workspace-subtle-card p-3 text-sm">
            <p className="font-bold">{event.action}</p>
            <p className="mt-1 text-slate-600">{event.actor} to {event.target}</p>
            <p className="mt-1 text-xs text-slate-500">{formatDate(event.createdAt)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="workspace-subtle-card p-3">
      <dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
