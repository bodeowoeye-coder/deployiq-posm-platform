import { createAdminSupabase } from "../../supabaseAdmin";
import { buildPricingTemplatePayload as buildPricingTemplatePayloadFromModule } from "./payload";
import { validatePricingTemplate as validatePricingTemplateFromModule } from "./validation";
import { normaliseCountry, countriesMatch } from "./countryNormalisation";
import { resolveCommercialModel, resolveAllowedPaymentMethods } from "./commercialModel";
import { buildClonedTemplateInsert } from "./clone";
import { getProductKeyLookupVariants, resolveProductKey } from "../products/catalogue";
import type {
  EnterpriseReviewResult,
  PricingCalculationRequest,
  PricingCalculationResult,
  PricingEnterpriseAction,
  PricingScope,
  PricingSnapshot,
  PricingTemplate,
  PricingTemplateStatus,
  PricingTier,
  PricingTierBreakdown,
  PricingTierStatus,
  PricingUnavailableResult,
  PricingValidationError
} from "./types";

function toNumber(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value;
  return null;
}

/**
 * Convert a value to a trimmed string, or null.
 * Empty strings are treated as null — they mean "no restriction" for optional
 * scope fields (country, region, customer_segment, campaign_type).
 * This handles templates that stored "" rather than NULL.
 */
function toOptionalStringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  return null;
}

function parseDateString(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  return null;
}

function normalizeTemplateRecord(record: Record<string, unknown>): PricingTemplate {
  const tiers = Array.isArray(record.tiers) ? (record.tiers as Record<string, unknown>[]).map(normalizeTierRecord) : [];
  return {
    id: toStringOrNull(record.id),
    product_key: resolveProductKey(String(record.product_key ?? "")),
    name: String(record.name ?? ""),
    description: toStringOrNull(record.description),
    currency: String(record.currency ?? ""),
    country: toOptionalStringOrNull(record.country),
    region: toOptionalStringOrNull(record.region),
    customer_segment: toOptionalStringOrNull(record.customer_segment),
    campaign_type: toOptionalStringOrNull(record.campaign_type),
    pricing_metric: String(record.pricing_metric ?? "deployment_location") as PricingTemplate["pricing_metric"],
    pricing_method: String(record.pricing_method ?? "progressive_tiered") as PricingTemplate["pricing_method"],
    status: String(record.status ?? "draft") as PricingTemplateStatus,
    is_default: Boolean(record.is_default),
    effective_from: parseDateString(record.effective_from),
    effective_to: parseDateString(record.effective_to),
    commercial_model: toOptionalStringOrNull(record.commercial_model),
    billing_behaviour: toOptionalStringOrNull(record.billing_behaviour),
    renewal_required: typeof record.renewal_required === "boolean" ? record.renewal_required : false,
    allowed_payment_methods: Array.isArray(record.allowed_payment_methods)
      ? (record.allowed_payment_methods as string[])
      : null,
    quotation_validity_days: toNumber(record.quotation_validity_days),
    created_by: toStringOrNull(record.created_by),
    updated_by: toStringOrNull(record.updated_by),
    activated_by: toStringOrNull(record.activated_by),
    activated_at: parseDateString(record.activated_at),
    deactivated_by: toStringOrNull(record.deactivated_by),
    deactivated_at: parseDateString(record.deactivated_at),
    archived_by: toStringOrNull(record.archived_by),
    created_at: parseDateString(record.created_at) ?? new Date().toISOString(),
    updated_at: parseDateString(record.updated_at) ?? new Date().toISOString(),
    archived_at: parseDateString(record.archived_at),
    tiers
  };
}

function normalizeTierRecord(record: Record<string, unknown>): PricingTier {
  return {
    id: toStringOrNull(record.id),
    pricing_template_id: toStringOrNull(record.pricing_template_id),
    sequence: Number(record.sequence ?? 0),
    minimum_quantity: Number(record.minimum_quantity ?? 0),
    maximum_quantity: toNumber(record.maximum_quantity),
    unit_price: Number(toNumber(record.unit_price, 0) ?? 0),
    fixed_charge: toNumber(record.fixed_charge, 0),
    calculation_type: "progressive",
    enterprise_action: (record.enterprise_action as PricingTier["enterprise_action"]) ?? null,
    status: String(record.status ?? "active") as PricingTier["status"],
    created_at: parseDateString(record.created_at) ?? undefined,
    updated_at: parseDateString(record.updated_at) ?? undefined,
    archived_at: parseDateString(record.archived_at) ?? undefined
  };
}

