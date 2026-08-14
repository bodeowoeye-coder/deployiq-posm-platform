import { notFound, redirect } from "next/navigation";
import { CustomerWorkspaceRedirect, resolveCustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";
import { getWorkspaceCampaign } from "@/lib/workspace/campaigns";

export const dynamic = "force-dynamic";

export default async function CampaignRedirectPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const workspace = await resolveCustomerWorkspaceContext();
    const result = await getWorkspaceCampaign(params.id, workspace);
    if (!result) notFound();
    redirect(`/workspace/admin/projects/${result.campaign.project_id}`);
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
}
