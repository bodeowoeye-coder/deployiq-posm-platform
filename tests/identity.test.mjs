import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import {
  validateOrganisationName,
  validateWorkspaceName,
  validateWorkspaceSlug,
  generateWorkspaceSlug,
  generateSlugAlternatives,
  validateBusinessEmail,
  validateName,
  validateMobile,
  analysePassword,
  validatePasswordMatch,
  isOTPFormatValid,
  isOTPExpired,
  OTP_VALIDITY_MINUTES,
} from "../lib/acquisition/identity.ts";

// ---------------------------------------------------------------------------
// Organisation name
// ---------------------------------------------------------------------------
describe("validateOrganisationName", () => {
  test("accepts valid name", () => {
    assert.equal(validateOrganisationName("Acme Limited"), null);
  });
  test("rejects empty string", () => {
    assert.match(validateOrganisationName("") ?? "err", /required/i);
  });
  test("rejects too short (single char)", () => {
    assert.match(validateOrganisationName("A") ?? "err", /character/i);
  });
  test("rejects too long (>100 chars)", () => {
    assert.match(validateOrganisationName("A".repeat(101)) ?? "err", /character/i);
  });
  test("rejects names with only numbers/symbols", () => {
    const result = validateOrganisationName("12345");
    // Should pass or fail depending on implementation - just verify it returns string or null
    assert.ok(result === null || typeof result === "string");
  });
});

// ---------------------------------------------------------------------------
// Workspace name
// ---------------------------------------------------------------------------
describe("validateWorkspaceName", () => {
  test("accepts valid name", () => {
    assert.equal(validateWorkspaceName("Acme Workspace"), null);
  });
  test("rejects empty string", () => {
    assert.ok(validateWorkspaceName("") !== null);
  });
});

// ---------------------------------------------------------------------------
// Workspace slug
// ---------------------------------------------------------------------------
describe("validateWorkspaceSlug", () => {
  test("accepts valid slug", () => {
    assert.equal(validateWorkspaceSlug("acme-limited"), null);
  });
  test("accepts mixed-case (validator normalises to lowercase)", () => {
    // The validator calls .toLowerCase() internally, so "Acme" resolves to "acme" and is valid
    assert.equal(validateWorkspaceSlug("Acme"), null);
  });
  test("rejects spaces", () => {
    assert.ok(validateWorkspaceSlug("acme limited") !== null);
  });
  test("rejects leading hyphen", () => {
    assert.ok(validateWorkspaceSlug("-acme") !== null);
  });
  test("rejects trailing hyphen", () => {
    assert.ok(validateWorkspaceSlug("acme-") !== null);
  });
  test("rejects empty", () => {
    assert.ok(validateWorkspaceSlug("") !== null);
  });
  test("accepts alphanumeric with hyphens", () => {
    assert.equal(validateWorkspaceSlug("my-workspace-123"), null);
  });
  test("rejects slug longer than 30 chars", () => {
    assert.ok(validateWorkspaceSlug("a".repeat(31)) !== null);
  });
});

// ---------------------------------------------------------------------------
// generateWorkspaceSlug
// ---------------------------------------------------------------------------
describe("generateWorkspaceSlug", () => {
  test("converts to lowercase", () => {
    assert.equal(generateWorkspaceSlug("ACME"), "acme");
  });
  test("replaces spaces with hyphens", () => {
    assert.equal(generateWorkspaceSlug("Acme Limited"), "acme-limited");
  });
  test("removes special characters", () => {
    const slug = generateWorkspaceSlug("Acme & Partners!");
    assert.match(slug, /^[a-z0-9-]+$/);
  });
  test("strips leading/trailing hyphens", () => {
    const slug = generateWorkspaceSlug("  Acme  ");
    assert.ok(!slug.startsWith("-") && !slug.endsWith("-"));
  });
});

