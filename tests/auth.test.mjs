import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test, describe } from "node:test";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const NAVIGATION_PATTERN = /router\.(push|replace)|window\.location|location\.href/;

// Returns the source of every useEffect/useLayoutEffect callback so assertions can target
// automatic initialization only, leaving explicit user-triggered handlers alone.
function extractEffectBodies(source) {
  const bodies = [];
  const opener = /use(?:Layout)?Effect\(/g;
  let match;
  while ((match = opener.exec(source)) !== null) {
    let depth = 0;
    for (let index = match.index + match[0].length - 1; index < source.length; index += 1) {
      const character = source[index];
      if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          bodies.push(source.slice(match.index, index + 1));
          opener.lastIndex = index + 1;
          break;
        }
      }
    }
  }
  return bodies;
}

function getLiveAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  return {
    url,
    anonKey,
    serviceRoleKey,
    enabled: process.env.DEPLOYIQ_RUN_LIVE_AUTH_TESTS === "1" && Boolean(url && anonKey && serviceRoleKey),
  };
}

function clients() {
  const { url, anonKey, serviceRoleKey } = getLiveAuthConfig();
  return {
    admin: createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    anon: createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

function proofEmail(label) {
  return `deployiq-auth-proof+${label}-${randomUUID()}@casiogroup.com`;
}

describe("onboarding Auth credential proof", () => {
  test(
    "customer-created password written by service role signs in through anon password auth",
    { skip: getLiveAuthConfig().enabled ? false : "Set DEPLOYIQ_RUN_LIVE_AUTH_TESTS=1 to run live Supabase auth proof." },
    async () => {
      const { admin, anon } = clients();
      const email = proofEmail("customer");
      const password = `Customer-${randomUUID()}-Aa1!`;
      let userId = null;

      try {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: {
            password_method: "customer_created",
            password_change_required: false,
            first_login_completed: false,
          },
        });
        assert.ifError(createError);
        userId = created.user?.id ?? null;
        assert.ok(userId);
        assert.ok(created.user?.email_confirmed_at);

        const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password });
        assert.ifError(signInError);
        assert.ok(session.session?.access_token);
        assert.equal(session.user?.id, userId);
      } finally {
        if (userId) await admin.auth.admin.deleteUser(userId);
      }
    },
  );

  test(
    "generated temporary password written by service role signs in through anon password auth",
    { skip: getLiveAuthConfig().enabled ? false : "Set DEPLOYIQ_RUN_LIVE_AUTH_TESTS=1 to run live Supabase auth proof." },
    async () => {
      const { admin, anon } = clients();
      const email = proofEmail("generated");
      const temporaryPassword = `Generated-${randomUUID()}-Aa1!`;
      let userId = null;

      try {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password: temporaryPassword,
          email_confirm: true,
          app_metadata: {
            password_method: "generated",
            password_change_required: true,
            first_login_completed: false,
          },
        });
        assert.ifError(createError);
        userId = created.user?.id ?? null;
        assert.ok(userId);
        assert.equal(created.user?.app_metadata?.password_change_required, true);

        const { data: session, error: signInError } = await anon.auth.signInWithPassword({
          email,
          password: temporaryPassword,
        });
        assert.ifError(signInError);
        assert.ok(session.session?.access_token);
        assert.equal(session.user?.id, userId);
        assert.equal(session.user?.app_metadata?.password_change_required, true);
      } finally {
        if (userId) await admin.auth.admin.deleteUser(userId);
      }
    },
  );
});

