import OpenAI from "openai";
import type { TrustedProvisioningContext } from "./context.ts";
import { createDeterministicBaseline, type ProvisioningPlannerProvider } from "./planner.ts";
import type { PlanDecision, PlanInterpretation, ProvisioningPlan } from "./schema.ts";

export const PROVISIONING_PROMPT_SCHEMA_VERSION = "provisioning-plan-v2";

type ModelProposal = {
  interpretation: PlanInterpretation;
  configuration: ProvisioningPlan["configuration"];
  decisions: PlanDecision[];
  warnings: string[];
  approval: { required: boolean; reasons: string[] };
};

const stringArray = { type: "array", items: { type: "string" } } as const;
export const MODEL_PROPOSAL_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    interpretation: { type: "object", additionalProperties: false, properties: { summary: { type: "string" }, rationale: stringArray, humanReviewRecommended: { type: "boolean" } }, required: ["summary", "rationale", "humanReviewRecommended"] },
    configuration: { type: "object", additionalProperties: false, properties: { modules: stringArray, navigation: stringArray, roles: stringArray, statuses: stringArray, reportingDefaults: stringArray, notificationDefaults: stringArray, checklist: stringArray }, required: ["modules", "navigation", "roles", "statuses", "reportingDefaults", "notificationDefaults", "checklist"] },
    decisions: { type: "array", items: { type: "object", additionalProperties: false, properties: { code: { type: "string" }, classification: { type: "string", enum: ["ai_assisted", "human"] }, source: { type: "string" }, rationale: { type: "string" } }, required: ["code", "classification", "source", "rationale"] } },
    warnings: stringArray,
    approval: { type: "object", additionalProperties: false, properties: { required: { type: "boolean" }, reasons: stringArray }, required: ["required", "reasons"] },
  },
  required: ["interpretation", "configuration", "decisions", "warnings", "approval"],
} as const;

const SYSTEM_INSTRUCTION = `You are DeployIQ AI, a provisioning-planning assistant. You do not have authority to provision customer infrastructure. You may only propose a workspace configuration using the trusted facts and allowed configuration supplied to you. Do not invent customers, products, pricing, commercial terms, identities, modules, capabilities, roles, navigation keys, workspace identifiers or permissions. If information is ambiguous, flag it as a warning rather than inventing a value. DeployIQ's deterministic policy validator is authoritative. Return concise customer-facing summaries and rationale, never chain-of-thought or executable instructions.`;

export class ProvisioningProviderError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; this.name = "ProvisioningProviderError"; }
}

export function buildSanitizedModelInput(context: TrustedProvisioningContext) {
  return {
    customer: { organisation: context.customer.organisation, country: context.customer.country, industry: context.customer.industry, operationalObjective: context.customer.operationalObjective, deploymentScale: context.customer.deploymentScale },
    approvedCommercialConfiguration: { product: context.commercial.productKey, planModel: context.commercial.commercialModel, quantity: context.commercial.quantity, currency: context.commercial.currency, approvedCapabilities: context.commercial.approvedCapabilities },
    workspaceRequest: { name: context.workspace.displayName, requestedSlug: context.workspace.requestedSlug, timezone: context.workspace.timezone },
    verifiedAdministration: { administratorVerified: true, role: "customer_admin" },
    allowedConfiguration: { manifestVersion: context.manifest.version, modules: context.manifest.permittedModules, navigation: context.manifest.permittedNavigation, roles: context.manifest.permittedRoles, statuses: context.manifest.permittedStatuses, reports: context.manifest.permittedReports, notifications: context.manifest.permittedNotifications, checklist: context.manifest.permittedChecklist },
  };
}

