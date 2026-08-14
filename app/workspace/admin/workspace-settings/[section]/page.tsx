import { notFound, redirect } from "next/navigation";
import { WorkspaceSettingsClient, type SettingsSection } from "@/components/workspace/WorkspaceSettingsClient";
import {
  CustomerWorkspaceRedirect,
  resolveCustomerWorkspaceContext,
  workspacePerformanceLog,
} from "@/lib/workspace/customerAdmin";

export const dynamic = "force-dynamic";

const sections = new Set(["general", "appearance", "branding", "security", "notifications", "access", "billing", "integrations"]);

export default async function WorkspaceSettingsSectionPage({ params }: { params: { section: string } }) {
  const startedAt = Number(process.hrtime.bigint()) / 1_000_000;
  if (!sections.has(params.section)) notFound();

  let workspace;
  try {
    workspace = await resolveCustomerWorkspaceContext();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
  const elapsedMs = Math.round((Number(process.hrtime.bigint()) / 1_000_000 - startedAt) * 10) / 10;
  workspacePerformanceLog({
    route: `/workspace/admin/workspace-settings/${params.section}`,
    step: "Settings page query",
    elapsedMs,
    totalElapsedMs: elapsedMs,
  });

  return <WorkspaceSettingsClient workspace={workspace} initialSection={params.section as SettingsSection} />;
}
