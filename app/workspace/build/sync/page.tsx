import { BuildEvidenceSyncWorkspace } from "@/components/workspace/BuildMobileEvidenceOutbox";
import { resolveOperationalBuildAccess } from "@/lib/workspace/operationalBuildAccess";

export const dynamic = "force-dynamic";
export default async function BuildSyncPage() {
  const access = await resolveOperationalBuildAccess();
  return <BuildEvidenceSyncWorkspace identity={{ userId: access.userId, clientId: access.clientId }}/>;
}
