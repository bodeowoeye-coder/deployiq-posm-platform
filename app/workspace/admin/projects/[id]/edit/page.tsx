import { notFound, redirect } from "next/navigation";
import { ProjectEditForm } from "@/components/workspace/ProjectCreateWizard";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getCustomerProject } from "@/lib/workspace/projects";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectEditPage({
  params,
}: {
  params: { id: string };
}) {
  let result;
  try {
    result = await getCustomerProject(params.id);
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
  if (!result) notFound();

  return (
    <div className="space-y-6">
      <ProjectEditForm
        project={result.project}
        productName={result.workspace.productName}
        productKey={result.workspace.productKey}
        resources={result.resources}
      />
    </div>
  );
}
