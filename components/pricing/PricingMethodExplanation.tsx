"use client";

type Props = { pricingMethod?: string };

export function PricingMethodExplanation({ pricingMethod = "progressive_tiered" }: Props) {
  if (pricingMethod === "volume_tiered") {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Volume pricing</p>
          <p className="mt-1 text-sm text-slate-500 leading-relaxed">
            The full rollout is charged at the rate for the <strong className="text-slate-700">quantity band</strong> it qualifies for.
            Earlier bands are not charged separately.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Example</p>
          <p className="text-xs leading-relaxed text-slate-600">
            For 8,000 locations using bands 1–5,000 and 5,001–10,000 — the entire 8,000 is charged
            at the 5,001–10,000 rate. The 1–5,000 rate is not applied.
          </p>
        </div>
      </div>
    );
  }

  if (pricingMethod === "flat_rate") {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Flat-rate pricing</p>
          <p className="mt-1 text-sm text-slate-500 leading-relaxed">
            Every deployment location is charged at the <strong className="text-slate-700">same rate</strong>,
            regardless of rollout size.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Example</p>
          <p className="text-xs leading-relaxed text-slate-600">
            A flat rate of ₦475 per location. For 8,000 locations: 8,000 × ₦475 = ₦3,800,000.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">Progressive pricing</p>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">
          DeployIQ charges <strong className="text-slate-700">progressively</strong>. Each portion of
          the rollout is priced using the applicable band.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Example</p>
        <p className="text-xs leading-relaxed text-slate-600">
          For 8,000 locations with two bands — the first 5,000 are charged at Band 1
          pricing, and the remaining 3,000 at Band 2 pricing.
        </p>
      </div>
    </div>
  );
}
