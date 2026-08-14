import { redirect } from "next/navigation";
import {
  CustomerWorkspaceRedirect,
  resolveCustomerWorkspaceContext,
} from "@/lib/workspace/customerAdmin";

export const dynamic = "force-dynamic";

export default async function CustomerWorkspaceProfilePage() {
  let workspace;
  try {
    workspace = await resolveCustomerWorkspaceContext();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  const displayName = workspace.email?.split("@")[0] ?? "Workspace administrator";

  return (
    <div className="space-y-6">
      <section className="workspace-card p-6">
        <p className="workspace-eyebrow">Profile</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">Your account</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Review your administrator profile and account security options for this workspace.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="workspace-card p-3">
          <nav className="grid gap-1" aria-label="Profile navigation">
            <a href="/workspace/admin/profile" className="workspace-settings-link workspace-settings-link-active">Profile</a>
            <a href="/workspace/admin/workspace-settings/security" className="workspace-settings-link">Account & Security</a>
            <a href="/workspace/admin/workspace-settings" className="workspace-settings-link">Workspace Settings</a>
          </nav>
        </aside>

        <section className="workspace-card p-6">
          <h3 className="text-xl font-bold text-slate-950">Profile details</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            These details are linked to your workspace account.
          </p>
          <dl className="mt-6 grid gap-4 md:grid-cols-2">
            <Info label="Name" value={displayName} />
            <Info label="Email" value={workspace.email ?? "Not available"} />
            <Info label="Role" value="Customer Administrator" />
            <Info label="Membership" value="Customer Administrator" />
            <Info label="Organisation" value={workspace.organisationName} />
            <Info label="Workspace ID" value={workspace.customerId} mono />
            <Info label="Primary administrator" value={workspace.isPrimaryAdministrator ? "Yes" : "No"} />
            <Info label="Last sign-in" value="Not available" />
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            <a href="/workspace/admin/workspace-settings/security" className="workspace-button-secondary">
              Account Security
            </a>
            <a href="/workspace/admin/workspace-settings/security#change-password" className="workspace-button-tertiary">
              Change Password
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="workspace-subtle-card p-4">
      <dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className={`mt-1 break-words font-semibold text-slate-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
