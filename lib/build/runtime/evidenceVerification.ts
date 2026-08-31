export const BUILD_EVIDENCE_SIGNATURE_RANGE_END = 15;
export const BUILD_EVIDENCE_SIGNATURE_MAX_BYTES = BUILD_EVIDENCE_SIGNATURE_RANGE_END + 1;
export const BUILD_EVIDENCE_STORAGE_TIMEOUT_MS = 10_000;

export class BuildEvidenceVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildEvidenceVerificationError";
  }
}

function minimumSignatureBytes(mimeType: string) {
  if (mimeType === "image/jpeg") return 3;
  if (mimeType === "image/png") return 8;
  if (mimeType === "image/webp") return 12;
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") return 8;
  if (mimeType === "video/webm" || mimeType === "application/pdf") return 4;
  if (mimeType.includes("openxmlformats")) return 2;
  if (mimeType === "text/plain") return 1;
  throw new BuildEvidenceVerificationError("The evidence MIME type is not supported.");
}

function boundedHeaderInteger(value: string | null, label: string) {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) throw new BuildEvidenceVerificationError(`The evidence ${label} is invalid.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > BUILD_EVIDENCE_SIGNATURE_MAX_BYTES) {
    throw new BuildEvidenceVerificationError(`The evidence ${label} exceeds the signature range.`);
  }
  return parsed;
}

export function validateBuildEvidenceSignatureResponse(response: Response, bytes: Uint8Array, mimeType: string) {
  if (response.status !== 206) {
    throw new BuildEvidenceVerificationError("The evidence signature request did not return a partial response.");
  }

  const contentLength = boundedHeaderInteger(response.headers.get("content-length"), "content length");
  const contentRange = response.headers.get("content-range");
  if (contentRange !== null) {
    const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(contentRange);
    if (!match) throw new BuildEvidenceVerificationError("The evidence content range is invalid.");
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start !== 0 || end < start || end > BUILD_EVIDENCE_SIGNATURE_RANGE_END) {
      throw new BuildEvidenceVerificationError("The evidence content range exceeds the signature range.");
    }
    if (contentLength !== null && end - start + 1 !== contentLength) {
      throw new BuildEvidenceVerificationError("The evidence range length is inconsistent.");
    }
  }

  if (bytes.length > BUILD_EVIDENCE_SIGNATURE_MAX_BYTES) {
    throw new BuildEvidenceVerificationError("The evidence response exceeds the signature range.");
  }
  if (contentLength !== null && bytes.length !== contentLength) {
    throw new BuildEvidenceVerificationError("The evidence response length is inconsistent.");
  }
  if (bytes.length < minimumSignatureBytes(mimeType)) {
    throw new BuildEvidenceVerificationError("The evidence signature response is incomplete.");
  }
}

export function assertBuildEvidenceSignature(mimeType: string, bytes: Uint8Array) {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  const matches = mimeType === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === "image/png" ? bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
      : mimeType === "image/webp" ? ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP"
        : ["video/mp4", "video/quicktime"].includes(mimeType) ? ascii(4, 4) === "ftyp"
          : mimeType === "video/webm" ? bytes.slice(0, 4).join(",") === "26,69,223,163"
            : mimeType === "application/pdf" ? ascii(0, 4) === "%PDF"
              : mimeType.includes("openxmlformats") ? bytes[0] === 0x50 && bytes[1] === 0x4b
                : mimeType === "text/plain";
  if (!matches) throw new BuildEvidenceVerificationError("The stored evidence signature does not match its declared type.");
}

export async function fetchBuildEvidenceSignature(params: {
  url: string;
  headers: Record<string, string>;
  mimeType: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? BUILD_EVIDENCE_STORAGE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (params.fetchImpl ?? fetch)(params.url, {
      headers: {
        ...params.headers,
        range: `bytes=0-${BUILD_EVIDENCE_SIGNATURE_RANGE_END}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    validateBuildEvidenceSignatureResponse(response, bytes, params.mimeType);
    assertBuildEvidenceSignature(params.mimeType, bytes);
    return bytes;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new BuildEvidenceVerificationError("Evidence signature verification timed out.");
    }
    if (error instanceof BuildEvidenceVerificationError) throw error;
    throw new BuildEvidenceVerificationError("Evidence signature verification failed.");
  } finally {
    clearTimeout(timer);
  }
}
