import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { readAccountSecurityState } from "@/lib/auth";
import { upsertUserProfileWithRetry } from "@/lib/userManagement";

type ExistingAuthUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

function randomPassword() {
  return `DeployIQ-test-${randomUUID()}-Aa1!`;
}

export function generateTemporaryAccountPassword() {
  return randomPassword();
}

function encryptionKey() {
  const source = process.env.ONBOARDING_PASSWORD_ENCRYPTION_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? "deployiq-local-development-password-key";
  return createHash("sha256").update(source).digest();
}

export function encryptOnboardingPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    ciphertext: encrypted.toString("base64url"),
  };
}

export function decryptOnboardingPassword(envelope: unknown) {
  if (!envelope || typeof envelope !== "object") return null;
  const payload = envelope as Record<string, unknown>;
  if (payload.algorithm !== "aes-256-gcm") return null;
  const iv = typeof payload.iv === "string" ? Buffer.from(payload.iv, "base64url") : null;
  const tag = typeof payload.tag === "string" ? Buffer.from(payload.tag, "base64url") : null;
  const ciphertext = typeof payload.ciphertext === "string" ? Buffer.from(payload.ciphertext, "base64url") : null;
  if (!iv || !tag || !ciphertext) return null;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isIncompleteOnboardingGeneratedUser(user: ExistingAuthUser) {
  return user.app_metadata?.password_method === "generated"
    && user.app_metadata?.first_login_completed !== true;
}

function shouldApplyOnboardingPassword(input: {
  passwordMethod: "generated" | "customer_created";
  user: ExistingAuthUser | null;
}) {
  if (!input.user) return true;
  return isIncompleteOnboardingGeneratedUser(input.user);
}

export async function createOrRestoreTestIdentityAccount(input: {
  email: string;
  fullName: string;
  phone: string | null;
  passwordMethod: "generated" | "customer_created";
  password?: string | null;
  passwordChangeRequired: boolean;
}) {
  const email = input.email.trim().toLowerCase();
  const adminSupabase = createAdminSupabase();

  const [{ data: authUsers }, { data: profileByEmail }] = await Promise.all([
    adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    adminSupabase.schema("public").from("user_profiles").select("user_id, email").eq("email", email).maybeSingle(),
  ]);

  let user = authUsers.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
  if (!user && profileByEmail?.user_id) {
    const { data } = await adminSupabase.auth.admin.getUserById(profileByEmail.user_id);
    user = data.user ?? null;
  }

  const password = input.password ?? randomPassword();
  let created = false;
  let passwordApplied = false;
  let existingAccountAuthRequired = false;
  if (!user) {
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
      app_metadata: {
        password_method: input.passwordMethod,
        password_change_required: input.passwordChangeRequired,
        first_login_completed: false,
        deployiq_onboarding_test_user: true,
      },
    });
    if (error || !data.user) throw error ?? new Error("Could not create test user.");
    user = data.user;
    created = true;
    passwordApplied = true;
  } else {
    const canApplyOnboardingPassword = shouldApplyOnboardingPassword({
      passwordMethod: input.passwordMethod,
      user,
    });
    const { error } = await adminSupabase.auth.admin.updateUserById(user.id, {
      ...(canApplyOnboardingPassword ? { password } : {}),
      email_confirm: true,
      user_metadata: { ...(user.user_metadata ?? {}), full_name: input.fullName },
      app_metadata: {
        ...(user.app_metadata ?? {}),
        password_method: canApplyOnboardingPassword ? input.passwordMethod : user.app_metadata?.password_method ?? "existing",
        password_change_required: canApplyOnboardingPassword ? input.passwordChangeRequired : user.app_metadata?.password_change_required ?? false,
        first_login_completed: canApplyOnboardingPassword ? false : user.app_metadata?.first_login_completed ?? true,
        ...(canApplyOnboardingPassword ? { deployiq_onboarding_test_user: true } : {}),
      },
    });
    if (error) throw error;
    passwordApplied = canApplyOnboardingPassword;
    existingAccountAuthRequired = !canApplyOnboardingPassword;
  }

  const { data: verifiedAuthUser, error: verifiedAuthUserError } = await adminSupabase.auth.admin.getUserById(user.id);
  if (verifiedAuthUserError || !verifiedAuthUser.user) {
    throw verifiedAuthUserError ?? new Error("Could not verify onboarding auth user.");
  }
  user = verifiedAuthUser.user;
  const accountSecurity = readAccountSecurityState(user);

  console.info("[identity-auth] credential sync result", {
    email,
    authUserId: user.id,
    created,
    passwordMethod: input.passwordMethod,
    passwordApplied,
    existingAccountAuthRequired,
    emailConfirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    incompleteOnboardingGenerated: isIncompleteOnboardingGeneratedUser(user),
    passwordChangeRequired: accountSecurity.passwordChangeRequired,
    firstLoginCompleted: accountSecurity.firstLoginCompleted,
  });

  const profileResult = await upsertUserProfileWithRetry(adminSupabase, {
    user_id: user.id,
    full_name: input.fullName,
    email,
    phone: input.phone,
    agency_id: null,
    assigned_project_ids: [],
    assigned_regions: [],
    assigned_states: [],
    status: "Active",
  });
  if (profileResult.error) throw profileResult.error;

  const { error: roleError } = await adminSupabase
    .schema("public")
    .from("user_roles")
    .upsert({ user_id: user.id, role: "client", client_id: null }, { onConflict: "user_id" });
  if (roleError) throw roleError;

  return {
    userId: user.id,
    email,
    created,
    passwordApplied,
    existingAccountAuthRequired,
    emailConfirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    accountSecurity,
  };
}
