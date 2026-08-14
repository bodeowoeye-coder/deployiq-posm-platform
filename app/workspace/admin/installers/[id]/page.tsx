import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getInstallerProfile } from "@/lib/workspace/fieldResources";

export const dynamic = "force-dynamic";

function title(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export default async function InstallerProfilePage({
  params,
}: {
  params: { id: string };
}) {
  let result;
  try {
    result = await getInstallerProfile(params.id);
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
  if (!result) notFound();
  const { installer } = result;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Installer Profile</p>
          <h2 className="mt-2 text-2xl font-bold">{installer.installerName}</h2>
          <p className="mt-2 text-sm text-slate-600">{installer.agencyName || "No agency assigned"} | {installer.state || "No state set"} | {title(installer.status)}</p>
        </div>
        <Link href="/workspace/admin/installers" className="workspace-button-secondary">Back to Installers</Link>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-slate-950">Overview</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric label="Status" value={title(installer.status)} />
          <Metric label="Assigned Locations" value={String(installer.assignedLocations)} />
          <Metric label="Completed" value={String(installer.completed)} />
          <Metric label="Outstanding" value={String(installer.remaining)} />
        </div>
      </section>

      <DossierSection title="Personal Information">
        <Info label="Name" value={installer.installerName} />
        <Info label="Phone" value={installer.phone || "Not set"} />
        <Info label="Email" value={installer.email || "Not set"} />
        <Info label="Agency" value={installer.agencyName || "Not assigned"} />
        <Info label="Team" value={installer.team || "Not set"} />
        <Info label="Vehicle" value={installer.vehicle || "Not set"} />
        <Info label="Region / State" value={[installer.region, installer.state].filter(Boolean).join(" / ") || "Not set"} />
        <Info label="City" value={installer.city || "Not set"} />
        <Info label="Assigned Projects" value={installer.assignedProjects.join(", ") || "No projects assigned"} />
      </DossierSection>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function DossierSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-slate-950">{title}</h3>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">{children}</dl>
    </section>
  );
}
