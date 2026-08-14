import { redirect } from "next/navigation";
import { DirectoryImportClient } from "@/components/workspace/DirectoryImportClient";
import {
  CustomerWorkspaceRedirect,
  directoryLabelForProduct,
} from "@/lib/workspace/customerAdmin";
import { getWorkspaceDirectoryDashboard } from "@/lib/workspace/directoryImport";

export const dynamic = "force-dynamic";

export default async function UploadDirectoryPage() {
  let workspace;
  let dashboard;
  try {
    const result = await getWorkspaceDirectoryDashboard();
    workspace = result.workspace;
    dashboard = result.dashboard;
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  const directoryLabel = directoryLabelForProduct(workspace.productKey);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="space-y-6">
        <DirectoryImportClient directoryLabel={directoryLabel} initialDashboard={dashboard} />
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Directory guidance</p>
          <dl className="mt-4 space-y-3 text-sm">
            <Info label="Directory type" value={directoryLabel} />
            <Info label="Used for" value="Projects, campaigns, assignment, map views and reporting" />
            <Info label="Upload format" value="CSV, XLS or XLSX" />
            <Info label="Review step" value="Validate records before importing" />
          </dl>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-bold text-emerald-900">Workspace scope</p>
          <p className="mt-2 text-sm leading-6 text-emerald-800">
            Directory uploads apply only to this workspace and do not affect other organisations.
          </p>
        </div>
      </aside>
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
