import { notFound } from "next/navigation";
import { DeploymentExecutionClient } from "@/components/workspace/DeploymentExecutionClient";
import { getDeploymentAssignment } from "@/lib/workspace/deploymentExecution";

export const dynamic = "force-dynamic";

export default async function AssignmentDetailPage({ params }: { params: { id: string } }) {
  const detail = await getDeploymentAssignment(params.id);
  if (!detail) notFound();
  const assignment = detail.assignment;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto w-[min(960px,calc(100%-28px))] py-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Assignment Detail</p>
          <h1 className="mt-2 text-2xl font-bold">{assignment.outlet}</h1>
          <p className="mt-2 text-sm text-slate-600">{assignment.campaign} | {assignment.project} | {assignment.status}</p>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Campaign" value={assignment.campaign} />
            <Info label="Project" value={assignment.project} />
            <Info label="Outlet" value={assignment.outlet} />
            <Info label="Address" value={assignment.address || "Not set"} />
            <Info label="Coordinates" value={assignment.coordinates.latitude === null ? "Not available" : `${assignment.coordinates.latitude}, ${assignment.coordinates.longitude}`} />
            <Info label="Target" value={String(assignment.target)} />
            <Info label="Instructions" value={assignment.instructions} />
            <Info label="Photos Required" value={assignment.photosRequired.join(", ")} />
            <Info label="Approval Requirements" value={assignment.approvalRequirements.join(", ")} />
            <Info label="Previous Submissions" value={String(detail.previousSubmissions.length)} />
            <Info label="Map" value={assignment.coordinates.latitude === null ? "Map unavailable until coordinates are added." : "Map coordinates available."} />
          </dl>
        </div>
        {detail.previousSubmissions.some((submission) => String(submission.status) === "Correction Requested") ? (
          <section className="mt-6 rounded-lg border border-orange-200 bg-orange-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-700">Correction Requested</p>
            <div className="mt-3 grid gap-3">
              {detail.previousSubmissions
                .filter((submission) => String(submission.status) === "Correction Requested")
                .map((submission) => (
                  <div key={String(submission.id)} className="rounded-lg border border-orange-200 bg-white p-4 text-sm">
                    <p className="font-bold text-slate-950">{String(submission.correction_notes || "Please correct and resubmit this deployment.")}</p>
                    <p className="mt-1 text-xs text-slate-500">Requested {String(submission.submitted_at || "").slice(0, 10)}</p>
                  </div>
                ))}
            </div>
          </section>
        ) : null}
        <div className="mt-6">
          <DeploymentExecutionClient detail={detail} />
        </div>
      </section>
    </main>
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
