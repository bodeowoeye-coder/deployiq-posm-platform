import { redirect } from "next/navigation";
import { InstallerCreateForm } from "@/components/workspace/InstallerCreateForm";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getInstallerDashboard } from "@/lib/workspace/fieldResources";

export const dynamic = "force-dynamic";

export default async function NewInstallerPage() {
  try {
    const dashboard = await getInstallerDashboard();
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Installers</p>
          <h2 className="mt-2 text-2xl font-bold">Create Installer</h2>
          <p className="mt-2 text-sm text-slate-600">Add an installer profile for campaign and deployment-location assignment.</p>
        </div>
        <InstallerCreateForm agencies={dashboard.agencies} />
      </div>
    );
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
}
