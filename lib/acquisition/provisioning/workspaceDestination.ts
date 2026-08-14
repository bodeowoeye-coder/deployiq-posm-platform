const WORKSPACE_DOMAIN = "deployiq.ng";

function isEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export type WorkspaceDestinationReadiness = {
  hostname: string;
  workspaceUrl: string;
  adminWorkspaceUrl: string;
  wildcardRoutingConfirmed: boolean;
  domainRegistrationStatus: "not_required" | "not_configured";
  deploymentReady: boolean;
  redirectAllowed: boolean;
  reason: string | null;
};

export function buildAdminWorkspaceUrl(slug: string) {
  return `/workspace/admin?workspace=${encodeURIComponent(slug)}`;
}

export function buildWorkspaceUrl(slug: string) {
  const hostname = `${slug}.${WORKSPACE_DOMAIN}`;
  return {
    hostname,
    workspaceUrl: `https://${hostname}`,
    adminWorkspaceUrl: buildAdminWorkspaceUrl(slug),
  };
}

export function verifyWorkspaceDestination(slug: string): WorkspaceDestinationReadiness {
  const { hostname, workspaceUrl, adminWorkspaceUrl } = buildWorkspaceUrl(slug);
  const wildcardRoutingConfirmed = isEnabled(process.env.DEPLOYIQ_WORKSPACE_WILDCARD_ROUTING_ENABLED);
  const deploymentReady = wildcardRoutingConfirmed;
  return {
    hostname,
    workspaceUrl,
    adminWorkspaceUrl,
    wildcardRoutingConfirmed,
    domainRegistrationStatus: wildcardRoutingConfirmed ? "not_required" : "not_configured",
    deploymentReady,
    redirectAllowed: deploymentReady,
    reason: deploymentReady
      ? null
      : "Workspace hostname routing has not been verified yet. Our team will finish activation before redirecting you to the workspace.",
  };
}
