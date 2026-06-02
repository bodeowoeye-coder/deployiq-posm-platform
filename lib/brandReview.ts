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
  const rawVisibleText = `${extraction.brandName} ${extraction.visibleText}`.trim();
  const selectedBrandMissingFromText = Boolean(selectedBrand && !visibleText.includes(normalize(selectedBrand)));
  const weakOcr = extraction.confidence === "low" || rawVisibleText.length < 8;
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
      mismatchReason: selectedBrand
        ? `Selected brand ${selectedBrand} was not confidently found in the image text.`
        : "No known brand was confidently found in the image text.",
      aiReviewNote:
        detectedCandidates.length > 1
          ? `AI found multiple possible brands in the image: ${detectedCandidates.map((candidate) => candidate.original).join(", ")}.`
          : weakOcr
            ? "Brand not confidently detected. OCR was weak, empty, or image quality may be poor."
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

  if (normalize(selectedBrand) === normalize(detectedBrandName) && (selectedBrandMissingFromText || weakOcr)) {
    return {
      detectedBrandName,
      brandMatchStatus: "Uncertain" as BrandMatchStatus,
      mismatchReason: `Selected brand ${selectedBrand} was detected, but not confidently enough for automatic approval.`,
      aiReviewNote: "Brand not confidently detected. Please review image quality, OCR text, and visible signage before approval."
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
    mismatchReason: selectedBrandMissingFromText
      ? `Installer selected ${selectedBrand}, but selected brand was not found clearly in OCR text. AI detected ${detectedBrandName}.`
      : `Installer selected ${selectedBrand}, but AI detected ${detectedBrandName}.`,
    aiReviewNote: weakOcr
      ? `Review recommended: brand detection is low confidence. Selected brand ${selectedBrand}; AI-detected brand ${detectedBrandName}.`
      : `Review recommended: selected brand ${selectedBrand} differs from AI-detected brand ${detectedBrandName}.`
  };
}
