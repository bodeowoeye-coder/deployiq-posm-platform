import { redirect } from "next/navigation";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getWorkspaceDeploymentMap } from "@/lib/workspace/deploymentExecution";

export const dynamic = "force-dynamic";

export default async function DeploymentMapPage({ searchParams }: { searchParams?: { projectId?: string } }) {
  let map;
  try {
    map = await getWorkspaceDeploymentMap({ projectId: searchParams?.projectId });
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  const completed = map.points.filter((point) => point.status === "Approved").length;
  const pending = map.points.filter((point) => point.status === "Pending" || point.status === "Flagged").length;
  const rejected = map.points.filter((point) => point.status === "Rejected" || point.status === "Correction Requested").length;
  const gpsExceptions = map.points.filter((point) => point.gpsStatus !== "Verified").length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Deployment Map</p>
        <h2 className="mt-2 text-2xl font-bold">Field Coverage</h2>
        <p className="mt-2 text-sm text-slate-600">Review installer locations, completed deployments, pending work, rejected work and GPS exceptions.</p>
      </div>
      <section className="grid gap-3 md:grid-cols-4" aria-label="Map summary">
        <Metric label="Completed Deployments" value={String(completed)} />
        <Metric label="Pending" value={String(pending)} />
        <Metric label="Rejected" value={String(rejected)} />
        <Metric label="GPS Exceptions" value={String(gpsExceptions)} />
      </section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {map.points.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-bold">No mapped deployment activity yet.</h3>
            <p className="mt-2 text-sm text-slate-600">GPS-backed submissions will appear here after installers submit evidence.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>{["Outlet", "Installer", "Latitude", "Longitude", "Status", "GPS"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {map.points.map((point) => (
                  <tr key={point.id}>
                    <td className="px-4 py-3 font-bold">{point.outlet}</td>
                    <td className="px-4 py-3">{point.installer}</td>
                    <td className="px-4 py-3">{point.latitude}</td>
                    <td className="px-4 py-3">{point.longitude}</td>
                    <td className="px-4 py-3">{point.status}</td>
                    <td className="px-4 py-3">{point.gpsStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}
