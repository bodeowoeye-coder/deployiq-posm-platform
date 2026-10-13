import { notFound } from "next/navigation";
import { OperationalBuildProjectFrame } from "@/components/workspace/OperationalBuildProjectFrame";
import { resolveCanonicalBuildProject } from "@/lib/build/projects/service";
import { resolveOperationalBuildAccess } from "@/lib/workspace/operationalBuildAccess";

export const dynamic = "force-dynamic";

export default async function OperationalBuildProjectLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  const access = await resolveOperationalBuildAccess();
  if (!access.authorizedProjectIds.includes(params.id)) notFound();
  try {
    const { project } = await resolveCanonicalBuildProject({ projectId: params.id, requiredPermission: "projects:read", requestedClientId: access.clientId });
    return <OperationalBuildProjectFrame project={project}>{children}</OperationalBuildProjectFrame>;
  } catch { notFound(); }
}
