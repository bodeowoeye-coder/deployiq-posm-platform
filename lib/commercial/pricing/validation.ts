import type { PricingTemplate, PricingTier, PricingValidationError } from "./types";

export function validatePricingTemplate(template: PricingTemplate): { isValid: boolean; errors: PricingValidationError[]; activeTiers: PricingTier[] } {
  const errors: PricingValidationError[] = [];
  const validPricingMethods: string[] = ["progressive_tiered"];
  const validPricingMetrics: string[] = ["deployment_location"];

  if (!validPricingMethods.includes(template.pricing_method)) {
    errors.push({ code: "invalid_configuration", message: `Unsupported pricing method: "${template.pricing_method}".` });
  }
  if (!validPricingMetrics.includes(template.pricing_metric)) {
    errors.push({ code: "invalid_configuration", message: `Unsupported pricing metric: "${template.pricing_metric}".` });
  }
  if (errors.length > 0) return { isValid: false, errors, activeTiers: [] };

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
