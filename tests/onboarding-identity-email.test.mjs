import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOnboardingAccountSetupEmail, buildOnboardingOtpEmail } from "../lib/acquisition/onboardingIdentityEmail.ts";
import { sendTransactionalEmail } from "../lib/transactionalEmail.ts";

function withEnvironment(values, run) {
  const previous = { ...process.env };
  Object.assign(process.env, values);
  return Promise.resolve(run()).finally(() => { process.env = previous; });
}

test("OTP template contains only the intended code, expiry and safety copy", () => {
  const email = buildOnboardingOtpEmail({ email: "owner@example.com", otp: "123456", expiresInMinutes: 10 });
  assert.equal(email.subject, "Verify your DeployIQ email");
  assert.match(email.body, /123456/);
  assert.match(email.body, /expires in 10 minutes/);
  assert.match(email.body, /ignore this email/);
  assert.doesNotMatch(email.body, /resume|access.token|refresh.token|password/i);
});

test("generated-password setup uses a one-time link instead of a plaintext password", () => {
  const email = buildOnboardingAccountSetupEmail({ email: "owner@example.com", setupLink: "https://auth.example.test/verify?token=opaque" });
  assert.match(email.body, /secure, one-time link/);
  assert.match(email.body, /token=opaque/);
  assert.doesNotMatch(email.body, /temporary password|DeployIQ-test-/i);
});

test("development email delivery remains simulated", async () => {
  await withEnvironment({ NODE_ENV: "test", VERCEL_ENV: "development", DEPLOYIQ_RUNTIME_ENV: "development" }, async () => {
    const result = await sendTransactionalEmail({ to: "owner@example.com", subject: "Test", body: "Body" });
    assert.deepEqual(result, { ok: true, deliveryMode: "development_simulated" });
  });
});

test("production delivery fails closed when provider configuration is missing", async () => {
  await withEnvironment({ NODE_ENV: "production", VERCEL_ENV: "production", DEPLOYIQ_TRANSACTIONAL_EMAIL_ENDPOINT: "", DEPLOYIQ_TRANSACTIONAL_EMAIL_TOKEN: "" }, async () => {
    const result = await sendTransactionalEmail({ to: "owner@example.com", subject: "Test", body: "Body" });
    assert.deepEqual(result, { ok: false, deliveryMode: "provider_missing", failureCode: "email_provider_not_configured" });
  });
});

test("production ZeptoMail maps the generic message to the official single-email request", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.zeptomail.com/v1.1/email");
    assert.equal(options.method, "POST");
    assert.match(options.headers.Authorization, /^Zoho-enczapikey \S+$/);
    assert.equal(options.headers.Accept, "application/json");
    assert.ok(options.signal instanceof AbortSignal);
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload, {
      from: { address: "notifications@deployiq.ng", name: "DeployIQ" },
      to: [{ email_address: { address: "owner@example.com" } }],
      subject: "Test",
      textbody: "Body",
    });
    assert.doesNotMatch(options.body, /opaque-test-token/);
    return { ok: true };
  };
  try {
    await withEnvironment({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_PROVIDER: "zeptomail",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_ENDPOINT: "https://api.zeptomail.com/v1.1/email",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_TOKEN: "opaque-test-token",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_FROM_ADDRESS: "notifications@deployiq.ng",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_FROM_NAME: "DeployIQ",
    }, async () => {
      const result = await sendTransactionalEmail({ to: "owner@example.com", subject: "Test", body: "Body" });
      assert.deepEqual(result, { ok: true, deliveryMode: "transactional_provider" });
    });
  } finally { globalThis.fetch = previousFetch; }
});

test("production OTP is accepted by ZeptoMail without persisting plaintext in the route", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.match(payload.textbody, /654321/);
    return { ok: true };
  };
  try {
    await withEnvironment({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_PROVIDER: "zeptomail",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_TOKEN: "opaque-test-token",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_FROM_ADDRESS: "notifications@deployiq.ng",
    }, async () => {
      const message = buildOnboardingOtpEmail({ email: "owner@example.com", otp: "654321", expiresInMinutes: 10 });
      assert.deepEqual(await sendTransactionalEmail(message), { ok: true, deliveryMode: "transactional_provider" });
    });
  } finally { globalThis.fetch = previousFetch; }
  const route = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
  assert.match(route, /otpHash/);
  assert.doesNotMatch(route, /draftData:\s*\{[^}]*\botp\s*[,}]/s);
});