function createScopeFromRequest(request: PricingCalculationRequest): PricingScope {
  return {
    product_key: request.productKey,
    currency: request.currency ?? "NGN",
    country: request.country ?? null,
    region: request.region ?? null,
    customer_segment: request.customerSegment ?? null,
    campaign_type: request.campaignType ?? null
  };
}

function createTemplateResolutionError(message: string): PricingValidationError {
  return { code: "pricing_unavailable", message, details: {} };
}

function isWithinEffectiveWindow(template: PricingTemplate, calculationDate: string | null): boolean {
  const now = calculationDate ? new Date(calculationDate) : new Date();
  if (template.effective_from && now < new Date(template.effective_from)) return false;
  if (template.effective_to && now > new Date(template.effective_to)) return false;
  return true;
}

function matchesScope(template: PricingTemplate, scope: PricingScope): boolean {
  // Use normalised comparison so "Nigeria", "NG", "NGA" all resolve to the same country.
  const countryMatches = countriesMatch(template.country, scope.country);
  const regionMatches = template.region === null || template.region === scope.region;
  const segmentMatches = template.customer_segment === null || template.customer_segment === scope.customer_segment;
  const campaignMatches = template.campaign_type === null || template.campaign_type === scope.campaign_type;
  return countryMatches && regionMatches && segmentMatches && campaignMatches;
}

function sortCandidates(candidates: PricingTemplate[]): PricingTemplate[] {
  return candidates.sort((left, right) => {
    const leftScore = Number(left.is_default);
    const rightScore = Number(right.is_default);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return (left.updated_at ?? "").localeCompare(right.updated_at ?? "");
  });
}

export function calculateAdministrativeUsers(quantity: number) {
  if (quantity <= 0) return 0;
  if (quantity < 1000) return 3;
  return Math.ceil(quantity / 1000) * 5;
}

export const validatePricingTemplate = validatePricingTemplateFromModule;

// ---------------------------------------------------------------------------
// Shared result builder
// ---------------------------------------------------------------------------

function buildBaseResult(
  quantity: number,
  template: PricingTemplate,
  quotationExpiry: string | null
) {
  return {
    pricing_template_id: template.id,
    pricing_template_name: template.name,
    product_key: template.product_key,
    country: template.country,
    currency: template.currency,
    pricing_metric: template.pricing_metric,
    pricing_method: template.pricing_method,
    quantity,
    discount: 0 as const,
    tax: 0 as const,
    included_admin_users: calculateAdministrativeUsers(quantity),
    quotation_expiry: quotationExpiry,
    calculated_at: new Date().toISOString(),
    commercial_model: template.commercial_model ?? null,
    billing_behaviour: template.billing_behaviour ?? null,
    renewal_required: template.renewal_required ?? false,
    allowed_payment_methods: template.allowed_payment_methods ?? null,
  };
}

// ---------------------------------------------------------------------------
// Progressive pricing (marginal split across tiers)
// ---------------------------------------------------------------------------

function calculateProgressiveResult(
  normalizedQuantity: number,
  template: PricingTemplate,
  activeTiers: PricingTier[]
): PricingCalculationResult {
  const resolvedTiers = activeTiers.sort((left, right) => left.sequence - right.sequence);
  let remaining = normalizedQuantity;
  let subtotal = 0;
  let requiresEnterpriseReview = false;
  const tierBreakdown: PricingTierBreakdown[] = [];
  let currentMinimum = 1;

  resolvedTiers.forEach((tier) => {
    if (remaining <= 0) return;
    const tierStart = Math.max(currentMinimum, tier.minimum_quantity);
    const tierEnd = tier.maximum_quantity === null ? normalizedQuantity : Math.min(normalizedQuantity, tier.maximum_quantity);
    if (tierEnd < tierStart) return;
    const applicableQuantity = Math.min(remaining, Math.max(0, tierEnd - tierStart + 1));
    if (applicableQuantity <= 0) return;

    if (tier.enterprise_action === "request_quotation") {
      requiresEnterpriseReview = true;
      tierBreakdown.push({ sequence: tier.sequence, minimum_quantity: tier.minimum_quantity, maximum_quantity: tier.maximum_quantity, applicable_quantity: applicableQuantity, unit_price: tier.unit_price, fixed_charge: 0, subtotal: 0, enterprise_action: tier.enterprise_action, label: `Tier ${tier.sequence}` });
      remaining -= applicableQuantity;
      currentMinimum = (tier.maximum_quantity ?? normalizedQuantity) + 1;
      return;
    }

    const tierFixedCharge = tier.fixed_charge ?? 0;
    const tierSubtotal = applicableQuantity * tier.unit_price + tierFixedCharge;
    subtotal += tierSubtotal;
    tierBreakdown.push({ sequence: tier.sequence, minimum_quantity: tier.minimum_quantity, maximum_quantity: tier.maximum_quantity, applicable_quantity: applicableQuantity, unit_price: tier.unit_price, fixed_charge: tierFixedCharge, subtotal: tierSubtotal, enterprise_action: tier.enterprise_action, label: `Tier ${tier.sequence}` });
    remaining -= applicableQuantity;
    currentMinimum = (tier.maximum_quantity ?? normalizedQuantity) + 1;
  });

  const quotationExpiry = template.quotation_validity_days ? new Date(Date.now() + template.quotation_validity_days * 24 * 60 * 60 * 1000).toISOString() : null;
  return { ...buildBaseResult(normalizedQuantity, template, quotationExpiry), tier_breakdown: tierBreakdown, subtotal, total: requiresEnterpriseReview ? 0 : subtotal, quotation_status: requiresEnterpriseReview ? "request_quotation" : "calculated", quotation_expiry: quotationExpiry, requires_enterprise_review: requiresEnterpriseReview, enterprise_action: requiresEnterpriseReview ? "request_quotation" : null };
}

