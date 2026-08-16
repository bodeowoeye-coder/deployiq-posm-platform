import { redirect } from "next/navigation";
import { WorkspaceAnalyticsClient } from "@/components/workspace/WorkspaceAnalyticsClient";
import { getWorkspaceAnalytics } from "@/lib/workspace/analytics";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams?: { projectId?: string } }) {
  try {
    return <WorkspaceAnalyticsClient dashboard={await getWorkspaceAnalytics({ projectId: searchParams?.projectId })} />;
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
}
