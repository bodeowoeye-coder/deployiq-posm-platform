import { redirect } from "next/navigation";
import { AgenciesClient } from "@/components/workspace/AgenciesClient";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getAgencyDashboard } from "@/lib/workspace/fieldResources";

export const dynamic = "force-dynamic";

export default async function AgenciesPage({
  searchParams,
}: {
  searchParams?: { search?: string; status?: string; state?: string; sort?: string };
}) {
  try {
    const dashboard = await getAgencyDashboard(searchParams ?? {});
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Agency Management</p>
            <h2 className="mt-2 text-2xl font-bold">Agencies</h2>
            <p className="mt-2 text-sm text-slate-600">Create and manage agency relationships for campaign execution.</p>
          </div>
        </div>
        <AgenciesClient initialDashboard={dashboard} />
      </div>
    );
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
}