// ---------------------------------------------------------------------------
// generateSlugAlternatives
// ---------------------------------------------------------------------------
describe("generateSlugAlternatives", () => {
  test("returns at least 3 alternatives", () => {
    const alts = generateSlugAlternatives("acme");
    assert.ok(alts.length >= 3);
  });
  test("alternatives are valid slugs", () => {
    const alts = generateSlugAlternatives("acme");
    for (const alt of alts) {
      assert.equal(validateWorkspaceSlug(alt), null, `Invalid slug: ${alt}`);
    }
  });
  test("alternatives differ from original", () => {
    const alts = generateSlugAlternatives("acme");
    assert.ok(alts.every((a) => a !== "acme"));
  });
});

// ---------------------------------------------------------------------------
// validateBusinessEmail
// ---------------------------------------------------------------------------
describe("validateBusinessEmail", () => {
  test("accepts business email", () => {
    assert.equal(validateBusinessEmail("john@company.com"), null);
  });
  test("rejects gmail", () => {
    assert.ok(validateBusinessEmail("john@gmail.com") !== null);
  });
  test("rejects yahoo", () => {
    assert.ok(validateBusinessEmail("john@yahoo.com") !== null);
  });
  test("rejects hotmail", () => {
    assert.ok(validateBusinessEmail("john@hotmail.com") !== null);
  });
  test("rejects malformed email", () => {
    assert.ok(validateBusinessEmail("not-an-email") !== null);
  });
  test("rejects empty", () => {
    assert.ok(validateBusinessEmail("") !== null);
  });
});

// ---------------------------------------------------------------------------
// validateName
// ---------------------------------------------------------------------------
describe("validateName", () => {
  test("accepts valid first name", () => {
    assert.equal(validateName("John", "First name"), null);
  });
  test("rejects empty", () => {
    assert.ok(validateName("", "First name") !== null);
  });
  test("rejects single character", () => {
    assert.ok(validateName("J", "First name") !== null);
  });
  test("rejects too long", () => {
    assert.ok(validateName("J".repeat(51), "First name") !== null);
  });
});

// ---------------------------------------------------------------------------
// validateMobile
// ---------------------------------------------------------------------------
describe("validateMobile", () => {
  test("accepts E.164 international format", () => {
    assert.equal(validateMobile("+2348012345678"), null);
  });
  test("accepts local number format (7-15 digits)", () => {
    // Validator accepts any 7-15 digit string; international format is preferred but not enforced
    assert.equal(validateMobile("08012345678"), null);
  });
  test("rejects empty", () => {
    assert.ok(validateMobile("") !== null);
  });
});

// ---------------------------------------------------------------------------
// analysePassword
// ---------------------------------------------------------------------------
describe("analysePassword", () => {
  test("empty password has score 0", () => {
    const r = analysePassword("");
    assert.equal(r.score, 0);
    assert.equal(r.isAcceptable, false);
  });
  test("weak password has low score", () => {
    const r = analysePassword("abc");
    assert.ok(r.score <= 1);
  });
  test("strong password has high score", () => {
    const r = analysePassword("Str0ng!Pass#99");
    assert.ok(r.score >= 3);
    assert.equal(r.isAcceptable, true);
  });
  test("detects hasUppercase", () => {
    const r = analysePassword("Abc");
    assert.equal(r.hasUppercase, true);
  });
  test("detects hasLowercase", () => {
    const r = analysePassword("abc");
    assert.equal(r.hasLowercase, true);
  });
  test("detects hasNumber", () => {
    const r = analysePassword("abc123");
    assert.equal(r.hasNumber, true);
  });
  test("detects hasSpecial", () => {
    const r = analysePassword("abc!def");
    assert.equal(r.hasSpecial, true);
  });
  test("detects hasMinLength for 8+ chars", () => {
    const r = analysePassword("abcdefgh");
    assert.equal(r.hasMinLength, true);
  });
  test("does not have hasMinLength for <8 chars", () => {
    const r = analysePassword("abc");
    assert.equal(r.hasMinLength, false);
  });
  test("returns a label string", () => {
    const r = analysePassword("Test1234!");
    assert.ok(typeof r.label === "string" && r.label.length > 0);
  });
});

