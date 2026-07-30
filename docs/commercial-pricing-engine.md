# Commercial Pricing Engine

## Overview

The commercial pricing engine now resolves pricing templates from Supabase rather than relying on hardcoded Retail rates in application code.

## Database tables

- commercial_pricing_templates: stores pricing templates and template scope.
- commercial_pricing_tiers: stores active pricing tiers for each template.
- commercial_pricing_snapshots: stores immutable pricing calculations linked to onboarding drafts or organisations.

## Template resolution order

1. Exact product, currency, country, region, segment, and campaign-type match.
2. Exact product, currency, and country match with fewer optional restrictions.
3. Product, currency, and country default.
4. Product and currency global default when country is null.

Only active, non-archived, unexpired templates are considered.

## Progressive calculation

The engine applies each tier only to the quantity covered by that tier range. The final open-ended tier is treated as a request-for-quotation trigger for quantities above 50,000.

## Administrative users

Retail uses the rule of 5 administrators per 1,000 deployment locations with a minimum of 3.

## Snapshot immutability

Snapshots preserve the calculation result at the time of creation. Templates can change later without mutating the historical snapshot record.

## API shape

The onboarding pricing API accepts a minimum context and returns the calculated result plus a pricing snapshot.

## Seed template

The initial Retail template is seeded by migration and uses NGN progressive tiers for deployment locations.