function strings(value: unknown, name: string) { if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new ProvisioningProviderError(`invalid_${name}`); return value as string[]; }
function safeNarrative(values: string[]) {
  const executable = /```|\b(?:drop|alter|truncate|insert|update|delete)\s+(?:table|into|from|public\.)|\b(?:curl|wget|sudo|eval|exec)\b|\bcreate\s+(?:client|workspace|membership|entitlement)\b/i;
  if (values.some((value) => executable.test(value))) throw new ProvisioningProviderError("unsafe_narrative");
  return values;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) { if (Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) throw new ProvisioningProviderError("schema_properties_invalid"); }
function object(value: unknown, name: string) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProvisioningProviderError(`invalid_${name}`); return value as Record<string, unknown>; }

export function parseModelProposal(raw: string): ModelProposal {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new ProvisioningProviderError("malformed_json"); }
  const root = object(parsed, "proposal"); exactKeys(root, ["interpretation", "configuration", "decisions", "warnings", "approval"]);
  const interpretation = object(root.interpretation, "interpretation"); exactKeys(interpretation, ["summary", "rationale", "humanReviewRecommended"]);
  if (typeof interpretation.summary !== "string" || typeof interpretation.humanReviewRecommended !== "boolean") throw new ProvisioningProviderError("invalid_interpretation");
  const configuration = object(root.configuration, "configuration"); exactKeys(configuration, ["modules", "navigation", "roles", "statuses", "reportingDefaults", "notificationDefaults", "checklist"]);
  const decisions = Array.isArray(root.decisions) ? root.decisions.map((item) => { const row = object(item, "decision"); exactKeys(row, ["code", "classification", "source", "rationale"]); if (typeof row.code !== "string" || !["ai_assisted", "human"].includes(String(row.classification)) || typeof row.source !== "string" || typeof row.rationale !== "string") throw new ProvisioningProviderError("invalid_decision"); safeNarrative([row.rationale]); return row as unknown as PlanDecision; }) : (() => { throw new ProvisioningProviderError("invalid_decisions"); })();
  const approval = object(root.approval, "approval"); exactKeys(approval, ["required", "reasons"]); if (typeof approval.required !== "boolean") throw new ProvisioningProviderError("invalid_approval");
  const rationale = safeNarrative(strings(interpretation.rationale, "rationale"));
  safeNarrative([interpretation.summary]);
  return { interpretation: { summary: interpretation.summary, rationale, humanReviewRecommended: interpretation.humanReviewRecommended }, configuration: { modules: strings(configuration.modules, "modules"), navigation: strings(configuration.navigation, "navigation"), roles: strings(configuration.roles, "roles"), statuses: strings(configuration.statuses, "statuses"), reportingDefaults: strings(configuration.reportingDefaults, "reports"), notificationDefaults: strings(configuration.notificationDefaults, "notifications"), checklist: strings(configuration.checklist, "checklist") }, decisions, warnings: safeNarrative(strings(root.warnings, "warnings")), approval: { required: approval.required, reasons: safeNarrative(strings(approval.reasons, "approval_reasons")) } };
}

export class OpenAIProvisioningPlannerProvider implements ProvisioningPlannerProvider {
  readonly provider = "openai"; readonly promptSchemaVersion = PROVISIONING_PROMPT_SCHEMA_VERSION;
  readonly version: string;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly apiKey: string;
  constructor(model: string, timeoutMs: number, maxRetries: number, apiKey = process.env.OPENAI_API_KEY ?? "") {
    this.model = model; this.timeoutMs = timeoutMs; this.maxRetries = maxRetries; this.apiKey = apiKey;
    this.version = `openai-responses:${model}:${PROVISIONING_PROMPT_SCHEMA_VERSION}`;
  }
  async createPlan(context: TrustedProvisioningContext) {
    if (!this.apiKey) throw new ProvisioningProviderError("provider_credentials_missing");
    const client = new OpenAI({ apiKey: this.apiKey, timeout: this.timeoutMs, maxRetries: 0 });
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await client.responses.create({ model: this.model, instructions: SYSTEM_INSTRUCTION, input: JSON.stringify(buildSanitizedModelInput(context)), text: { format: { type: "json_schema", name: "deployiq_provisioning_proposal", strict: true, schema: MODEL_PROPOSAL_JSON_SCHEMA } } });
        const proposal = parseModelProposal(response.output_text);
        return { ...createDeterministicBaseline(context), interpretation: proposal.interpretation, configuration: proposal.configuration, decisions: proposal.decisions, warnings: proposal.warnings, approval: proposal.approval };
      } catch (error) { lastError = error; if (error instanceof ProvisioningProviderError || attempt >= this.maxRetries) break; }
    }
    if (lastError instanceof ProvisioningProviderError) throw lastError;
    const status = Number((lastError as { status?: unknown })?.status ?? 0);
    throw new ProvisioningProviderError(status === 429 ? "provider_rate_limited" : status >= 500 ? "provider_unavailable" : "provider_request_failed");
  }
}
