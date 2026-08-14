#!/usr/bin/env node

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

function assertSafeRuntime() {
  if (process.env.VERCEL_ENV === "production" || process.env.DEPLOYIQ_RUNTIME_ENV === "production") {
    throw new Error("Refusing to run customer-admin backfill in production.");
  }
  if (process.env.DEPLOYIQ_ENABLE_CUSTOMER_ADMIN_BACKFILL !== "1") {
    throw new Error("Set DEPLOYIQ_ENABLE_CUSTOMER_ADMIN_BACKFILL=1 to run this development backfill.");
  }
}

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service-role environment.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

assertSafeRuntime();

const db = supabase();
const { data: jobs, error } = await db
  .from("provisioning_jobs")
  .select("id, acquisition_draft_id, status, result_data")
  .eq("status", "completed")
  .eq("product_key", "retail");

if (error) throw error;

let updated = 0;
let skipped = 0;

for (const job of jobs ?? []) {
  const draftId = job.acquisition_draft_id;
  const clientId = job.result_data?.clientId || job.result_data?.organisationId || job.result_data?.workspaceId;
  const userId = job.result_data?.adminUserId;
  if (!draftId || !clientId || !userId) {
    skipped += 1;
    continue;
  }

  const { data: draft } = await db
    .from("onboarding_drafts")
    .select("id, authenticated_user_id, status, draft_data")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft || draft.authenticated_user_id !== userId || draft.status !== "provisioned") {
    skipped += 1;
    continue;
  }

  const { data: customerAdminRole } = await db
    .from("workspace_roles")
    .select("id")
    .eq("client_id", clientId)
    .eq("role_key", "customer_admin")
    .maybeSingle();

  const { error: membershipError } = await db
    .from("workspace_memberships")
    .upsert({
      client_id: clientId,
      user_id: userId,
      role_id: customerAdminRole?.id ?? null,
      role_key: "customer_admin",
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id,user_id" });
  if (membershipError) throw membershipError;
  updated += 1;
}

console.info(JSON.stringify({ updated, skipped }, null, 2));