// ---------------------------------------------------------------------------
// Volume pricing (full quantity priced at qualifying tier rate)
// ---------------------------------------------------------------------------

function calculateVolumeResult(
  normalizedQuantity: number,
  template: PricingTemplate,
  activeTiers: PricingTier[]
): PricingCalculationResult {
  const sortedTiers = activeTiers.sort((a, b) => a.sequence - b.sequence);
  const quotationExpiry = template.quotation_validity_days ? new Date(Date.now() + template.quotation_validity_days * 24 * 60 * 60 * 1000).toISOString() : null;

  // Find the single qualifying tier that covers the full quantity
  const qualifying = sortedTiers.find((tier) => {
    const min = tier.minimum_quantity;
    const max = tier.maximum_quantity;
    return normalizedQuantity >= min && (max === null || normalizedQuantity <= max);
  });

  if (!qualifying) {
    throw new Error(`Quantity ${normalizedQuantity} is not covered by any tier in this template.`);
  }

  if (qualifying.enterprise_action === "request_quotation") {
    return { ...buildBaseResult(normalizedQuantity, template, quotationExpiry), tier_breakdown: [{ sequence: qualifying.sequence, minimum_quantity: qualifying.minimum_quantity, maximum_quantity: qualifying.maximum_quantity, applicable_quantity: normalizedQuantity, unit_price: qualifying.unit_price, fixed_charge: 0, subtotal: 0, enterprise_action: qualifying.enterprise_action, label: `Tier ${qualifying.sequence}` }], subtotal: 0, total: 0, quotation_status: "request_quotation", quotation_expiry: quotationExpiry, requires_enterprise_review: true, enterprise_action: "request_quotation" };
  }

  const tierFixedCharge = qualifying.fixed_charge ?? 0;
  const tierSubtotal = normalizedQuantity * qualifying.unit_price + tierFixedCharge;
  return { ...buildBaseResult(normalizedQuantity, template, quotationExpiry), tier_breakdown: [{ sequence: qualifying.sequence, minimum_quantity: qualifying.minimum_quantity, maximum_quantity: qualifying.maximum_quantity, applicable_quantity: normalizedQuantity, unit_price: qualifying.unit_price, fixed_charge: tierFixedCharge, subtotal: tierSubtotal, enterprise_action: qualifying.enterprise_action, label: `Tier ${qualifying.sequence}` }], subtotal: tierSubtotal, total: tierSubtotal, quotation_status: "calculated", quotation_expiry: quotationExpiry, requires_enterprise_review: false, enterprise_action: null };
}

// ---------------------------------------------------------------------------
// Flat-rate pricing (single unit price for all quantities)
// ---------------------------------------------------------------------------

