import { redirect } from "next/navigation";
import { InstallersClient } from "@/components/workspace/InstallersClient";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getInstallerDashboard } from "@/lib/workspace/fieldResources";

export const dynamic = "force-dynamic";

export default async function InstallersPage({
  searchParams,
}: {
  searchParams?: { projectId?: string; search?: string; agency?: string; status?: string; state?: string; sort?: string; page?: string };
}) {
  try {
    const dashboard = await getInstallerDashboard({ ...searchParams, page: Number(searchParams?.page ?? 1) });
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Performance & Analytics</p>
            <h2 className="mt-2 text-2xl font-bold">Installers</h2>
            <p className="mt-2 text-sm text-slate-600">Review installer assignment coverage, completion, outstanding work and evidence accuracy.</p>
          </div>
        </div>
        <InstallersClient initialDashboard={dashboard} />
      </div>
    );
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
}
