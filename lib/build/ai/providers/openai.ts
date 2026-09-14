import "server-only";

import OpenAI, { APIConnectionTimeoutError } from "openai";
import { readBuildAIConfig, type BuildAIEnabledConfig } from "../config.ts";
import { buildBuildAIInstructions } from "../prompt.ts";
import { projectBuildAIProviderRequest } from "../projection.ts";
import { BuildAIProviderError, type BuildAIProvider, type BuildAIProviderRequest, type BuildAIProviderResult } from "../provider.ts";

export const BUILD_AI_OPENAI_OUTPUT_SCHEMA_NAME = "deployiq_build_ai_model_output_v1";
const identifier = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" } as const;
const boundedText = { type: "string", minLength: 1, maxLength: 500 } as const;
export const BUILD_AI_OPENAI_OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    schemaVersion: { type: "string", const: "1.0" },
    statements: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, properties: {
      id: identifier, type: { type: "string", enum: ["interpretation", "attention", "decision_option", "limitation"] }, text: boundedText,
      supportingFacts: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, properties: {
        toolCallId: identifier, factPath: { type: "string", pattern: "^/(?:[A-Za-z][A-Za-z0-9_]*|0|[1-9][0-9]*)(?:/(?:[A-Za-z][A-Za-z0-9_]*|0|[1-9][0-9]*))*$" }, provenanceKeys: { type: "array", minItems: 1, maxItems: 8, items: identifier },
      }, required: ["toolCallId", "factPath", "provenanceKeys"] } },
      limitationIds: { type: "array", maxItems: 8, items: identifier },
    }, required: ["id", "type", "text", "supportingFacts", "limitationIds"] } },
    limitations: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, properties: {
      id: identifier, code: { type: "string", enum: ["partial_coverage", "data_unavailable", "history_unavailable", "interpretation_unavailable", "unsupported_conclusion", "governance_not_configured"] }, text: boundedText,
      coverageRefs: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, properties: { toolCallId: identifier, coveragePath: { type: "string" } }, required: ["toolCallId", "coveragePath"] } },
    }, required: ["id", "code", "text", "coverageRefs"] } },
  }, required: ["schemaVersion", "statements", "limitations"],
} as const;

type OpenAIResponse = { status?: string; output_text?: string; model?: string };
export type BuildAIOpenAIClient = { responses: { create(body: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<OpenAIResponse> } };
export type BuildAIOpenAIClientFactory = (options: { apiKey: string; timeout: number; maxRetries: 0 }) => BuildAIOpenAIClient;
const defaultClientFactory: BuildAIOpenAIClientFactory = (options) => new OpenAI(options) as unknown as BuildAIOpenAIClient;

export class OpenAIBuildAIProvider implements BuildAIProvider {
  constructor(private readonly config: BuildAIEnabledConfig, private readonly client: BuildAIOpenAIClient) {}

  async generate(request: BuildAIProviderRequest): Promise<BuildAIProviderResult> {
    if (request.signal.aborted) throw new BuildAIProviderError("ai_unavailable", "provider_timeout");
    const projected = projectBuildAIProviderRequest(request);
    const instructions = buildBuildAIInstructions(projected);
    try {
      const response = await this.client.responses.create({
        model: this.config.model,
        instructions: JSON.stringify({ systemPolicyId: instructions.systemPolicyId, systemPolicy: instructions.systemPolicy }),
        input: JSON.stringify({ taskInstruction: instructions.taskInstruction, userContent: instructions.userContent, deterministicContext: instructions.deterministicContext }),
        text: { format: { type: "json_schema", name: BUILD_AI_OPENAI_OUTPUT_SCHEMA_NAME, strict: true, schema: BUILD_AI_OPENAI_OUTPUT_SCHEMA } },
        reasoning: { effort: "none" },
        max_output_tokens: this.config.maxOutputTokens,
        store: false,
        truncation: "disabled",
      }, { signal: request.signal });
      if (response.status !== "completed") throw new BuildAIProviderError("interpretation_unavailable", response.status === "incomplete" ? "incomplete_response" : "provider_refusal");
      if (typeof response.output_text !== "string" || !response.output_text.trim()) throw new BuildAIProviderError("interpretation_unavailable", "invalid_provider_response");
      let output: unknown;
      try { output = JSON.parse(response.output_text); }
      catch { throw new BuildAIProviderError("interpretation_unavailable", "invalid_provider_response"); }
      const effectiveModel = typeof response.model === "string" && response.model.trim() && response.model.length <= 100 ? response.model : this.config.model;
      return { metadata: { providerId: "openai", modelId: effectiveModel }, output };
    } catch (error) {
      if (error instanceof BuildAIProviderError) throw error;
      const status = Number((error as { status?: unknown })?.status ?? 0);
      const category = error instanceof APIConnectionTimeoutError || request.signal.aborted
        ? "provider_timeout"
        : status === 401 || status === 403
          ? "configuration_error"
          : status === 429
            ? "rate_limited"
            : status >= 500
              ? "provider_unavailable"
              : "transport_error";
      throw new BuildAIProviderError("ai_unavailable", category);
    }
  }
}

export type BuildAIProviderFactoryResult =
  | { status: "disabled" }
  | { status: "invalid"; code: string }
  | { status: "ready"; provider: BuildAIProvider; config: BuildAIEnabledConfig };

export function createConfiguredBuildAIProvider(options: { environment?: Readonly<Record<string, string | undefined>>; clientFactory?: BuildAIOpenAIClientFactory } = {}): BuildAIProviderFactoryResult {
  const environment = options.environment ?? process.env;
  const parsed = readBuildAIConfig(environment);
  if (parsed.status === "disabled") return { status: "disabled" };
  if (parsed.status === "invalid") return parsed;
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) return { status: "invalid", code: "provider_credentials_missing" };
  const client = (options.clientFactory ?? defaultClientFactory)({ apiKey, timeout: parsed.config.timeoutMs, maxRetries: 0 });
  return { status: "ready", provider: new OpenAIBuildAIProvider(parsed.config, client), config: parsed.config };
}