function calculateFlatRateResult(
  normalizedQuantity: number,
  template: PricingTemplate,
  activeTiers: PricingTier[]
): PricingCalculationResult {
  const sortedTiers = activeTiers.sort((a, b) => a.sequence - b.sequence);
  const quotationExpiry = template.quotation_validity_days ? new Date(Date.now() + template.quotation_validity_days * 24 * 60 * 60 * 1000).toISOString() : null;

  const autoTier = sortedTiers.find((t) => t.enterprise_action !== "request_quotation");
  const enterpriseTier = sortedTiers.find((t) => t.enterprise_action === "request_quotation");

  if (!autoTier) {
    return { ...buildBaseResult(normalizedQuantity, template, quotationExpiry), tier_breakdown: enterpriseTier ? [{ sequence: enterpriseTier.sequence, minimum_quantity: enterpriseTier.minimum_quantity, maximum_quantity: enterpriseTier.maximum_quantity, applicable_quantity: normalizedQuantity, unit_price: 0, fixed_charge: 0, subtotal: 0, enterprise_action: "request_quotation", label: `Tier ${enterpriseTier.sequence}` }] : [], subtotal: 0, total: 0, quotation_status: "request_quotation", quotation_expiry: quotationExpiry, requires_enterprise_review: true, enterprise_action: "request_quotation" };
  }

  // Check if quantity exceeds the auto tier's range → enterprise
  if (autoTier.maximum_quantity !== null && normalizedQuantity > autoTier.maximum_quantity && enterpriseTier) {
    return { ...buildBaseResult(normalizedQuantity, template, quotationExpiry), tier_breakdown: [{ sequence: enterpriseTier.sequence, minimum_quantity: enterpriseTier.minimum_quantity, maximum_quantity: enterpriseTier.maximum_quantity, applicable_quantity: normalizedQuantity, unit_price: 0, fixed_charge: 0, subtotal: 0, enterprise_action: "request_quotation", label: `Tier ${enterpriseTier.sequence}` }], subtotal: 0, total: 0, quotation_status: "request_quotation", quotation_expiry: quotationExpiry, requires_enterprise_review: true, enterprise_action: "request_quotation" };
  }

  const tierFixedCharge = autoTier.fixed_charge ?? 0;
  const tierSubtotal = normalizedQuantity * autoTier.unit_price + tierFixedCharge;
  return { ...buildBaseResult(normalizedQuantity, template, quotationExpiry), tier_breakdown: [{ sequence: autoTier.sequence, minimum_quantity: autoTier.minimum_quantity, maximum_quantity: autoTier.maximum_quantity, applicable_quantity: normalizedQuantity, unit_price: autoTier.unit_price, fixed_charge: tierFixedCharge, subtotal: tierSubtotal, enterprise_action: autoTier.enterprise_action, label: `Tier ${autoTier.sequence}` }], subtotal: tierSubtotal, total: tierSubtotal, quotation_status: "calculated", quotation_expiry: quotationExpiry, requires_enterprise_review: false, enterprise_action: null };
}

// ---------------------------------------------------------------------------
// Public dispatcher — routes by pricing_method
// ---------------------------------------------------------------------------

export function calculateProgressivePricing(
  quantity: number,
  template: PricingTemplate,
  activeTiers: PricingTier[] = template.tiers.filter((tier) => tier.status === "active"),
  context?: Partial<PricingCalculationRequest>
): PricingCalculationResult {
  const validation = validatePricingTemplate(template);
  if (!validation.isValid) {
    throw new Error(validation.errors[0]?.message ?? "Invalid pricing configuration.");
  }

  const normalizedQuantity = Number.isInteger(quantity) ? quantity : Math.floor(quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive whole number.");
  }

  const sortedActiveTiers = activeTiers.sort((a, b) => a.sequence - b.sequence);

  switch (template.pricing_method) {
    case "volume_tiered":
      return calculateVolumeResult(normalizedQuantity, template, sortedActiveTiers);
    case "flat_rate":
      return calculateFlatRateResult(normalizedQuantity, template, sortedActiveTiers);
    default:
      return calculateProgressiveResult(normalizedQuantity, template, sortedActiveTiers);
  }
}

