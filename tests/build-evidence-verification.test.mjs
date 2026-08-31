import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  BUILD_EVIDENCE_SIGNATURE_MAX_BYTES,
  BUILD_EVIDENCE_STORAGE_TIMEOUT_MS,
  BuildEvidenceVerificationError,
  fetchBuildEvidenceSignature,
} from "../lib/build/runtime/evidenceVerification.ts";

function response(bytes, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-length")) headers.set("content-length", String(bytes.length));
  if (!headers.has("content-range")) headers.set("content-range", `bytes 0-${bytes.length - 1}/100`);
  return new Response(Uint8Array.from(bytes), { status: init.status ?? 206, headers });
}

async function rejectsVerification(run, pattern = /evidence/i) {
  await assert.rejects(run, (error) => error instanceof BuildEvidenceVerificationError && pattern.test(error.message));
}

test("valid bounded JPEG, MP4 and PDF signatures succeed", async () => {
  const fixtures = [
    ["image/jpeg", [0xff, 0xd8, 0xff]],
    ["video/mp4", [0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70]],
    ["application/pdf", [0x25, 0x50, 0x44, 0x46]],
  ];
  for (const [mimeType, bytes] of fixtures) {
    const result = await fetchBuildEvidenceSignature({ url: "https://storage.invalid/object", headers: {}, mimeType, fetchImpl: async () => response(bytes) });
    assert.deepEqual([...result], bytes);
  }
});

test("bounded verification uses arrayBuffer without a reader cancellation lifecycle", async () => {
  let arrayBufferCalls = 0;
  const base = response([0xff, 0xd8, 0xff]);
  const mocked = { status: base.status, headers: base.headers, arrayBuffer: async () => { arrayBufferCalls += 1; return base.arrayBuffer(); } };
  await fetchBuildEvidenceSignature({ url: "https://storage.invalid/object", headers: {}, mimeType: "image/jpeg", fetchImpl: async () => mocked });
  assert.equal(arrayBufferCalls, 1);
});

test("timeout aborts and fails closed", async () => {
  await rejectsVerification(() => fetchBuildEvidenceSignature({
    url: "https://storage.invalid/object", headers: {}, mimeType: "image/jpeg", timeoutMs: 10,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })),
  }), /timed out/);
});

test("full-object 200, oversized data, malformed range, truncation and invalid signatures fail closed", async () => {
  await rejectsVerification(() => fetchBuildEvidenceSignature({ url: "x", headers: {}, mimeType: "image/jpeg", fetchImpl: async () => response([0xff, 0xd8, 0xff], { status: 200 }) }), /partial/);
  const oversized = Array(BUILD_EVIDENCE_SIGNATURE_MAX_BYTES + 1).fill(0xff);
  await rejectsVerification(() => fetchBuildEvidenceSignature({ url: "x", headers: {}, mimeType: "image/jpeg", fetchImpl: async () => response(oversized) }), /exceeds/);
  await rejectsVerification(() => fetchBuildEvidenceSignature({ url: "x", headers: {}, mimeType: "image/jpeg", fetchImpl: async () => response([0xff, 0xd8, 0xff], { headers: { "content-range": "not-a-range" } }) }), /range/);
  await rejectsVerification(() => fetchBuildEvidenceSignature({ url: "x", headers: {}, mimeType: "image/png", fetchImpl: async () => response([137, 80]) }), /incomplete/);
  await rejectsVerification(() => fetchBuildEvidenceSignature({ url: "x", headers: {}, mimeType: "image/jpeg", fetchImpl: async () => response([1, 2, 3]) }), /signature/);
});

test("HTTP-level finalize-shaped request returns without a stream teardown stall", async (t) => {
  const server = createServer(async (request, reply) => {
    if (request.method !== "POST" || request.url !== "/evidence/finalize") {
      reply.writeHead(404).end(); return;
    }
    await fetchBuildEvidenceSignature({ url: "https://storage.invalid/object", headers: {}, mimeType: "image/jpeg", fetchImpl: async () => response([0xff, 0xd8, 0xff]) });
    reply.writeHead(200, { "content-type": "application/json" });
    reply.end(JSON.stringify({ id: "10000000-0000-4000-8000-000000000001" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  const result = await fetch(`http://127.0.0.1:${address.port}/evidence/finalize`, { method: "POST" });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { id: "10000000-0000-4000-8000-000000000001" });
  assert.equal(BUILD_EVIDENCE_STORAGE_TIMEOUT_MS, 10_000);
});