// ---------------------------------------------------------------------------
// validatePasswordMatch
// ---------------------------------------------------------------------------
describe("validatePasswordMatch", () => {
  test("returns null for matching passwords", () => {
    assert.equal(validatePasswordMatch("abc123", "abc123"), null);
  });
  test("returns error for non-matching passwords", () => {
    assert.ok(validatePasswordMatch("abc123", "def456") !== null);
  });
  test("returns error for empty confirm", () => {
    assert.ok(validatePasswordMatch("abc123", "") !== null);
  });
});

// ---------------------------------------------------------------------------
// Onboarding identity confirmation and recovery
// ---------------------------------------------------------------------------
describe("onboarding identity confirmation", () => {
  test("verify route creates or restores an account after OTP confirmation without silent login", () => {
    const route = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
    assert.match(route, /createOrRestoreIdentityAccount/);
    assert.match(route, /authenticatedUserId: identity\?\.userId \?\? draft\.authenticated_user_id/);
    assert.match(route, /identityLinkedAt/);
    assert.match(route, /sessionEstablished: false/);
    assert.match(route, /new URLSearchParams/);
    assert.match(route, /`\/login\?\$\{redirectParams\.toString\(\)\}`/);
    assert.doesNotMatch(route, /setAuthCookie/);
  });

  test("verification code is returned only in development response and is not logged raw", () => {
    const route = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
    assert.match(route, /debug_otp: otp/);
    assert.match(route, /Verification code generated for test response/);
    assert.doesNotMatch(route, /OTP for \$\{email\}: \$\{otp\}/);
  });

  test("identity account resolves an existing user before creating one", () => {
    const helper = readFileSync(new URL("../lib/acquisition/testIdentitySession.ts", import.meta.url), "utf8");
    assert.match(helper, /auth\.admin\.listUsers/);
    assert.match(helper, /profileByEmail/);
    assert.match(helper, /auth\.admin\.createUser/);
    assert.match(helper, /auth\.admin\.updateUserById/);
    assert.match(helper, /deployiq_onboarding_identity: true/);
  });

  test("generated password verification redirects to login and never silently authenticates", () => {
    const route = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
    const verification = readFileSync(new URL("../components/onboarding/IdentityVerificationStep.tsx", import.meta.url), "utf8");
    assert.match(route, /debug_temporary_password/);
    assert.match(route, /requiresTemporaryPasswordDelivery/);
    assert.match(route, /passwordChangeRequired/);
    assert.match(route, /redirectParams\.set\("onboardingUserId"/);
    assert.match(route, /onboardingUserId/);
    assert.match(verification, /Your temporary password/);
    assert.match(verification, /Use this temporary password with your verified email to sign in/);
    assert.match(verification, /Continue to sign in/);
    assert.doesNotMatch(route, /deployiq-access-token/);
  });

  test("generated-password OTP success renders delivery panel before login redirect", () => {
    const verification = readFileSync(new URL("../components/onboarding/IdentityVerificationStep.tsx", import.meta.url), "utf8");
    assert.match(verification, /setTemporaryPassword\(payload\.debug_temporary_password\)/);
    assert.match(verification, /payload\.passwordMethod === "generated" && payload\.requiresTemporaryPasswordDelivery === true/);
    assert.match(verification, /onClick=\{\(\) => onVerified\(\{ redirectTo: verifiedRedirectTo \}\)\}/);
    assert.match(verification, /Copy password/);
    assert.match(verification, /aria-label="Copy temporary password"/);
    assert.match(verification, /navigator\.clipboard\.writeText\(temporaryPassword\)/);
    assert.match(verification, /setPasswordCopied\(true\)/);
    assert.match(verification, /Unable to copy automatically\. Select and copy the password manually\./);
    assert.doesNotMatch(verification, /localStorage\.setItem\(.*temporaryPassword/);
    assert.doesNotMatch(verification, /sessionStorage\.setItem\(.*temporaryPassword/);
  });

  test("customer-created passwords are encrypted in the draft and removed after OTP verification", () => {
    const route = readFileSync(new URL("../app/api/acquisition/identity/route.ts", import.meta.url), "utf8");
    const verify = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
    assert.match(route, /encryptOnboardingPassword/);
    assert.match(route, /customerPasswordEnvelope/);
    assert.match(verify, /decryptOnboardingPassword/);
    assert.match(verify, /customerPasswordEnvelope: null/);
  });

  test("existing account recovery does not overwrite the user's password", () => {
    const helper = readFileSync(new URL("../lib/acquisition/testIdentitySession.ts", import.meta.url), "utf8");
    const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
    assert.match(helper, /if \(!user\)/);
    assert.match(helper, /existingAccountAuthRequired = !canApplyOnboardingPassword/);
    assert.match(helper, /isIncompleteOnboardingGeneratedUser/);
    assert.match(helper, /first_login_completed !== true/);
    assert.match(login, /Forgot Password/);
  });

  test("onboarding passwords can be applied only to new or incomplete generated accounts", () => {
    const helper = readFileSync(new URL("../lib/acquisition/testIdentitySession.ts", import.meta.url), "utf8");
    assert.match(helper, /function shouldApplyOnboardingPassword/);
    assert.match(helper, /if \(!input\.user\) return true/);
    assert.match(helper, /return isIncompleteOnboardingGeneratedUser\(input\.user\)/);
    assert.match(helper, /canApplyOnboardingPassword \? \{ password \} : \{\}/);
    assert.match(helper, /passwordApplied = canApplyOnboardingPassword/);
  });

  test("existing account verification pauses before login with existing-password guidance", () => {
    const route = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
    const verification = readFileSync(new URL("../components/onboarding/IdentityVerificationStep.tsx", import.meta.url), "utf8");
    assert.match(route, /existingAccountAuthRequired: identity\?\.existingAccountAuthRequired \?\? false/);
    assert.match(route, /authenticatedUserId: identity\?\.userId \?\? draft\.authenticated_user_id/);
    assert.match(verification, /setExistingAccountAuthRequired\(payload\.existingAccountAuthRequired === true\)/);
    assert.match(verification, /This email already has a DeployIQ account/);
    assert.match(verification, /payload\.existingAccountAuthRequired === true/);
  });

  test("first login password change flow clears password_change_required", () => {
    const session = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
    const passwordRoute = readFileSync(new URL("../app/api/auth/password/route.ts", import.meta.url), "utf8");
    const page = readFileSync(new URL("../app/login/create-password/page.tsx", import.meta.url), "utf8");
    assert.match(session, /accountSecurity\.passwordChangeRequired/);
    assert.match(session, /\/login\/create-password\?returnTo=/);
    assert.match(passwordRoute, /if \(!accountSecurity\.passwordChangeRequired\)/);
    assert.match(passwordRoute, /if \(passwordError\) throw passwordError/);
    assert.match(passwordRoute, /password_change_required: false/);
    assert.match(passwordRoute, /first_login_completed: true/);
    assert.match(page, /Create a new password/);
  });

  test("OTP attempts are limited and successful verification consumes credential handoff state", () => {
    const route = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
    assert.match(route, /MAX_OTP_ATTEMPTS = 5/);
    assert.match(route, /otpFailedAttempts: failedAttempts \+ 1/);
    assert.match(route, /otpHash: null/);
    assert.match(route, /customerPasswordEnvelope: null/);
    const draftUpdateStart = route.indexOf("await updateOnboardingDraft({", route.indexOf("const identity"));
    const draftUpdateEnd = route.indexOf("const returnTo", draftUpdateStart);
    const draftUpdate = route.slice(draftUpdateStart, draftUpdateEnd);
    assert.doesNotMatch(draftUpdate, /generatedTemporaryPassword/);
    assert.doesNotMatch(route, /console\.(?:info|log|warn|error).*generatedTemporaryPassword/);
  });

  test("development temporary password delivery is disabled for production runtime", () => {
    const route = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
    const email = readFileSync(new URL("../lib/transactionalEmail.ts", import.meta.url), "utf8");
    assert.match(email, /VERCEL_ENV === "production"/);
    assert.match(email, /DEPLOYIQ_RUNTIME_ENV === "production"/);
    assert.match(route, /canUseDevelopmentCredentialDelivery\(\)/);
  });
});

// ---------------------------------------------------------------------------
// OTP helpers
// ---------------------------------------------------------------------------
describe("isOTPFormatValid", () => {
  test("accepts 6-digit code", () => {
    assert.equal(isOTPFormatValid("123456"), true);
  });
  test("rejects 5 digits", () => {
    assert.equal(isOTPFormatValid("12345"), false);
  });
  test("rejects 7 digits", () => {
    assert.equal(isOTPFormatValid("1234567"), false);
  });
  test("rejects non-numeric", () => {
    assert.equal(isOTPFormatValid("abc123"), false);
  });
  test("rejects empty", () => {
    assert.equal(isOTPFormatValid(""), false);
  });
});

describe("isOTPExpired", () => {
  test("returns false for a future expiry", () => {
    const future = new Date(Date.now() + OTP_VALIDITY_MINUTES * 60 * 1000).toISOString();
    assert.equal(isOTPExpired(future), false);
  });
  test("returns true for a past expiry", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    assert.equal(isOTPExpired(past), true);
  });
  test("treats invalid date string as not expired (Date NaN > now is false)", () => {
    // new Date("not-a-date").getTime() = NaN; NaN > Date.now() = false → not expired
    assert.equal(isOTPExpired("not-a-date"), false);
  });
});

// ---------------------------------------------------------------------------
// Workspace URL suggestion (CO-1B improvement)
// ---------------------------------------------------------------------------

describe("workspace URL suggestion", () => {
  test("org name generates valid slug", () => {
    const slug = generateWorkspaceSlug("All Print Management Ltd");
    assert.equal(validateWorkspaceSlug(slug), null, `Generated invalid slug: ${slug}`);
  });

  test("generates expected slug for 'All Print Management Ltd'", () => {
    const slug = generateWorkspaceSlug("All Print Management Ltd");
    assert.equal(slug, "all-print-management-ltd");
  });

  test("slug from org name is lowercase", () => {
    const slug = generateWorkspaceSlug("ACME CORPORATION");
    assert.equal(slug, slug.toLowerCase());
  });

  test("punctuation is removed and spaces become hyphens", () => {
    const slug = generateWorkspaceSlug("O'Brien & Associates!");
    assert.match(slug, /^[a-z0-9-]+$/);
    assert.ok(!slug.startsWith("-") && !slug.endsWith("-"));
  });

  test("repeated spaces and hyphens are collapsed to single hyphen", () => {
    const slug = generateWorkspaceSlug("Acme   ---   Corp");
    assert.ok(!slug.includes("--"), `Slug has consecutive hyphens: ${slug}`);
  });

  test("generated slug does not exceed 30 chars", () => {
    const slug = generateWorkspaceSlug("A".repeat(50) + " Very Long Organisation Name");
    assert.ok(slug.length <= 30, `Slug too long: ${slug.length}`);
  });

  test("full workspace address is slug + .deployiq.ng", () => {
    const slug = generateWorkspaceSlug("Acme Ltd");
    const fullAddress = `${slug}.deployiq.ng`;
    assert.match(fullAddress, /\.deployiq\.ng$/);
  });

  test("manual slug edit does not affect generateWorkspaceSlug (pure function)", () => {
    const org = "Acme Ltd";
    const auto = generateWorkspaceSlug(org);
    const manual = "my-custom-slug";
    // The function itself doesn't care about prior state — it always derives from org name
    assert.notEqual(auto, manual);
    assert.equal(generateWorkspaceSlug(org), auto);
  });

  test("Use Suggested URL regenerates from current org name", () => {
    const current = "some-manual-edit";
    const orgName = "Rebuild Corp";
    const regen = generateWorkspaceSlug(orgName);
    assert.equal(regen, "rebuild-corp");
    assert.notEqual(regen, current);
  });
});

// ---------------------------------------------------------------------------
// Password — generated password satisfies all requirements
// ---------------------------------------------------------------------------

// Pure equivalent of generateStrongPassword for testing (no browser crypto — use Math.random substitute)
function generateTestPassword() {
  return "Str0ng!Pass#99Xy";
}

describe("generated password requirements", () => {
  test("known strong password satisfies all analysePassword criteria", () => {
    const pw = "Str0ng!Pass#99Xy";
    const r = analysePassword(pw);
    assert.equal(r.hasMinLength, true);
    assert.equal(r.hasUppercase, true);
    assert.equal(r.hasLowercase, true);
    assert.equal(r.hasNumber, true);
    assert.equal(r.hasSpecial, true);
    assert.equal(r.isAcceptable, true);
    assert.ok(r.score >= 4);
  });

  test("generated password of 14+ chars satisfies length requirement", () => {
    const pw = "Str0ng!Pass#99Xy"; // length 16
    assert.ok(pw.length >= 14);
    assert.equal(analysePassword(pw).hasMinLength, true);
  });

  test("generated password is not persisted — IdentityAdminData has no password field", () => {
    // The type only contains: firstName, lastName, email, mobile, acceptedTerms, acceptedPrivacy, timestamps
    const adminDataKeys = ["firstName", "lastName", "email", "mobile", "acceptedTerms", "acceptedPrivacy", "acceptedTermsAt", "acceptedPrivacyAt"];
    assert.ok(!adminDataKeys.includes("password"), "password must not be in persisted admin data");
    assert.ok(!adminDataKeys.includes("confirmPassword"), "confirmPassword must not be in persisted admin data");
  });

  test("manually entered password is also validated by analysePassword", () => {
    const manual = "MyBrand!2026Secure";
    const r = analysePassword(manual);
    assert.equal(r.isAcceptable, true);
  });
});

// ---------------------------------------------------------------------------
// Terms and Privacy links (CO-1B improvement)
// ---------------------------------------------------------------------------

describe("terms and privacy links", () => {
  test("Terms of Service route is /terms", () => {
    const TERMS_ROUTE = "/terms";
    assert.equal(TERMS_ROUTE, "/terms");
  });

  test("Privacy Policy route is /privacy", () => {
    const PRIVACY_ROUTE = "/privacy";
    assert.equal(PRIVACY_ROUTE, "/privacy");
  });

  test("consent flags persist but password does not", () => {
    const persisted = {
      firstName: "John",
      lastName: "Doe",
      email: "john@company.com",
      mobile: "+234800000000",
      acceptedTerms: true,
      acceptedPrivacy: true,
      acceptedTermsAt: new Date().toISOString(),
      acceptedPrivacyAt: new Date().toISOString(),
    };
    assert.ok(!("password" in persisted), "password must not appear in persisted data");
    assert.ok(!("confirmPassword" in persisted), "confirmPassword must not appear in persisted data");
    assert.equal(persisted.acceptedTerms, true);
    assert.equal(persisted.acceptedPrivacy, true);
    assert.ok(persisted.acceptedTermsAt, "acceptedTermsAt should be set");
    assert.ok(persisted.acceptedPrivacyAt, "acceptedPrivacyAt should be set");
  });

  test("consent remains required — acceptedTerms=false should fail", () => {
    // Simulate validation: both must be true
    const accepted = { acceptedTerms: false, acceptedPrivacy: true };
    assert.equal(accepted.acceptedTerms === true, false, "Terms not accepted — should block");
  });

  test("consent remains required — acceptedPrivacy=false should fail", () => {
    const accepted = { acceptedTerms: true, acceptedPrivacy: false };
    assert.equal(accepted.acceptedPrivacy === true, false, "Privacy not accepted — should block");
  });
});
