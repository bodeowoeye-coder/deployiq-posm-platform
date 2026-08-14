import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

function argValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function assertDevelopmentResetAllowed() {
  if (process.env.VERCEL_ENV === "production" || process.env.DEPLOYIQ_RUNTIME_ENV === "production") {
    throw new Error("Refusing onboarding test reset in production runtime.");
  }
  if (process.env.DEPLOYIQ_ENABLE_ONBOARDING_TEST_RESET !== "1") {
    throw new Error("Set DEPLOYIQ_ENABLE_ONBOARDING_TEST_RESET=1 to enable onboarding test reset.");
  }
}

function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Missing Supabase admin environment.");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  assertDevelopmentResetAllowed();
  const email = argValue("email").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Usage: npm run test:reset-onboarding -- --email=test@example.com");
  }

  const supabase = createAdminSupabase();
  const abandonedAt = new Date().toISOString();
  const { data: drafts, error: draftLookupError } = await supabase
    .from("onboarding_drafts")
    .select("id, resume_token, status")
    .eq("email", email);
  if (draftLookupError) throw draftLookupError;

  const draftIds = (drafts ?? []).map((draft) => draft.id);
  if (draftIds.length > 0) {
    const { error: draftUpdateError } = await supabase
      .from("onboarding_drafts")
      .update({
        status: "abandoned",
        abandoned_at: abandonedAt,
        failure_reason: "development_onboarding_test_reset",
        last_updated_at: abandonedAt,
      })
      .in("id", draftIds);
    if (draftUpdateError) throw draftUpdateError;
  }

  const { data: authUsers, error: authLookupError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authLookupError) throw authLookupError;
  const authUser = (authUsers.users ?? []).find((user) => user.email?.toLowerCase() === email) ?? null;
  let authDeleted = false;
  let profileDeleted = false;
  let roleDeleted = false;
  let authSkippedReason = null;

  if (authUser) {
    const isDisposable = authUser.app_metadata?.deployiq_onboarding_test_user === true;
    if (!isDisposable) {
      authSkippedReason = "auth_user_not_marked_disposable";
    } else {
      const { data: role } = await supabase
        .schema("public")
        .from("user_roles")
        .select("client_id")
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (role?.client_id) {
        authSkippedReason = "auth_user_has_client_assignment";
      } else {
        const roleDelete = await supabase.schema("public").from("user_roles").delete().eq("user_id", authUser.id);
        if (roleDelete.error) throw roleDelete.error;
        roleDeleted = true;
        const profileDelete = await supabase.schema("public").from("user_profiles").delete().eq("user_id", authUser.id);
        if (profileDelete.error) throw profileDelete.error;
        profileDeleted = true;
        const authDelete = await supabase.auth.admin.deleteUser(authUser.id);
        if (authDelete.error) throw authDelete.error;
        authDeleted = true;
      }
    }
  }

  console.log(JSON.stringify({
    email,
    abandonedDraftCount: draftIds.length,
    authUserFound: Boolean(authUser),
    authDeleted,
    profileDeleted,
    roleDeleted,
    authSkippedReason,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
