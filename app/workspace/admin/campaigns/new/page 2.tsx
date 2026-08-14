import { redirect } from "next/navigation";
import { CampaignCreateWizard } from "@/components/workspace/CampaignCreateWizard";
import { CustomerWorkspaceRedirect, resolveCustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";
import { getCampaignCreateOptions } from "@/lib/workspace/campaigns";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  let options;
  try {
    const workspace = await resolveCustomerWorkspaceContext();
    options = await getCampaignCreateOptions(workspace);
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">New Campaign</p>
        <h2 className="mt-2 text-xl font-bold">Create Campaign</h2>
        <p className="mt-2 text-sm text-slate-600">Define campaign identity, geography, timeline, deployment target and execution ownership.</p>
      </div>
      <CampaignCreateWizard options={options} />
    </div>
  );
}
