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
    provider: process.env.DEPLOYIQ_PROVISIONING_AGENT_PROVIDER?.trim().toLowerCase() || "deterministic",
    model: process.env.DEPLOYIQ_PROVISIONING_AGENT_MODEL?.trim() || "gpt-5.4-mini",
    timeoutMs: boundedInteger(process.env.DEPLOYIQ_PROVISIONING_AGENT_TIMEOUT_MS, 15000, 3000, 30000),
    maxRetries: boundedInteger(process.env.DEPLOYIQ_PROVISIONING_AGENT_MAX_RETRIES, 1, 0, 2),
  };
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function shouldRunProvisioningShadow(productKey: string) {
  const flags = getProvisioningAgentFlags();
  return flags.enabled && flags.products.has(productKey);
}