test("ZeptoMail rejection is mapped to a bounded failure", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  try {
    await withEnvironment({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_PROVIDER: "zeptomail",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_TOKEN: "opaque-test-token",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_FROM_ADDRESS: "notifications@deployiq.ng",
    }, async () => {
      assert.deepEqual(await sendTransactionalEmail({ to: "owner@example.com", subject: "Test", body: "Body" }), {
        ok: false,
        deliveryMode: "transactional_provider",
        failureCode: "email_provider_rejected",
      });
    });
  } finally { globalThis.fetch = previousFetch; }
});

test("ZeptoMail timeout is mapped without leaking provider diagnostics", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const error = new Error("request timed out with secret provider details");
    error.name = "TimeoutError";
    throw error;
  };
  try {
    await withEnvironment({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_PROVIDER: "zeptomail",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_TOKEN: "opaque-test-token",
      DEPLOYIQ_TRANSACTIONAL_EMAIL_FROM_ADDRESS: "notifications@deployiq.ng",
    }, async () => {
      assert.deepEqual(await sendTransactionalEmail({ to: "owner@example.com", subject: "Test", body: "Body" }), {
        ok: false,
        deliveryMode: "transactional_provider",
        failureCode: "email_provider_timeout",
      });
    });
  } finally { globalThis.fetch = previousFetch; }
});

test("workspace-ready notifications continue through the shared provider abstraction", () => {
  const service = readFileSync(new URL("../lib/acquisition/provisioning/activationNotifications.ts", import.meta.url), "utf8");
  assert.match(service, /const delivery = await sendTransactionalEmail\(email\)/);
  assert.match(service, /failure_reason_safe: delivery\.failureCode/);
  assert.doesNotMatch(service, /api\.zeptomail\.com|Zoho-enczapikey/);
});

test("production OTP route records delivery before claiming sent and clears failed codes", () => {
  const route = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
  assert.match(route, /sendTransactionalEmail\(buildOnboardingOtpEmail/);
  assert.match(route, /code: "otp_delivery_failed"/);
  assert.match(route, /otpHash: null/);
  assert.match(route, /otpDeliveryStatus: "failed"/);
  assert.match(route, /otpDeliveryStatus: "sent"/);
  assert.match(route, /otpSentAt: sentAt/);
  assert.match(route, /debug_otp: otp/);
  assert.match(route, /const isDev = canUseDevelopmentCredentialDelivery\(\)/);
  assert.match(route, /process\.env\.NODE_ENV === "development"/);
  assert.doesNotMatch(route, /console\.(?:log|info|warn|error)\([^\n]*\botp\b/i);
});

test("resend supersedes the previous hash without creating another draft", () => {
  const route = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
  assert.match(route, /const otp = generateOTP\(\)/);
  assert.match(route, /otpHash,/);
  assert.match(route, /OTP_RESEND_COOLDOWN_SECONDS/);
  assert.doesNotMatch(route, /createOnboardingDraft|\.from\(["']onboarding_drafts["']\)\.insert/);
});

test("production identity handoff creates the account and sends a secure recovery link", () => {
  const route = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
  const setupPage = readFileSync(new URL("../app/login/create-password/page.tsx", import.meta.url), "utf8");
  assert.match(route, /createOrRestoreIdentityAccount/);
  assert.doesNotMatch(route, /canUseDevelopmentCredentialDelivery\(\) && adminEmail\s*\?\s*await createOrRestore/);
  assert.match(route, /generateIdentityPasswordSetupLink/);
  assert.match(route, /buildOnboardingAccountSetupEmail/);
  assert.match(route, /accountSetupEmailSent/);
  assert.match(setupPage, /window\.location\.hash/);
  assert.match(setupPage, /access_token/);
  assert.match(setupPage, /refresh_token/);
  assert.match(setupPage, /fetch\("\/api\/auth\/session"/);
  assert.match(setupPage, /window\.history\.replaceState/);
});

test("provisioning ownership and Shadow execution isolation remain unchanged", () => {
  const ownership = readFileSync(new URL("../lib/acquisition/provisioning/ownership.ts", import.meta.url), "utf8");
  const agentFlags = readFileSync(new URL("../lib/ai/provisioning/flags.ts", import.meta.url), "utf8");
  assert.match(ownership, /draft_owner_mismatch/);
  assert.match(ownership, /verified_email_mismatch/);
  assert.match(agentFlags, /executionEnabled: false as const/);
});

test("authenticated draft ownership and verified email become immutable", () => {
  const service = readFileSync(new URL("../lib/commercial/onboarding/service.ts", import.meta.url), "utf8");
  assert.match(service, /draft_owner_immutable/);
  assert.match(service, /draft_email_immutable/);
  assert.match(service, /existingDraft\.authenticated_user_id/);
});
