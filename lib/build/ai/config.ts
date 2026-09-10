import "server-only";

export const BUILD_AI_DEFAULT_MODEL = "gpt-5.6-luna";
export const BUILD_AI_DEFAULT_TIMEOUT_MS = 15_000;
export const BUILD_AI_DEFAULT_MAX_OUTPUT_TOKENS = 2_000;
export const BUILD_AI_TIMEOUT_RANGE = { minimum: 3_000, maximum: 20_000 } as const;
export const BUILD_AI_OUTPUT_TOKEN_RANGE = { minimum: 256, maximum: 4_000 } as const;

export type BuildAIEnabledConfig = {
  enabled: true;
  mode: "shadow";
  provider: "openai";
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
};
export type BuildAIConfigResult =
  | { status: "disabled"; enabled: false }
  | { status: "enabled"; config: BuildAIEnabledConfig }
  | { status: "invalid"; code: "invalid_enabled" | "invalid_mode" | "invalid_provider" | "invalid_model" | "invalid_timeout" | "invalid_output_limit" };

type Environment = Readonly<Record<string, string | undefined>>;
const boundedInteger = (value: string | undefined, fallback: number, minimum: number, maximum: number) => {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};

export function readBuildAIConfig(environment: Environment = process.env): BuildAIConfigResult {
  const enabled = environment.DEPLOYIQ_BUILD_AI_ENABLED?.trim() ?? "0";
  if (enabled !== "0" && enabled !== "1") return { status: "invalid", code: "invalid_enabled" };
  if (enabled === "0") return { status: "disabled", enabled: false };
  const mode = environment.DEPLOYIQ_BUILD_AI_MODE?.trim().toLowerCase() ?? "shadow";
  if (mode !== "shadow") return { status: "invalid", code: "invalid_mode" };
  const provider = environment.DEPLOYIQ_BUILD_AI_PROVIDER?.trim().toLowerCase();
  if (provider !== "openai") return { status: "invalid", code: "invalid_provider" };
  const model = environment.DEPLOYIQ_BUILD_AI_MODEL?.trim() ?? BUILD_AI_DEFAULT_MODEL;
  if (!model || model.length > 100 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model)) return { status: "invalid", code: "invalid_model" };
  const timeoutMs = boundedInteger(environment.DEPLOYIQ_BUILD_AI_TIMEOUT_MS?.trim(), BUILD_AI_DEFAULT_TIMEOUT_MS, BUILD_AI_TIMEOUT_RANGE.minimum, BUILD_AI_TIMEOUT_RANGE.maximum);
  if (timeoutMs === null) return { status: "invalid", code: "invalid_timeout" };
  const maxOutputTokens = boundedInteger(environment.DEPLOYIQ_BUILD_AI_MAX_OUTPUT_TOKENS?.trim(), BUILD_AI_DEFAULT_MAX_OUTPUT_TOKENS, BUILD_AI_OUTPUT_TOKEN_RANGE.minimum, BUILD_AI_OUTPUT_TOKEN_RANGE.maximum);
  if (maxOutputTokens === null) return { status: "invalid", code: "invalid_output_limit" };
  return { status: "enabled", config: { enabled: true, mode: "shadow", provider: "openai", model, timeoutMs, maxOutputTokens } };
}
