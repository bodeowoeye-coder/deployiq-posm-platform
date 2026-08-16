import { redirect } from "next/navigation";
import { WorkspaceReportsClient } from "@/components/workspace/WorkspaceReportsClient";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getWorkspaceAnalytics } from "@/lib/workspace/analytics";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams?: { projectId?: string } }) {
  try {
    return <WorkspaceReportsClient dashboard={await getWorkspaceAnalytics({ projectId: searchParams?.projectId })} />;
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
}