export async function resolveApplicablePricingTemplate(request: PricingCalculationRequest): Promise<{ template: PricingTemplate | null; error?: PricingValidationError }> {
  const supabase = createAdminSupabase();
  // Normalise legacy product keys (assets → assets_audit, etc.) before querying
  const canonicalProductKey = resolveProductKey(request.productKey);
  const scope = createScopeFromRequest({ ...request, productKey: canonicalProductKey });
  const calculationDate = request.calculationDate ?? new Date().toISOString();

  const { data, error } = await supabase
    .from("commercial_pricing_templates")
    .select("*, commercial_pricing_tiers(*)")
    .in("product_key", getProductKeyLookupVariants(canonicalProductKey))
    .eq("currency", request.currency ?? "NGN")
    .eq("status", "active")
    .is("archived_at", null)
    .order("is_default", { ascending: false });

  if (error) {
    throw error;
  }

  const templateRows = (data ?? []) as Array<Record<string, unknown>>;
  const candidates = templateRows
    .map((record) => normalizeTemplateRecord({ ...record, tiers: Array.isArray(record.commercial_pricing_tiers) ? (record.commercial_pricing_tiers as Record<string, unknown>[]).map(normalizeTierRecord) : [] }))
    .filter((template) => template.status === "active" && !template.archived_at && resolveProductKey(template.product_key) === canonicalProductKey && template.currency === (request.currency ?? "NGN") && isWithinEffectiveWindow(template, calculationDate));

  const scopedCandidates = candidates.filter((template) => matchesScope(template, scope));

  // Normalise scope country for comparisons in the bucket filters below.
  const normalisedScopeCountry = normaliseCountry(scope.country);

  const exactCandidates = scopedCandidates.filter(
    (template) =>
      normaliseCountry(template.country) === normalisedScopeCountry &&
      template.region                === scope.region &&
      template.customer_segment     === scope.customer_segment &&
      template.campaign_type        === scope.campaign_type,
  );
  const countryCandidates = scopedCandidates.filter(
    (template) =>
      normaliseCountry(template.country) === normalisedScopeCountry &&
      template.region === null &&
      template.customer_segment === null &&
      template.campaign_type === null,
  );
  const defaultCandidates = scopedCandidates.filter(
    (template) => template.is_default && normaliseCountry(template.country) === null,
  );

  const selectedCandidates = exactCandidates.length > 0
    ? exactCandidates
    : countryCandidates.length > 0
      ? countryCandidates
      : defaultCandidates.length > 0
        ? defaultCandidates
        : scopedCandidates.filter((template) => template.is_default);

  // selectedCandidates already passed matchesScope; the is_default check is kept
  // for sorting priority but must not silently drop non-default templates.
  const activeCandidates = sortCandidates(
    selectedCandidates.filter((template) => template.is_default || matchesScope(template, scope)),
  );

  if (!activeCandidates.length) {
    return { template: null, error: createTemplateResolutionError("No applicable pricing template is available.") };
  }

  if (activeCandidates.length > 1) {
    // Multiple candidates at the same precedence level.
    // sortCandidates already places is_default=true first; pick the winner
    // rather than blocking the customer with an enterprise-review response.
    // A configuration warning is logged but not surfaced to the customer.
    const winner = activeCandidates[0];
    console.warn(
      `[pricing] Multiple candidates for product=${scope.product_key} country=${scope.country} ` +
      `currency=${scope.currency}: selected ${winner.id} (${winner.name}). ` +
      `Admin should deactivate duplicate templates.`,
    );
    return { template: winner };
  }

  return { template: activeCandidates[0] };
}

export async function getPricingTemplateById(templateId: string): Promise<PricingTemplate | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("commercial_pricing_templates")
    .select("*, commercial_pricing_tiers(*)")
    .eq("id", templateId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return normalizeTemplateRecord({ ...data, tiers: Array.isArray(data.commercial_pricing_tiers) ? (data.commercial_pricing_tiers as Record<string, unknown>[]).map(normalizeTierRecord) : [] });
}

export async function createPricingSnapshot(input: {
  onboardingDraftId?: string | null;
  organisationId?: string | null;
  productKey: string;
  template: PricingTemplate;
  pricingResult: PricingCalculationResult;
  market?: string | null;
}): Promise<PricingSnapshot> {
  const supabase = createAdminSupabase();
  const payload = {
    onboarding_draft_id: input.onboardingDraftId ?? null,
    organisation_id: input.organisationId ?? null,
    product_key: input.productKey,
    pricing_template_id: input.template.id,
    pricing_template_name: input.template.name,
    template_version: input.template.updated_at,
    market: input.market ?? input.template.country ?? null,
    currency: input.pricingResult.currency,
    pricing_metric: input.pricingResult.pricing_metric,
    pricing_method: input.pricingResult.pricing_method,
    quantity: input.pricingResult.quantity,
    tier_breakdown: input.pricingResult.tier_breakdown,
    subtotal: input.pricingResult.subtotal,
    discount: input.pricingResult.discount,
    tax: input.pricingResult.tax,
    total: input.pricingResult.total,
    included_admin_users: input.pricingResult.included_admin_users,
    requires_enterprise_review: input.pricingResult.requires_enterprise_review,
    calculated_at: input.pricingResult.calculated_at,
    expires_at: input.pricingResult.quotation_expiry,
    status: "calculated"
  };

  const { data, error } = await supabase.from("commercial_pricing_snapshots").insert(payload).select().single();
  if (error) throw error;

  if (input.onboardingDraftId) {
    await supabase.from("onboarding_drafts").update({ pricing_snapshot_id: data.id }).eq("id", input.onboardingDraftId);
    await supabase.from("commercial_pricing_snapshots").update({ status: "superseded" }).eq("onboarding_draft_id", input.onboardingDraftId).neq("id", data.id);
  }

  return {
    id: data.id,
    onboarding_draft_id: data.onboarding_draft_id,
    organisation_id: data.organisation_id,
    product_key: data.product_key,
    pricing_template_id: data.pricing_template_id,
    pricing_template_name: data.pricing_template_name,
    template_version: data.template_version,
    market: data.market,
    currency: data.currency,
    pricing_metric: data.pricing_metric,
    pricing_method: data.pricing_method,
    quantity: data.quantity,
    tier_breakdown: data.tier_breakdown,
    subtotal: data.subtotal,
    discount: data.discount,
    tax: data.tax,
    total: data.total,
    included_admin_users: data.included_admin_users,
    requires_enterprise_review: data.requires_enterprise_review,
    calculated_at: data.calculated_at,
    expires_at: data.expires_at,
    status: data.status,
    created_at: data.created_at,
    updated_at: data.updated_at
  };
}

