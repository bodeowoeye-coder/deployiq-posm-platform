import { createAdminSupabase } from "../../supabaseAdmin";
import type {
  EnterpriseReviewResult,
  PricingCalculationRequest,
  PricingCalculationResult,
  PricingScope,
  PricingSnapshot,
  PricingTemplate,
  PricingTemplateStatus,
  PricingTier,
  PricingTierBreakdown,
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

function parseDateString(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  return null;
}

function normalizeTemplateRecord(record: Record<string, unknown>): PricingTemplate {
  const tiers = Array.isArray(record.tiers) ? (record.tiers as Record<string, unknown>[]).map(normalizeTierRecord) : [];
  return {
    id: toStringOrNull(record.id),
    product_key: String(record.product_key ?? ""),
    name: String(record.name ?? ""),
    description: toStringOrNull(record.description),
    currency: String(record.currency ?? ""),
    country: toStringOrNull(record.country),
    region: toStringOrNull(record.region),
    customer_segment: toStringOrNull(record.customer_segment),
    campaign_type: toStringOrNull(record.campaign_type),
    pricing_metric: String(record.pricing_metric ?? "deployment_location") as PricingTemplate["pricing_metric"],
    pricing_method: String(record.pricing_method ?? "progressive_tiered") as PricingTemplate["pricing_method"],
    status: String(record.status ?? "draft") as PricingTemplateStatus,
    is_default: Boolean(record.is_default),
    effective_from: parseDateString(record.effective_from),
    effective_to: parseDateString(record.effective_to),
    quotation_validity_days: toNumber(record.quotation_validity_days),
    created_by: toStringOrNull(record.created_by),
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
  const countryMatches = template.country === null || template.country === scope.country;
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

export function validatePricingTemplate(template: PricingTemplate): { isValid: boolean; errors: PricingValidationError[]; activeTiers: PricingTier[] } {
  const errors: PricingValidationError[] = [];
  const activeTiers = template.tiers.filter((tier) => tier.status === "active").sort((left, right) => left.sequence - right.sequence);

  if (!activeTiers.length) {
    errors.push({ code: "invalid_configuration", message: "The pricing template must contain at least one active tier." });
    return { isValid: false, errors, activeTiers: [] };
  }

  const seenSequences = new Set<number>();
  let previousTier: PricingTier | null = null;

  activeTiers.forEach((tier) => {
    if (!Number.isInteger(tier.sequence) || tier.sequence <= 0) {
      errors.push({ code: "invalid_configuration", message: `Tier ${tier.sequence ?? "unknown"} has an invalid sequence.` });
    }
    if (seenSequences.has(tier.sequence)) {
      errors.push({ code: "invalid_configuration", message: `Duplicate tier sequence ${tier.sequence}.` });
    }
    seenSequences.add(tier.sequence);

    if (tier.minimum_quantity <= 0) {
      errors.push({ code: "invalid_configuration", message: `Tier ${tier.sequence} must have a positive minimum quantity.` });
    }
    if (tier.maximum_quantity !== null && tier.maximum_quantity < tier.minimum_quantity) {
      errors.push({ code: "invalid_configuration", message: `Tier ${tier.sequence} has an invalid maximum quantity.` });
    }
    if (tier.unit_price < 0) {
      errors.push({ code: "invalid_configuration", message: `Tier ${tier.sequence} has a negative unit price.` });
    }
    if ((tier.fixed_charge ?? 0) < 0) {
      errors.push({ code: "invalid_configuration", message: `Tier ${tier.sequence} has a negative fixed charge.` });
    }

    if (previousTier) {
      if (previousTier.maximum_quantity !== null && tier.minimum_quantity <= previousTier.maximum_quantity) {
        errors.push({ code: "invalid_configuration", message: `Tier ${tier.sequence} overlaps the previous tier range.` });
      }
      if (previousTier.maximum_quantity === null) {
        errors.push({ code: "invalid_configuration", message: "An open-ended tier must be the final active tier." });
      }
      if (previousTier.maximum_quantity !== null && tier.minimum_quantity !== previousTier.maximum_quantity + 1) {
        errors.push({ code: "invalid_configuration", message: `Tier ${tier.sequence} is not continuous with the previous tier.` });
      }
    } else if (tier.minimum_quantity !== 1) {
      errors.push({ code: "invalid_configuration", message: "The first tier must start at quantity 1." });
    }

    if (tier.maximum_quantity === null && !activeTiers.every((entry) => entry.sequence === tier.sequence || entry.maximum_quantity !== null)) {
      errors.push({ code: "invalid_configuration", message: "The final open-ended tier must be the last active tier." });
    }

    if (tier.maximum_quantity === null && tier.enterprise_action === null) {
      errors.push({ code: "invalid_configuration", message: `Tier ${tier.sequence} requires an enterprise action for open-ended coverage.` });
    }

    previousTier = tier;
  });

  return { isValid: errors.length === 0, errors, activeTiers };
}

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

  const resolvedTiers = activeTiers.sort((left, right) => left.sequence - right.sequence);
  let remaining = normalizedQuantity;
  let subtotal = 0;
  const tierBreakdown: PricingTierBreakdown[] = [];
  let currentMinimum = 1;

  resolvedTiers.forEach((tier) => {
    if (remaining <= 0) return;

    const tierStart = Math.max(currentMinimum, tier.minimum_quantity);
    const tierEnd = tier.maximum_quantity === null ? normalizedQuantity : Math.min(normalizedQuantity, tier.maximum_quantity);
    if (tierEnd < tierStart) return;

    const applicableQuantity = Math.min(remaining, Math.max(0, tierEnd - tierStart + 1));
    if (applicableQuantity <= 0) return;

    const tierSubtotal = applicableQuantity * tier.unit_price;
    subtotal += tierSubtotal;
    tierBreakdown.push({
      sequence: tier.sequence,
      minimum_quantity: tier.minimum_quantity,
      maximum_quantity: tier.maximum_quantity,
      applicable_quantity: applicableQuantity,
      unit_price: tier.unit_price,
      fixed_charge: tier.fixed_charge ?? 0,
      subtotal: tierSubtotal,
      enterprise_action: tier.enterprise_action,
      label: `Tier ${tier.sequence}`
    });
    remaining -= applicableQuantity;
    currentMinimum = (tier.maximum_quantity ?? normalizedQuantity) + 1;
  });

  const requiresEnterpriseReview = normalizedQuantity > 50000;
  const quotationExpiry = template.quotation_validity_days ? new Date(Date.now() + template.quotation_validity_days * 24 * 60 * 60 * 1000).toISOString() : null;

  return {
    pricing_template_id: template.id,
    pricing_template_name: template.name,
    product_key: template.product_key,
    country: template.country,
    currency: template.currency,
    pricing_metric: template.pricing_metric,
    pricing_method: template.pricing_method,
    quantity: normalizedQuantity,
    tier_breakdown: tierBreakdown,
    subtotal,
    discount: 0,
    tax: 0,
    total: requiresEnterpriseReview ? 0 : subtotal,
    included_admin_users: calculateAdministrativeUsers(normalizedQuantity),
    quotation_status: requiresEnterpriseReview ? "request_quotation" : "calculated",
    quotation_expiry: quotationExpiry,
    requires_enterprise_review: requiresEnterpriseReview,
    calculated_at: new Date().toISOString(),
    enterprise_action: requiresEnterpriseReview ? "request_quotation" : null
  };
}

export async function resolveApplicablePricingTemplate(request: PricingCalculationRequest): Promise<{ template: PricingTemplate | null; error?: PricingValidationError }> {
  const supabase = createAdminSupabase();
  const scope = createScopeFromRequest(request);
  const calculationDate = request.calculationDate ?? new Date().toISOString();

  const { data, error } = await supabase
    .from("commercial_pricing_templates")
    .select("*, commercial_pricing_tiers(*)")
    .eq("product_key", request.productKey)
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
    .filter((template) => template.status === "active" && !template.archived_at && template.product_key === request.productKey && template.currency === (request.currency ?? "NGN") && isWithinEffectiveWindow(template, calculationDate));

  const scopedCandidates = candidates.filter((template) => matchesScope(template, scope));
  const exactCandidates = scopedCandidates.filter((template) => template.country === scope.country && template.region === scope.region && template.customer_segment === scope.customer_segment && template.campaign_type === scope.campaign_type);
  const countryCandidates = scopedCandidates.filter((template) => template.country === scope.country && template.region === null && template.customer_segment === null && template.campaign_type === null);
  const defaultCandidates = scopedCandidates.filter((template) => template.is_default && template.country === null);

  const selectedCandidates = exactCandidates.length > 0
    ? exactCandidates
    : countryCandidates.length > 0
      ? countryCandidates
      : defaultCandidates.length > 0
        ? defaultCandidates
        : scopedCandidates.filter((template) => template.is_default);

  const activeCandidates = sortCandidates(selectedCandidates.filter((template) => template.is_default || matchesScope(template, scope)));

  if (!activeCandidates.length) {
    return { template: null, error: createTemplateResolutionError("No applicable pricing template is available.") };
  }

  if (activeCandidates.length > 1) {
    return { template: null, error: { code: "configuration_conflict", message: "Multiple applicable pricing templates were found.", details: {} } };
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

export async function listPricingTemplates(): Promise<PricingTemplate[]> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("commercial_pricing_templates").select("*, commercial_pricing_tiers(*)").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((record) => normalizeTemplateRecord({ ...record, tiers: Array.isArray(record.commercial_pricing_tiers) ? (record.commercial_pricing_tiers as Record<string, unknown>[]).map(normalizeTierRecord) : [] }));
}

export function getDefaultRetailPricingTemplate(): PricingTemplate {
  throw new Error("Retail pricing templates must be resolved from the database.");
}
