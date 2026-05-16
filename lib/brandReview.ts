import type { AiExtraction } from "@/lib/types";

export type BrandMatchStatus = "Matched" | "Mismatch" | "Uncertain";

type BrandCandidate = {
  brand_name: string;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function reviewBrandMatch(selectedBrand: string | null, extraction: AiExtraction, brands: BrandCandidate[]) {
  const candidates = brands.map((brand) => ({
    original: brand.brand_name,
    normalized: normalize(brand.brand_name)
  }));
  const extractedBrand = normalize(extraction.brandName);
  const visibleText = normalize(`${extraction.brandName} ${extraction.visibleText}`);
  const detectedCandidates = candidates.filter(
    (candidate) =>
      (extractedBrand && candidate.normalized === extractedBrand) ||
      (candidate.normalized && visibleText.includes(candidate.normalized))
  );
  const detectedBrandName = detectedCandidates.length === 1 ? detectedCandidates[0].original : null;

  if (!detectedBrandName) {
    return {
      detectedBrandName: null,
      brandMatchStatus: "Uncertain" as BrandMatchStatus,
      mismatchReason: null,
      aiReviewNote:
        detectedCandidates.length > 1
          ? `AI found multiple possible brands in the image: ${detectedCandidates.map((candidate) => candidate.original).join(", ")}.`
          : "AI could not confidently identify a known brand from the image text."
    };
  }

  if (!selectedBrand) {
    return {
      detectedBrandName,
      brandMatchStatus: "Uncertain" as BrandMatchStatus,
      mismatchReason: "No brand was selected by the installer.",
      aiReviewNote: `AI detected ${detectedBrandName}, but no installer-selected brand was provided.`
    };
  }

  if (normalize(selectedBrand) === normalize(detectedBrandName)) {
    return {
      detectedBrandName,
      brandMatchStatus: "Matched" as BrandMatchStatus,
      mismatchReason: null,
      aiReviewNote: `Installer-selected brand matches AI-detected brand: ${detectedBrandName}.`
    };
  }

  return {
    detectedBrandName,
    brandMatchStatus: "Mismatch" as BrandMatchStatus,
    mismatchReason: `Installer selected ${selectedBrand}, but AI detected ${detectedBrandName}.`,
    aiReviewNote: `Review recommended: selected brand ${selectedBrand} differs from AI-detected brand ${detectedBrandName}.`
  };
}
