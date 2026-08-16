export type ProvisioningAgentMode = "off" | "shadow";

function enabled(value: string | undefined) {
  return value?.trim() === "1";
}

export function getProvisioningAgentFlags() {
  const requestedMode = process.env.DEPLOYIQ_PROVISIONING_AGENT_MODE?.trim().toLowerCase();
  const mode: ProvisioningAgentMode = requestedMode === "shadow" ? "shadow" : "off";
  const products = new Set((process.env.DEPLOYIQ_PROVISIONING_AGENT_PRODUCTS ?? "retail").split(",").map((item) => item.trim()).filter(Boolean));
  return {
    enabled: enabled(process.env.DEPLOYIQ_PROVISIONING_AGENT_ENABLED) && mode === "shadow",
    mode,
    products,
    executionEnabled: false as const,
    executionRequested: enabled(process.env.DEPLOYIQ_PROVISIONING_AGENT_EXECUTION_ENABLED),
  };
}

export function shouldRunProvisioningShadow(productKey: string) {
  const flags = getProvisioningAgentFlags();
  return flags.enabled && flags.products.has(productKey);
}
