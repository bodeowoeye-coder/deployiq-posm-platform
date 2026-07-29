export function isSelfServiceOnboardingEnabled() {
  return process.env.ENABLE_SELF_SERVICE_ONBOARDING === "true" || process.env.NEXT_PUBLIC_ENABLE_SELF_SERVICE_ONBOARDING === "true";
}

export function isTestWorkspaceProvisioningEnabled() {
  return process.env.ENABLE_TEST_WORKSPACE_PROVISIONING === "true";
}
