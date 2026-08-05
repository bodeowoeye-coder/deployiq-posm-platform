/**
 * Deterministic country normalisation.
 *
 * Maps all known variants of a country identifier to a canonical
 * ISO 3166-1 alpha-2 code (uppercase, 2 letters).
 *
 * Purpose: The onboarding journey stores full names ("Nigeria") while
 * the Admin Pricing Studio accepts free text that may be "NG", "NGA",
 * or a lowercase variant. This normaliser makes all variants compare equal.
 *
 * No React, no database, no HTTP — fully testable with node --test.
 */

/** Canonical ISO 3166-1 alpha-2 codes used internally. */
export type CanonicalCountryCode = string;

/**
 * Maps every known country variant (case-insensitive) to its canonical
 * ISO 3166-1 alpha-2 code.
 *
 * Extend this map as new markets are added to the onboarding catalogue.
 */
const CANONICAL_MAP: Record<string, CanonicalCountryCode> = {
  // Nigeria
  "nigeria":       "NG",
  "ng":            "NG",
  "nga":           "NG",

  // Ghana
  "ghana":         "GH",
  "gh":            "GH",
  "gha":           "GH",

  // Kenya
  "kenya":         "KE",
  "ke":            "KE",
  "ken":           "KE",

  // South Africa
  "south africa":  "ZA",
  "za":            "ZA",
  "zaf":           "ZA",

  // United Kingdom
  "united kingdom": "GB",
  "uk":            "GB",
  "gb":            "GB",
  "gbr":           "GB",
  "great britain": "GB",

  // United States
  "united states": "US",
  "us":            "US",
  "usa":           "US",
};

/**
 * Normalise a country value to its canonical ISO alpha-2 code.
 *
 * - `null` / `undefined` / empty string → `null` (means "any country")
 * - Known variant (case-insensitive) → canonical ISO-2 code (e.g. "NG")
 * - Unknown value → trimmed original, lower-case (preserves unknown markets)
 *
 * @example
 * normaliseCountry("Nigeria") // "NG"
 * normaliseCountry("NG")      // "NG"
 * normaliseCountry("NGA")     // "NG"
 * normaliseCountry("nigeria") // "NG"
 * normaliseCountry(null)      // null
 * normaliseCountry("")        // null
 */
export function normaliseCountry(value: string | null | undefined): CanonicalCountryCode | null {
  if (!value || !value.trim()) return null;
  const key = value.trim().toLowerCase();
  return CANONICAL_MAP[key] ?? value.trim().toUpperCase();
}

/**
 * Return true when two country values refer to the same country after
 * normalisation, OR when either value represents "any country" (null).
 *
 * This is the canonical comparison to use anywhere a template country
 * is matched against a customer scope country.
 */
export function countriesMatch(
  templateCountry: string | null | undefined,
  scopeCountry: string | null | undefined,
): boolean {
  const tc = normaliseCountry(templateCountry);
  const sc = normaliseCountry(scopeCountry);
  // null on template side means "all countries"
  return tc === null || tc === sc;
}

/**
 * Map a country name or code to its default billing currency.
 * Accepts full names, ISO-2 or ISO-3 codes (case-insensitive).
 */
const CURRENCY_MAP: Record<CanonicalCountryCode, string> = {
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
  ZA: "ZAR",
  GB: "GBP",
  US: "USD",
};

export function currencyForNormalisedCountry(value: string | null | undefined): string {
  const code = normaliseCountry(value);
  return (code && CURRENCY_MAP[code]) ?? "NGN";
}
