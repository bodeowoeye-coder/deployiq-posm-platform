import type { AiConfidenceLevel, BrandMatchStatus } from "@/lib/types";

export function scoreBrandVerification(confidence: "low" | "medium" | "high", matchStatus: BrandMatchStatus) {
  const base = confidence === "high" ? 0.92 : confidence === "medium" ? 0.74 : 0.42;
  const score = matchStatus === "Uncertain" ? Math.min(base, 0.58) : base;
  const level: AiConfidenceLevel = score >= 0.85 ? "High" : score >= 0.6 ? "Medium" : "Low";

  return {
    score: Number(score.toFixed(2)),
    level
  };
}