export const buildPricingTemplatePayload = buildPricingTemplatePayloadFromModule;

export async function listPricingTemplates(): Promise<PricingTemplate[]> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("commercial_pricing_templates").select("*, commercial_pricing_tiers(*)").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((record) => normalizeTemplateRecord({ ...record, tiers: Array.isArray(record.commercial_pricing_tiers) ? (record.commercial_pricing_tiers as Record<string, unknown>[]).map(normalizeTierRecord) : [] }));
}

function buildSyntheticTemplateForValidation(
  payload: ReturnType<typeof buildPricingTemplatePayload>,
  templateId: string | null
): PricingTemplate {
  const now = new Date().toISOString();
  return {
    id: templateId,
    product_key: payload.product_key,
    name: payload.name,
    description: payload.description,
    currency: payload.currency,
    country: payload.country,
    region: payload.region,
    customer_segment: payload.customer_segment,
    campaign_type: payload.campaign_type,
    pricing_metric: payload.pricing_metric as PricingTemplate["pricing_metric"],
    pricing_method: payload.pricing_method as PricingTemplate["pricing_method"],
    status: payload.status as PricingTemplateStatus,
    is_default: payload.is_default,
    effective_from: payload.effective_from,
    effective_to: payload.effective_to,
    quotation_validity_days: payload.quotation_validity_days,
    commercial_model: (payload as Record<string, unknown>).commercial_model as string | null ?? null,
    billing_behaviour: (payload as Record<string, unknown>).billing_behaviour as string | null ?? null,
    renewal_required: ((payload as Record<string, unknown>).renewal_required as boolean | null) ?? false,
    allowed_payment_methods: ((payload as Record<string, unknown>).allowed_payment_methods as string[] | null) ?? null,
    created_by: null,
    updated_by: null,
    activated_by: null,
    activated_at: null,
    deactivated_by: null,
    deactivated_at: null,
    archived_by: null,
    created_at: now,
    updated_at: now,
    archived_at: null,
    tiers: payload.tiers.map((tier) => ({
      id: null,
      pricing_template_id: templateId,
      sequence: tier.sequence,
      minimum_quantity: tier.minimum_quantity,
      maximum_quantity: tier.maximum_quantity,
      unit_price: tier.unit_price,
      fixed_charge: tier.fixed_charge,
      calculation_type: "progressive" as const,
      enterprise_action: tier.enterprise_action as PricingEnterpriseAction,
      status: tier.status as PricingTierStatus
    }))
  };
}

function tiersStructurallyEqual(
  payloadTiers: ReturnType<typeof buildPricingTemplatePayload>["tiers"],
  existingTiers: PricingTier[]
): boolean {
  const activeExisting = existingTiers.filter((t) => t.status === "active");
  if (payloadTiers.length !== activeExisting.length) return false;
  const sortedPayload = [...payloadTiers].sort((a, b) => a.sequence - b.sequence);
  const sortedExisting = [...activeExisting].sort((a, b) => a.sequence - b.sequence);
  return sortedPayload.every((pt, i) => {
    const et = sortedExisting[i];
    return (
      pt.sequence === et.sequence &&
      pt.minimum_quantity === et.minimum_quantity &&
      pt.maximum_quantity === et.maximum_quantity &&
      pt.unit_price === et.unit_price &&
      pt.enterprise_action === et.enterprise_action
    );
  });
}

