import { createHash } from "crypto";
import type { Submission } from "@/lib/types";

export function fingerprintImage(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeText(value: string | null | undefined) {
  return new Set((value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function textSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

export function detectDuplicate(
  candidate: {
    installerName: string | null;
    brandName: string | null;
    latitude: number | null;
    longitude: number | null;
    ocrText: string | null;
    imageFingerprint: string;
  },
  recent: Submission[]
) {
  const exactImage = recent.find((item) => item.image_fingerprint && item.image_fingerprint === candidate.imageFingerprint);
  if (exactImage) {
    return {
      status: "Duplicate" as const,
      reason: "Exact image fingerprint matches a recent submission."
    };
  }

  for (const item of recent) {
    const sameBrand = Boolean(candidate.brandName && item.brand_name === candidate.brandName);
    const sameInstaller = Boolean(candidate.installerName && item.installer_name === candidate.installerName);
    const hasCoordinates =
      candidate.latitude !== null &&
      candidate.longitude !== null &&
      item.gps_latitude !== null &&
      item.gps_longitude !== null;
    const nearby = hasCoordinates
      ? distanceMeters(candidate.latitude!, candidate.longitude!, item.gps_latitude!, item.gps_longitude!) <= 60
      : false;
    const similarText = textSimilarity(candidate.ocrText, item.ocr_text ?? item.ai_raw_text) >= 0.55;

    if (sameBrand && nearby && similarText) {
      return {
        status: "Possible Duplicate" as const,
        reason: "Same brand, nearby GPS, and similar OCR text were submitted recently."
      };
    }

    if (sameBrand && sameInstaller && nearby) {
      return {
        status: "Possible Duplicate" as const,
        reason: "Same installer submitted the same brand at a nearby location recently."
      };
    }
  }

  return {
    status: "Unique" as const,
    reason: null
  };
}