describe("mandatory password change routing", () => {
  test("session creation reads authoritative Auth metadata before redirecting", () => {
    const sessionRoute = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
    assert.match(sessionRoute, /getAuthoritativeAccountSecurityState/);
    assert.match(sessionRoute, /const accountSecurity = await getAuthoritativeAccountSecurityState\(data\.user\.id\)/);
    assert.match(sessionRoute, /accountSecurity\.passwordChangeRequired/);
    assert.match(sessionRoute, /\/login\/create-password\?returnTo=/);
    assert.match(sessionRoute, /role: resolvedRole/);
    assert.match(sessionRoute, /clientId: role\.client_id/);
    assert.match(sessionRoute, /resolveAuthoritativeSessionDestination/);
    assert.match(sessionRoute, /returnToMatchesAuthoritativeDestination/);
  });

  test("session refresh keeps password change ahead of onboarding resume", () => {
    const sessionRoute = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
    assert.match(sessionRoute, /const accountSecurity = await getAuthoritativeAccountSecurityState\(context\.user\.id\)/);
    assert.match(sessionRoute, /accountSecurity\.passwordChangeRequired[\s\S]*\/login\/create-password/);
  });

  test("direct onboarding access is blocked while password_change_required is true", () => {
    const onboardingPage = readFileSync(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8");
    assert.match(onboardingPage, /getCurrentUserContext/);
    assert.match(onboardingPage, /readAccountSecurityState\(context\.user\)/);
    assert.match(onboardingPage, /accountSecurity\?\.passwordChangeRequired/);
    assert.match(onboardingPage, /redirect\(`\/login\/create-password\?returnTo=/);
  });

  test("anonymous onboarding entry does not turn a stale access cookie into a login requirement", () => {
    const onboardingPage = readFileSync(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8");
    assert.match(onboardingPage, /const context = await getCurrentUserContext\(\)/);
    assert.doesNotMatch(onboardingPage, /getCurrentAccessToken/);
    assert.doesNotMatch(onboardingPage, /if \(accessToken && !context\)/);
    assert.match(onboardingPage, /accountSecurity\?\.passwordChangeRequired/);
  });

  test("onboarding resume API cannot outrank mandatory password change", () => {
    const latestRoute = readFileSync(new URL("../app/api/onboarding/latest/route.ts", import.meta.url), "utf8");
    const blockIndex = latestRoute.indexOf("accountSecurity.passwordChangeRequired");
    const lookupIndex = latestRoute.indexOf("await getEligibleIncompleteDraftsForCustomer");
    assert.ok(blockIndex > -1);
    assert.ok(lookupIndex > -1);
    assert.ok(blockIndex < lookupIndex);
    assert.match(latestRoute, /blockedByPasswordChange: true/);
  });

  test("password-change API clears flags only after password update succeeds", () => {
    const passwordRoute = readFileSync(new URL("../app/api/auth/password/route.ts", import.meta.url), "utf8");
    const requireIndex = passwordRoute.indexOf("if (!accountSecurity.passwordChangeRequired)");
    const passwordUpdateIndex = passwordRoute.indexOf("const { error: passwordError }");
    const metadataUpdateIndex = passwordRoute.indexOf("const { error: metadataError }");
    assert.ok(requireIndex > -1);
    assert.ok(passwordUpdateIndex > requireIndex);
    assert.ok(metadataUpdateIndex > passwordUpdateIndex);
    assert.match(passwordRoute, /if \(passwordError\) throw passwordError/);
    assert.match(passwordRoute, /password_change_required: false/);
    assert.match(passwordRoute, /first_login_completed: true/);
    assert.match(passwordRoute, /auth\.signInWithPassword/);
    assert.match(passwordRoute, /setDeployIqSessionCookies\(response, request/);
  });

  test("password-change return restores the fresh authenticated session before onboarding recovery", () => {
    const passwordRoute = readFileSync(new URL("../app/api/auth/password/route.ts", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../components/onboarding/OnboardingShell.tsx", import.meta.url), "utf8");
    const metadataIndex = passwordRoute.indexOf("password_change_required: false");
    const reauthenticationIndex = passwordRoute.indexOf("auth.signInWithPassword");
    const cookieIndex = passwordRoute.indexOf("setDeployIqSessionCookies(response, request");
    assert.ok(metadataIndex > -1 && reauthenticationIndex > metadataIndex);
    assert.ok(cookieIndex > reauthenticationIndex);
    assert.match(shell, /else if \(payload\?\.draft\) applyDraft\(payload\.draft\)/);
    assert.doesNotMatch(shell, /else if \(payload\?\.draft\) setResumePromptDraft\(payload\.draft\)/);
  });

  test("OTP verification proves generated security metadata before returning temporary password", () => {
    const verifyRoute = readFileSync(new URL("../app/api/acquisition/verify/route.ts", import.meta.url), "utf8");
    const checkIndex = verifyRoute.indexOf("generated credential persistence check failed");
    const responseIndex = verifyRoute.indexOf("debug_temporary_password");
    assert.ok(checkIndex > -1);
    assert.ok(responseIndex > checkIndex);
    assert.match(verifyRoute, /accountSecurity\.passwordMethod !== "generated"/);
    assert.match(verifyRoute, /accountSecurity\.passwordChangeRequired !== true/);
    assert.match(verifyRoute, /accountSecurity\.firstLoginCompleted !== false/);
  });

  test("authoritative account-security state lives in Supabase Auth app_metadata", () => {
    const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
    assert.match(auth, /readAccountSecurityState/);
    assert.match(auth, /user\.app_metadata\?\.password_method/);
    assert.match(auth, /user\.app_metadata\?\.password_change_required === true/);
    assert.match(auth, /user\.app_metadata\?\.first_login_completed === true/);
    assert.match(auth, /auth\.admin\.getUserById\(userId\)/);
    assert.match(auth, /throw error \?\? new Error\("Authoritative auth user lookup failed\."\)/);
  });

  test("identity-confirmed login does not silently redirect an unrelated active session", () => {
    const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
    assert.match(login, /onboardingUserId/);
    assert.match(login, /session\.userId !== nextOnboardingUserId/);
    assert.match(login, /setAccountMismatch/);
    assert.match(login, /You&apos;re currently signed in as:/);
    assert.match(login, /Continue as this account/);
    assert.match(login, /Switch accounts/);
  });

  test("post-auth destination does not route onboarding-only clients to client dashboard", () => {
    const sessionRoute = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
    const destinations = readFileSync(new URL("../lib/authDestinations.ts", import.meta.url), "utf8");
    assert.match(sessionRoute, /defaultDestinationForResolvedUser/);
    assert.match(destinations, /getLatestEligibleIncompleteDraftForCustomer/);
    assert.match(destinations, /function hasCustomerAdminMembership/);
    assert.match(destinations, /getLatestActivationDraftForCustomer/);
    assert.match(destinations, /if \(incompleteDraft\) return "\/onboarding"/);
    assert.match(destinations, /return `\/workspace\/activation\?token=\$\{encodeURIComponent\(activationDraft\.resume_token\)\}`/);
    assert.match(destinations, /await hasCustomerAdminMembership\(input\.userId, input\.clientId\)/);
    assert.match(destinations, /Customer workspace membership lookup is temporarily unavailable/);
    assert.match(destinations, /if \(!input\.clientId\) return "\/onboarding"/);
    assert.match(sessionRoute, /returnTo === "\/client" && role === "client" && !clientId/);
  });

  test("post-auth destination keeps active customer-admin accounts on workspace admin", () => {
    const destinations = readFileSync(new URL("../lib/authDestinations.ts", import.meta.url), "utf8");
    const incompleteIndex = destinations.indexOf("const incompleteDraft = await getLatestEligibleIncompleteDraftForCustomer");
    const activationIndex = destinations.indexOf("const activationDraft = await getLatestActivationDraftForCustomer");
    const noClientIndex = destinations.indexOf('if (!input.clientId) return "/onboarding"');
    const adminIndex = destinations.indexOf('await hasCustomerAdminMembership(input.userId, input.clientId)');
    assert.ok(incompleteIndex > -1);
    assert.ok(activationIndex > -1);
    assert.ok(activationIndex > incompleteIndex);
    assert.ok(noClientIndex > activationIndex);
    assert.ok(adminIndex > noClientIndex);
    assert.match(destinations, /getLatestEligibleIncompleteDraftForCustomer\(\{[\s\S]*userId: input\.userId/);
    assert.match(destinations, /getLatestActivationDraftForCustomer\(\{[\s\S]*userId: input\.userId/);
    assert.match(destinations, /return isCustomerAdmin \? "\/workspace\/admin" : "\/client"/);
  });

  test("post-auth destination routes pending provisioning account to activation status before workspace admin", () => {
    const destinations = readFileSync(new URL("../lib/authDestinations.ts", import.meta.url), "utf8");
    const onboardingService = readFileSync(new URL("../lib/commercial/onboarding/service.ts", import.meta.url), "utf8");
    const incompleteReturn = destinations.indexOf('if (incompleteDraft) return "/onboarding"');
    const activationReturn = destinations.indexOf("return `/workspace/activation?token=${encodeURIComponent(activationDraft.resume_token)}`");
    const adminReturn = destinations.indexOf('await hasCustomerAdminMembership(input.userId, input.clientId)');
    assert.ok(incompleteReturn > -1);
    assert.ok(activationReturn > -1);
    assert.ok(adminReturn > -1);
    assert.ok(incompleteReturn < activationReturn);
    assert.ok(activationReturn < adminReturn);
    assert.match(onboardingService, /reconcileCompletedActivationDraft/);
    assert.match(onboardingService, /return drafts\.find\(\(draft\) => isEligibleIncompleteDraft\(draft\) && isActivationPendingDraft\(draft\)\) \?\? null/);
  });

  test("session endpoint cannot let returnTo bypass authoritative activation or onboarding state", () => {
    const sessionRoute = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
    const destinationFunction = sessionRoute.slice(
      sessionRoute.indexOf("async function resolveAuthoritativeSessionDestination"),
      sessionRoute.indexOf("export async function POST"),
    );
    assert.match(destinationFunction, /const authoritativeDestination = await defaultDestinationForResolvedUser/);
    assert.match(destinationFunction, /const returnToAllowed = isAllowedSessionReturnTo/);
    assert.match(destinationFunction, /const returnToCompatible = returnToAllowed && returnToMatchesAuthoritativeDestination/);
    assert.match(destinationFunction, /destination: returnToCompatible \? input\.requestedReturnTo \?\? authoritativeDestination : authoritativeDestination/);
    assert.match(sessionRoute, /authoritativeDestination: destination\.authoritativeDestination/);
    assert.match(sessionRoute, /returnToCompatible: destination\.returnToCompatible/);
  });

  test("session returnTo compatibility prevents workspace-admin and activation bounce", () => {
    const sessionRoute = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
    assert.match(sessionRoute, /if \(authoritativePath === "\/workspace\/admin"\) return requestedPath === "\/workspace\/admin" \|\| requestedPath\.startsWith\("\/workspace\/admin\/"\)/);
    assert.doesNotMatch(sessionRoute, /authoritativePath === "\/workspace\/activation"[\s\S]*startsWith\("\/workspace\/admin/);
    assert.doesNotMatch(sessionRoute, /authoritativePath === "\/onboarding"[\s\S]*startsWith\("\/workspace\/admin/);
  });

  test("session POST success response returns redirectTo for the login handoff", () => {
    const sessionRoute = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
    assert.match(sessionRoute, /const redirectTo = accountSecurity\.passwordChangeRequired/);
    assert.match(sessionRoute, /NextResponse\.json\(\{\s*ok: true,\s*authenticated: true,\s*role: resolvedRole,\s*redirectTo\s*\}/);
    assert.match(sessionRoute, /authoritativeDestination: destination\.authoritativeDestination/);
    assert.match(sessionRoute, /redirectTo,/);
  });

  test("fresh recovery link renders password form only when authority still requires it", () => {
    const page = readFileSync(new URL("../app/login/create-password/page.tsx", import.meta.url), "utf8");
    assert.match(page, /if \(isCreatePasswordDestination\(payload\.redirectTo\)\)/);
    assert.match(page, /setSetupState\("password_required"\)/);
    assert.match(page, /setupState === "completed_or_unavailable"/);
    assert.match(page, /Create a new password/);
  });

  test("fresh recovery link honors an authoritative onboarding redirect", () => {
    const page = readFileSync(new URL("../app/login/create-password/page.tsx", import.meta.url), "utf8");
    assert.match(page, /const payload = \(await response\.json\(\)\.catch\(\(\) => null\)\)/);
    assert.match(page, /router\.replace\(payload\.redirectTo\)/);
    assert.match(page, /body: JSON\.stringify\(\{ accessToken, refreshToken, returnTo: resolvedReturnTo \}\)/);
  });

  test("already-authenticated completed account is resolved through the cookie session", () => {
    const page = readFileSync(new URL("../app/login/create-password/page.tsx", import.meta.url), "utf8");
    assert.match(page, /fetch\(`\/api\/auth\/session\?returnTo=\$\{encodeURIComponent\(resolvedReturnTo\)\}`/);
    assert.match(page, /method: "GET"/);
    assert.match(page, /credentials: "include"/);
    assert.match(page, /await applyAuthoritativeResponse\(response\)/);
  });

  test("consumed or expired recovery link shows a bounded sign-in state", () => {
    const page = readFileSync(new URL("../app/login/create-password/page.tsx", import.meta.url), "utf8");
    assert.match(page, /Account setup already completed or this secure link is no longer available\./);
    assert.match(page, /Sign in to continue your DeployIQ workspace setup\./);
    assert.match(page, /href="\/login\?returnTo=%2Fonboarding"/);
    assert.match(page, />\s*Sign in to continue\s*</);
  });

  test("Supabase recovery errors cannot bypass the current-session check", () => {
    const page = readFileSync(new URL("../app/login/create-password/page.tsx", import.meta.url), "utf8");
    assert.match(page, /recovery\.get\("error"\)/);
    assert.match(page, /recovery\.get\("error_code"\)/);
    assert.match(page, /recovery\.get\("error_description"\)/);
    assert.match(page, /if \(!hasRecoveryError && accessToken && refreshToken\)/);
    assert.match(page, /window\.history\.replaceState/);
  });

  test("password form is not visible while recovery authority is resolving", () => {
    const page = readFileSync(new URL("../app/login/create-password/page.tsx", import.meta.url), "utf8");
    const resolvingStart = page.indexOf('if (setupState === "resolving")');
    const unavailableStart = page.indexOf('if (setupState === "completed_or_unavailable")');
    const passwordFormStart = page.indexOf('<form onSubmit={handleSubmit}');
    assert.ok(resolvingStart > -1);
    assert.ok(unavailableStart > resolvingStart);
    assert.ok(passwordFormStart > unavailableStart);
    assert.doesNotMatch(page.slice(resolvingStart, unavailableStart), /Create a new password|type="password"/);
  });

  test("login client consumes redirectTo after parsing successful session JSON exactly once", () => {
    const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
    const sessionPostIndex = login.indexOf('fetch("/api/auth/session"');
    const jsonIndex = login.indexOf("const sessionBody = (await response.json().catch(() => null))", sessionPostIndex);
    const completeLogIndex = login.indexOf('logLoginDiagnostic("app-session-post-complete"', sessionPostIndex);
    assert.ok(sessionPostIndex > -1);
    assert.ok(jsonIndex > sessionPostIndex);
    assert.ok(completeLogIndex > jsonIndex, "completion diagnostic must run after JSON body is parsed");
    assert.match(login, /const responseRedirectTo = sessionBody\?\.redirectTo \?\? null/);
    assert.match(login, /responseRedirectTo,/);
    assert.match(login, /const redirectTo = responseRedirectTo/);
    assert.doesNotMatch(login, /const redirectTo = sessionBody\.redirectTo \|\| "\/portal"/);
  });

  test("login client navigates immediately for safe redirectTo and errors when missing", () => {
    const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
    assert.match(login, /function isSafeInternalDestination/);
    assert.match(login, /!destination\.startsWith\("\/"\) \|\| destination\.startsWith\("\/\/"\)/);
    assert.match(login, /url\.origin === window\.location\.origin/);
    assert.match(login, /if \(!isSafeInternalDestination\(responseRedirectTo\)\) \{/);
    assert.match(login, /Sign in succeeded, but DeployIQ could not determine where to send you\. Please try again\./);
    assert.match(login, /navigationMethod: "router\.replace"/);
    assert.match(login, /openWorkspaceDestination\(redirectTo, "session-created"\)/);
    assert.doesNotMatch(login, /openWorkspaceDestination\(redirectTo, "session-created"\);\s*setHasCompletedInitialWorkspaceLoad\(true\)/);
  });

  test("login navigation diagnostics distinguish response redirect from resolved destination", () => {
    const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
    assert.match(login, /console\.info\("\[login-navigation\]", input\)/);
    assert.match(login, /responseRedirectTo: unknown/);
    assert.match(login, /resolvedDestination: string \| null/);
    assert.match(login, /sessionPostOk: true/);
    assert.match(login, /navigationStarted: true/);
  });

  test("login diagnostics are deduplicated without changing authentication flow", () => {
    const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
    assert.match(login, /recentDiagnosticKeysRef/);
    assert.match(login, /diagnosticNow - previousDiagnosticAt < 750/);
    assert.match(login, /fetch\("\/api\/auth\/login-diagnostics"/);
    assert.match(login, /logLoginDiagnostic\("submit-received"\)/);
    assert.match(login, /logLoginDiagnostic\("sign-in-button-click"\)/);
  });

  test("Customer Workspace shell and settings effects do not request auth session or navigate", () => {
    const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
    const settings = readFileSync(new URL("../components/workspace/WorkspaceSettingsClient.tsx", import.meta.url), "utf8");
    const combined = `${shell}\n${settings}`;
    assert.match(combined, /localStorage/);
    assert.match(combined, /prefers-color-scheme: dark/);
    assert.doesNotMatch(combined, /\/api\/auth\/session/);

    const effectBodies = [...extractEffectBodies(shell), ...extractEffectBodies(settings)];
    assert.ok(effectBodies.length > 0, "expected at least one effect to inspect");
    for (const body of effectBodies) {
      assert.doesNotMatch(body, NAVIGATION_PATTERN, `automatic effect must not navigate: ${body.slice(0, 120)}`);
    }

    // Project Scope keeps canonical ?projectId= in the URL, but only from an explicit user change.
    assert.match(shell, /onChange=\{\(event\) => \{[^}]*router\.push\(`\$\{normalizePath\(pathname\)\}\$\{value \? `\?projectId=/);
  });

  test("customer workspace subpaths are valid return destinations", () => {
    const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
    assert.match(auth, /normalized === "\/workspace\/admin" \|\| normalized\.startsWith\("\/workspace\/admin\/"\)/);
    assert.match(auth, /return role === "client"/);
  });

  test("auth context resolution distinguishes missing session failed context and resolved identity", () => {
    const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
    assert.match(auth, /export type CurrentUserContextResolution/);
    assert.match(auth, /status: "missing_session"/);
    assert.match(auth, /status: "expired_session"/);
    assert.match(auth, /status: "failed"/);
    assert.match(auth, /status: "resolved"/);
    assert.match(auth, /return \{ status: "missing_session", context: null, step: "Authenticated user", result: "NO_ACCESS_TOKEN" \}/);
    assert.match(auth, /isExpiredJwtAuthError\(error\)/);
    assert.match(auth, /status: "expired_session"/);
    assert.match(auth, /result: "EXPIRED_ACCESS_TOKEN"/);
    assert.match(auth, /return failedAuthContext\(\{[\s\S]*step: "Authenticated user"/);
    assert.match(auth, /return failedAuthContext\(\{[\s\S]*step: "Application role lookup"/);
    assert.match(auth, /return \{ status: "resolved", context, step: "Customer workspace context", result: "OK" \}/);
  });

  test("expired auth.getUser JWT is classified separately from transient context failure", () => {
    const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
    assert.match(auth, /export function isExpiredJwtAuthError/);
    assert.match(auth, /token is expired/);
    assert.match(auth, /invalid claims/);
    assert.match(auth, /EXPIRED_ACCESS_TOKEN/);
    const expiredBlock = auth.slice(auth.indexOf("if (error || !data.user)"), auth.indexOf("return failedAuthContext", auth.indexOf("if (error || !data.user)")));
    assert.match(expiredBlock, /isExpiredJwtAuthError\(error\)/);
    assert.doesNotMatch(expiredBlock, /Authenticated session is still resolving/);
  });

  test("session refresh route refreshes valid cookies and preserves Customer Workspace returnTo", () => {
    const refreshRoute = readFileSync(new URL("../app/api/auth/session/refresh/route.ts", import.meta.url), "utf8");
    assert.match(refreshRoute, /getCurrentRefreshToken/);
    assert.match(refreshRoute, /supabase\.auth\.refreshSession\(\{ refresh_token: refreshToken \}\)/);
    assert.match(refreshRoute, /setDeployIqSessionCookies\(response, request, \{ accessToken, refreshToken: nextRefreshToken \}\)/);
    assert.match(refreshRoute, /requestedReturnTo/);
    assert.match(refreshRoute, /isAllowedReturnTo\(input\.role, input\.requestedReturnTo\)/);
    assert.match(refreshRoute, /return input\.requestedReturnTo/);
    assert.match(refreshRoute, /\/login\/create-password\?returnTo=/);
  });

  test("session refresh failure clears stale DeployIQ cookies and redirects to login with returnTo", () => {
    const refreshRoute = readFileSync(new URL("../app/api/auth/session/refresh/route.ts", import.meta.url), "utf8");
    const cookies = readFileSync(new URL("../lib/authSessionCookies.ts", import.meta.url), "utf8");
    assert.match(refreshRoute, /clearDeployIqAuthCookies\(response, request\)/);
    assert.match(refreshRoute, /loginRedirect\(request, requestedReturnTo\)/);
    assert.match(refreshRoute, /\/login\?returnTo=\$\{encodeURIComponent\(returnTo\)\}/);
    assert.match(cookies, /"deployiq-access-token"/);
    assert.match(cookies, /"deployiq-refresh-token"/);
    assert.match(cookies, /"sb-access-token"/);
    assert.match(cookies, /"sb-refresh-token"/);
    assert.match(cookies, /maxAge: 0/);
    assert.match(cookies, /expires: new Date\(0\)/);
  });

  test("workspace middleware preserves exact requested Customer Workspace destination for auth refresh", () => {
    const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
    const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
    assert.match(middleware, /x-deployiq-return-to/);
    assert.match(middleware, /\$`\{request\.nextUrl\.pathname\}\$\{request\.nextUrl\.search\}`|`\$\{request\.nextUrl\.pathname\}\$\{request\.nextUrl\.search\}`/);
    assert.match(middleware, /"\/workspace\/admin\/:path\*"/);
    assert.match(resolver, /headers\(\)\.get\("x-deployiq-return-to"\)/);
    assert.match(resolver, /safeWorkspaceReturnTo/);
    assert.match(resolver, /encodeURIComponent\(returnTo\)/);
  });

  test("auth context diagnostics are development-only and do not cache across users", () => {
    const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
    assert.match(auth, /function authContextDiagnostic/);
    assert.match(auth, /if \(process\.env\.NODE_ENV !== "development"\) return/);
    assert.doesNotMatch(auth, /cache\(.*getCurrentUserContext|cache\(.*resolveCurrentUserContext/);
    assert.doesNotMatch(auth, /let currentUserContext|let cachedUser|moduleCached|globalThis\.__.*auth/i);
  });

  test("login workspace opening state is bounded and customer-safe", () => {
    const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
    assert.match(login, /WORKSPACE_OPEN_TIMEOUT_MS/);
    assert.match(login, /MAX_WORKSPACE_OPEN_ATTEMPTS = 3/);
    assert.match(login, /workspaceOpenAttemptRef\.current < MAX_WORKSPACE_OPEN_ATTEMPTS/);
    assert.match(login, /workspace-open-timeout/);
    assert.match(login, /Try Again/);
    assert.match(login, /Sign Out/);
    assert.match(login, /Please hold on while DeployIQ loads your workspace\./);
    assert.doesNotMatch(login, /loads your dashboard/);
  });

  test("post-auth membership lookup retries instead of routing transient failures to client", () => {
    const destinations = readFileSync(new URL("../lib/authDestinations.ts", import.meta.url), "utf8");
    assert.match(destinations, /const delays = \[120, 360\]/);
    assert.match(destinations, /stage: "customer-admin-membership"/);
    assert.match(destinations, /result: "transient_failure"/);
    assert.match(destinations, /throw new Error\("Customer workspace membership lookup is temporarily unavailable\."\)/);
    assert.match(destinations, /const isCustomerAdmin = await hasCustomerAdminMembership\(input\.userId, input\.clientId\)/);
    assert.match(destinations, /return isCustomerAdmin \? "\/workspace\/admin" : "\/client"/);
    assert.doesNotMatch(destinations, /if \(error\) return false/);
  });
});
