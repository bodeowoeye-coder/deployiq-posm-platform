import { NextResponse } from "next/server";
import { randomInt, createHash } from "crypto";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import { isOTPExpired, OTP_VALIDITY_MINUTES, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/acquisition/identity";
import {
  createOrRestoreTestIdentityAccount,
  decryptOnboardingPassword,
  generateTemporaryAccountPassword,
} from "@/lib/acquisition/testIdentitySession";

const MAX_OTP_ATTEMPTS = 5;

function isProductionRuntime() {
  return process.env.VERCEL_ENV === "production" || process.env.DEPLOYIQ_RUNTIME_ENV === "production";
}

function canUseDevelopmentCredentialDelivery() {
  return !isProductionRuntime();
}

function generateOTP(): string {
  return randomInt(100000, 999999).toString();
}

function hashOTP(otp: string, salt: string): string {
  return createHash("sha256").update(`${otp}:${salt}`).digest("hex");
}

/** Send OTP (trigger) — creates OTP and stores hash in draft. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const draftToken = typeof body.resumeToken === "string" ? body.resumeToken : null;

    if (!draftToken) {
      return NextResponse.json({ error: "Acquisition session is required." }, { status: 400 });
    }

    const draft = await getOnboardingDraftByToken(draftToken);
    if (!draft) {
      return NextResponse.json({ error: "Acquisition session not found." }, { status: 404 });
    }

    const email = draft.draft_data?.adminEmail as string | undefined;
    if (!email) {
      return NextResponse.json({ error: "Administrator email not found. Complete the account step first." }, { status: 400 });
    }

    // Respect cooldown
    const lastSentAt = draft.draft_data?.otpSentAt as string | undefined;
    if (lastSentAt) {
      const secondsAgo = (Date.now() - new Date(lastSentAt).getTime()) / 1000;
      if (secondsAgo < OTP_RESEND_COOLDOWN_SECONDS) {
        const remaining = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsAgo);
        return NextResponse.json({ error: `Please wait ${remaining} seconds before requesting a new code.` }, { status: 429 });
      }
    }

    const otp = generateOTP();
    const salt = draftToken.slice(-8);
    const otpHash = hashOTP(otp, salt);
    const expiresAt = new Date(Date.now() + OTP_VALIDITY_MINUTES * 60 * 1000).toISOString();

    await updateOnboardingDraft({
      resumeToken: draftToken,
      currentStep: "account",
      status: "account_pending",
      draftData: {
        ...draft.draft_data,
        otpHash,
        otpExpiresAt: expiresAt,
        otpSentAt: new Date().toISOString(),
        otpFailedAttempts: 0,
        emailVerified: false,
      },
    });

    // TODO CO-1B: Integrate email service to send the OTP to `email`.
    // For now, the OTP is returned in development mode only for testing.
    const isDev = process.env.NODE_ENV === "development";
    if (isDev) {
      console.info("[CO-1B verify DEV] OTP generated for test response.", { email, expiresAt });
    }

    return NextResponse.json({
      sent: true,
      email,
      expiresAt,
      ...(isDev ? { debug_otp: otp } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Verify OTP. */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const draftToken = typeof body.resumeToken === "string" ? body.resumeToken : null;
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";

    if (!draftToken) {
      return NextResponse.json({ error: "Acquisition session is required." }, { status: 400 });
    }
    if (!otp || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });
    }

    const draft = await getOnboardingDraftByToken(draftToken);
    if (!draft) {
      return NextResponse.json({ error: "Acquisition session not found." }, { status: 404 });
    }

    const storedHash = draft.draft_data?.otpHash as string | undefined;
    const expiresAt = draft.draft_data?.otpExpiresAt as string | undefined;
    const failedAttempts = typeof draft.draft_data?.otpFailedAttempts === "number" ? draft.draft_data.otpFailedAttempts : 0;

    if (!storedHash || !expiresAt) {
      return NextResponse.json({ error: "No verification code found. Request a new code." }, { status: 400 });
    }
    if (failedAttempts >= MAX_OTP_ATTEMPTS) {
      return NextResponse.json({ error: "Too many incorrect attempts. Request a new code." }, { status: 429 });
    }
    if (isOTPExpired(expiresAt)) {
      return NextResponse.json({ error: "This code has expired. Request a new code." }, { status: 400 });
    }

    const salt = draftToken.slice(-8);
    const inputHash = createHash("sha256").update(`${otp}:${salt}`).digest("hex");

    if (inputHash !== storedHash) {
      await updateOnboardingDraft({
        resumeToken: draftToken,
        currentStep: "account",
        status: "account_pending",
        draftData: {
          ...draft.draft_data,
          otpFailedAttempts: failedAttempts + 1,
        },
      });
      return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }

    const adminEmail = typeof draft.draft_data.adminEmail === "string" ? draft.draft_data.adminEmail.trim().toLowerCase() : "";
    const adminName = [
      typeof draft.draft_data.adminFirstName === "string" ? draft.draft_data.adminFirstName.trim() : "",
      typeof draft.draft_data.adminLastName === "string" ? draft.draft_data.adminLastName.trim() : "",
    ].filter(Boolean).join(" ") || "Workspace Administrator";
    const passwordMethod = draft.draft_data.passwordMethod === "customer_created" ? "customer_created" : "generated";
    const customerPassword = passwordMethod === "customer_created"
      ? decryptOnboardingPassword(draft.draft_data.customerPasswordEnvelope)
      : null;
    if (passwordMethod === "customer_created" && !customerPassword) {
      return NextResponse.json({ error: "Password setup has expired. Return to account details and create a new password." }, { status: 409 });
    }
    const generatedTemporaryPassword = passwordMethod === "generated" ? generateTemporaryAccountPassword() : null;

    const testIdentity = canUseDevelopmentCredentialDelivery() && adminEmail
      ? await createOrRestoreTestIdentityAccount({
          email: adminEmail,
          fullName: adminName,
          phone: typeof draft.draft_data.adminMobile === "string" ? draft.draft_data.adminMobile : null,
          passwordMethod,
          password: passwordMethod === "customer_created" ? customerPassword : generatedTemporaryPassword,
          passwordChangeRequired: passwordMethod === "generated",
        })
      : null;
    if (
      passwordMethod === "generated"
      && testIdentity?.passwordApplied === true
      && (
        testIdentity.accountSecurity.passwordMethod !== "generated"
        || testIdentity.accountSecurity.passwordChangeRequired !== true
        || testIdentity.accountSecurity.firstLoginCompleted !== false
        || testIdentity.emailConfirmed !== true
      )
    ) {
      console.error("[identity-verify] generated credential persistence check failed", {
        draftId: draft.id,
        email: adminEmail,
        authUserId: testIdentity.userId,
        passwordMethod: testIdentity.accountSecurity.passwordMethod,
        passwordChangeRequired: testIdentity.accountSecurity.passwordChangeRequired,
        firstLoginCompleted: testIdentity.accountSecurity.firstLoginCompleted,
        emailConfirmed: testIdentity.emailConfirmed,
      });
      return NextResponse.json({ error: "Account security setup did not complete. Please request a new verification code." }, { status: 500 });
    }
    if (adminEmail) {
      console.info("[identity-verify] OTP confirmed", {
        draftId: draft.id,
        email: adminEmail,
        authUserId: testIdentity?.userId ?? null,
        authUserLinked: Boolean(testIdentity?.userId),
        passwordMethod,
        passwordApplied: testIdentity?.passwordApplied ?? false,
        existingAccountAuthRequired: testIdentity?.existingAccountAuthRequired ?? false,
        passwordChangeRequired: testIdentity?.accountSecurity.passwordChangeRequired ?? null,
        firstLoginCompleted: testIdentity?.accountSecurity.firstLoginCompleted ?? null,
      });
    }

    await updateOnboardingDraft({
      resumeToken: draftToken,
      email: testIdentity?.email ?? (adminEmail || draft.email),
      currentStep: "account",
      status: "account_created",
      selectedProduct: draft.selected_product,
      pricingSnapshotId: draft.pricing_snapshot_id,
      authenticatedUserId: testIdentity?.userId ?? draft.authenticated_user_id,
      draftData: {
        ...draft.draft_data,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        identityLinkedAt: testIdentity ? new Date().toISOString() : draft.draft_data.identityLinkedAt ?? null,
        testSessionEstablished: Boolean(testIdentity),
        email_verified_at: new Date().toISOString(),
        password_method: passwordMethod,
        password_change_required: passwordMethod === "generated" && testIdentity?.passwordApplied === true,
        first_login_completed: false,
        temporaryPasswordDeliveredAt: passwordMethod === "generated" && testIdentity?.passwordApplied === true ? new Date().toISOString() : null,
        existingAccountAuthRequired: testIdentity?.existingAccountAuthRequired ?? false,
        otpHash: null,
        otpExpiresAt: null,
        otpFailedAttempts: 0,
        customerPasswordEnvelope: null,
      },
    });

    const returnTo = "/onboarding";
    const redirectParams = new URLSearchParams({
      returnTo,
      identityConfirmed: "1",
    });
    if (testIdentity?.userId) redirectParams.set("onboardingUserId", testIdentity.userId);
    const redirectTo = `/login?${redirectParams.toString()}`;
    return NextResponse.json({
      verified: true,
      sessionEstablished: false,
      redirectTo,
      passwordMethod,
      passwordChangeRequired: passwordMethod === "generated" && testIdentity?.passwordApplied === true,
      existingAccountAuthRequired: testIdentity?.existingAccountAuthRequired ?? false,
      requiresTemporaryPasswordDelivery: passwordMethod === "generated" && testIdentity?.passwordApplied === true,
      ...(canUseDevelopmentCredentialDelivery() && passwordMethod === "generated" && testIdentity?.passwordApplied === true
        ? { debug_temporary_password: generatedTemporaryPassword }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
