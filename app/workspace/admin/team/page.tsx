import { redirect } from "next/navigation";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getWorkspaceTeamDashboard } from "@/lib/workspace/team";
import { WorkspaceTeamClient } from "@/components/workspace/WorkspaceTeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  let dashboard;
  try {
    dashboard = await getWorkspaceTeamDashboard();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  return <WorkspaceTeamClient initialDashboard={dashboard} />;
}
