import { redirect } from "next/navigation";
import {
  CustomerWorkspaceRedirect,
  resolveCustomerWorkspaceContext,
  workspacePerformanceLog,
} from "@/lib/workspace/customerAdmin";
import { WorkspaceSettingsClient } from "@/components/workspace/WorkspaceSettingsClient";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  const startedAt = Number(process.hrtime.bigint()) / 1_000_000;
  let workspace;
  try {
    workspace = await resolveCustomerWorkspaceContext();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
  const elapsedMs = Math.round((Number(process.hrtime.bigint()) / 1_000_000 - startedAt) * 10) / 10;
  workspacePerformanceLog({
    route: "/workspace/admin/workspace-settings",
    step: "Settings page query",
    elapsedMs,
    totalElapsedMs: elapsedMs,
  });

  return <WorkspaceSettingsClient workspace={workspace} />;
}