async function checkDefaultConflict(
  supabase: ReturnType<typeof createAdminSupabase>,
  scope: { product_key: string; currency: string; country: string | null; region: string | null; customer_segment: string | null; campaign_type: string | null },
  excludeTemplateId: string | null
): Promise<void> {
  let query = supabase
    .from("commercial_pricing_templates")
    .select("id, name")
    .eq("product_key", scope.product_key)
    .eq("currency", scope.currency)
    .eq("status", "active")
    .eq("is_default", true)
    .is("archived_at", null);

  if (scope.country !== null) {
    query = query.eq("country", scope.country);
  } else {
    query = query.is("country", null);
  }
  if (scope.region !== null) {
    query = query.eq("region", scope.region);
  } else {
    query = query.is("region", null);
  }
  if (scope.customer_segment !== null) {
    query = query.eq("customer_segment", scope.customer_segment);
  } else {
    query = query.is("customer_segment", null);
  }
  if (scope.campaign_type !== null) {
    query = query.eq("campaign_type", scope.campaign_type);
  } else {
    query = query.is("campaign_type", null);
  }
  if (excludeTemplateId) {
    query = query.neq("id", excludeTemplateId);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (data && data.length > 0) {
    const existing = data[0] as { id: string; name: string };
    throw new Error(`A default template already exists for this scope: "${existing.name}". Deactivate it first or unset is_default.`);
  }
}

export async function createOrUpdatePricingTemplate(input: {
  templateId?: string | null;
  userId?: string | null;
  payload: ReturnType<typeof buildPricingTemplatePayload>;
}): Promise<PricingTemplate> {
  const supabase = createAdminSupabase();
  const now = new Date().toISOString();

  // Validate tier configuration before any DB write
  const synthetic = buildSyntheticTemplateForValidation(input.payload, input.templateId ?? null);
  const validation = validatePricingTemplate(synthetic);
  if (!validation.isValid) {
    throw new Error(validation.errors[0]?.message ?? "Invalid pricing configuration.");
  }

  // Guard structural edits on active templates
  if (input.templateId) {
    const current = await getPricingTemplateById(input.templateId);
    if (!current) throw new Error("Pricing template not found.");
    if (current.status === "active") {
      const methodChanged = input.payload.pricing_method !== current.pricing_method;
      const metricChanged = input.payload.pricing_metric !== current.pricing_metric;
      const tiersChanged = !tiersStructurallyEqual(input.payload.tiers, current.tiers);
      if (methodChanged || metricChanged || tiersChanged) {
        throw new Error("Active templates cannot be structurally edited. Clone or deactivate the template first.");
      }
    }
  }

  // Default conflict protection
  if (input.payload.is_default && input.payload.status === "active") {
    await checkDefaultConflict(supabase, {
      product_key: input.payload.product_key,
      currency: input.payload.currency,
      country: input.payload.country,
      region: input.payload.region,
      customer_segment: input.payload.customer_segment,
      campaign_type: input.payload.campaign_type
    }, input.templateId ?? null);
  }

  const templatePayload = {
    product_key: input.payload.product_key,
    name: input.payload.name,
    description: input.payload.description,
    currency: input.payload.currency,
    country: input.payload.country,
    region: input.payload.region,
    customer_segment: input.payload.customer_segment,
    campaign_type: input.payload.campaign_type,
    pricing_metric: input.payload.pricing_metric,
    pricing_method: input.payload.pricing_method,
    status: input.payload.status,
    is_default: input.payload.is_default,
    effective_from: input.payload.effective_from,
    effective_to: input.payload.effective_to,
    quotation_validity_days: input.payload.quotation_validity_days,
    updated_by: input.userId ?? null,
    updated_at: now
  };

  let templateRecord: Record<string, unknown> | null = null;
  if (input.templateId) {
    const { data, error } = await supabase.from("commercial_pricing_templates").update(templatePayload).eq("id", input.templateId).select().single();
    if (error) throw error;
    templateRecord = data;
  } else {
    const { data, error } = await supabase.from("commercial_pricing_templates").insert({ ...templatePayload, created_by: input.userId ?? null, created_at: now }).select().single();
    if (error) throw error;
    templateRecord = data;
  }

  if (!templateRecord?.id) throw new Error("Pricing template could not be created.");

  const existingTiers = await supabase.from("commercial_pricing_tiers").select("id").eq("pricing_template_id", templateRecord.id);
  if (existingTiers.error) throw existingTiers.error;

  const tierRows = (existingTiers.data ?? []).map((row) => row.id);
  if (tierRows.length > 0) {
    const { error } = await supabase.from("commercial_pricing_tiers").delete().in("id", tierRows);
    if (error) throw error;
  }

  const insertedTiers = await supabase.from("commercial_pricing_tiers").insert(input.payload.tiers.map((tier) => ({
    pricing_template_id: templateRecord.id,
    sequence: tier.sequence,
    minimum_quantity: tier.minimum_quantity,
    maximum_quantity: tier.maximum_quantity,
    unit_price: tier.unit_price,
    fixed_charge: tier.fixed_charge,
    enterprise_action: tier.enterprise_action,
    status: tier.status,
    created_at: now,
    updated_at: now
  }))).select();
  if (insertedTiers.error) throw insertedTiers.error;

  const createdTemplate = await getPricingTemplateById(String(templateRecord.id));
  if (!createdTemplate) throw new Error("Pricing template could not be loaded after save.");
  return createdTemplate;
}

export async function activateTemplate(templateId: string, userId: string | null): Promise<PricingTemplate> {
  const template = await getPricingTemplateById(templateId);
  if (!template) throw new Error("Pricing template not found.");
  if (template.status === "archived" || template.archived_at !== null) {
    throw new Error("Archived templates cannot be activated.");
  }
  const validation = validatePricingTemplate(template);
  if (!validation.isValid) {
    throw new Error(validation.errors[0]?.message ?? "Template is invalid and cannot be activated.");
  }
  const supabase = createAdminSupabase();
  const now = new Date().toISOString();
  if (template.is_default) {
    await checkDefaultConflict(supabase, {
      product_key: template.product_key,
      currency: template.currency,
      country: template.country,
      region: template.region,
      customer_segment: template.customer_segment,
      campaign_type: template.campaign_type
    }, templateId);
  }
  const { error } = await supabase
    .from("commercial_pricing_templates")
    .update({ status: "active", activated_by: userId, activated_at: now, updated_by: userId, updated_at: now })
    .eq("id", templateId);
  if (error) throw error;
  const updated = await getPricingTemplateById(templateId);
  if (!updated) throw new Error("Pricing template could not be reloaded after activation.");
  return updated;
}

export async function deactivateTemplate(templateId: string, userId: string | null): Promise<PricingTemplate> {
  const template = await getPricingTemplateById(templateId);
  if (!template) throw new Error("Pricing template not found.");
  if (template.status === "archived") {
    throw new Error("Archived templates cannot be deactivated.");
  }
  const supabase = createAdminSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("commercial_pricing_templates")
    .update({ status: "inactive", deactivated_by: userId, deactivated_at: now, updated_by: userId, updated_at: now })
    .eq("id", templateId);
  if (error) throw error;
  const updated = await getPricingTemplateById(templateId);
  if (!updated) throw new Error("Pricing template could not be reloaded after deactivation.");
  return updated;
}

export async function archiveTemplate(templateId: string, userId: string | null): Promise<PricingTemplate> {
  const template = await getPricingTemplateById(templateId);
  if (!template) throw new Error("Pricing template not found.");
  if (template.status === "active") {
    throw new Error("Active templates cannot be archived directly. Deactivate the template first.");
  }
  if (template.status === "archived" || template.archived_at !== null) {
    throw new Error("Template is already archived.");
  }
  const supabase = createAdminSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("commercial_pricing_templates")
    .update({ status: "archived", archived_by: userId, archived_at: now, updated_by: userId, updated_at: now })
    .eq("id", templateId);
  if (error) throw error;
  const updated = await getPricingTemplateById(templateId);
  if (!updated) throw new Error("Pricing template could not be reloaded after archiving.");
  return updated;
}

export async function cloneTemplate(
  templateId: string,
  userId: string | null,
  destinationProductKey?: string | null
): Promise<PricingTemplate> {
  const source = await getPricingTemplateById(templateId);
  if (!source) throw new Error("Pricing template not found.");
  const supabase = createAdminSupabase();
  const now = new Date().toISOString();
  const { data: cloneData, error: cloneError } = await supabase
    .from("commercial_pricing_templates")
    .insert(buildClonedTemplateInsert(source, userId, now, destinationProductKey))
    .select()
    .single();
  if (cloneError) throw cloneError;
  if (!cloneData?.id) throw new Error("Cloned template could not be created.");

  if (source.tiers.length > 0) {
    const { error: tierError } = await supabase.from("commercial_pricing_tiers").insert(
      source.tiers.map((tier) => ({
        pricing_template_id: cloneData.id,
        sequence: tier.sequence,
        minimum_quantity: tier.minimum_quantity,
        maximum_quantity: tier.maximum_quantity,
        unit_price: tier.unit_price,
        fixed_charge: tier.fixed_charge,
        enterprise_action: tier.enterprise_action,
        status: tier.status,
        created_at: now,
        updated_at: now
      }))
    );
    if (tierError) throw tierError;
  }

  const cloned = await getPricingTemplateById(String(cloneData.id));
  if (!cloned) throw new Error("Cloned template could not be reloaded after creation.");
  return cloned;
}

export function getDefaultRetailPricingTemplate(): PricingTemplate {
  throw new Error("Retail pricing templates must be resolved from the database.");
}
