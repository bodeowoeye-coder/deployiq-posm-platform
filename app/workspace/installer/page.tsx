import { InstallerWorkspaceClient } from "@/components/workspace/InstallerWorkspaceClient";
import { getInstallerAssignments } from "@/lib/workspace/deploymentExecution";

export const dynamic = "force-dynamic";

export default async function InstallerWorkspacePage() {
  const dashboard = await getInstallerAssignments();
  return <InstallerWorkspaceClient dashboard={dashboard} />;
}
