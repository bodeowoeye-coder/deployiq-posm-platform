import "server-only";

import { resolveCanonicalBuildProject } from "../../lib/build/projects/service.ts";

export type BuildAIAcceptanceAuthorizationResult = {
  authenticated: true;
  applicationRoleResolved: true;
  projectsRead: true;
  canonicalProjectResolved: true;
  projectEligible: true;
  clientAuthorityMatched: true;
  allowedProjectAuthorityMatched: true;
};

/**
 * Confirms acceptance authorization through the production Build project
 * resolver. Canonical resolver failures intentionally propagate unchanged.
 */
export async function verifyBuildAIAcceptanceAuthorization(
  projectId: string,
): Promise<BuildAIAcceptanceAuthorizationResult> {
  await resolveCanonicalBuildProject({
    projectId,
    requiredPermission: "projects:read",
  });

  return {
    authenticated: true,
    applicationRoleResolved: true,
    projectsRead: true,
    canonicalProjectResolved: true,
    projectEligible: true,
    clientAuthorityMatched: true,
    allowedProjectAuthorityMatched: true,
  };
}
