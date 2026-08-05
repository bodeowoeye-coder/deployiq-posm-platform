import { NextResponse } from "next/server";
import { randomInt, createHash } from "crypto";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import { isOTPExpired, OTP_VALIDITY_MINUTES, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/acquisition/identity";

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
        emailVerified: false,
      },
    });

    // TODO CO-1B: Integrate email service to send the OTP to `email`.
    // For now, the OTP is returned in development mode only for testing.
    const isDev = process.env.NODE_ENV === "development";
    if (isDev) {
      console.info(`[CO-1B verify DEV] OTP for ${email}: ${otp} (expires at ${expiresAt})`);
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

    if (!storedHash || !expiresAt) {
      return NextResponse.json({ error: "No verification code found. Request a new code." }, { status: 400 });
    }
    if (isOTPExpired(expiresAt)) {
      return NextResponse.json({ error: "This code has expired. Request a new code." }, { status: 400 });
    }

    const salt = draftToken.slice(-8);
    const inputHash = createHash("sha256").update(`${otp}:${salt}`).digest("hex");

    if (inputHash !== storedHash) {
      return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }

    // Mark verified
    await updateOnboardingDraft({
      resumeToken: draftToken,
      currentStep: "account",
      status: "account_created",
      draftData: {
        ...draft.draft_data,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        otpHash: null,
      },
    });

    return NextResponse.json({ verified: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
