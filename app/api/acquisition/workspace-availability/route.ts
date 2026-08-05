import { NextResponse } from "next/server";
import { getOnboardingDraftByToken } from "@/lib/commercial/onboarding/service";
import { validateWorkspaceSlug } from "@/lib/acquisition/identity";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

/**
 * Check whether a workspace slug is available.
 * Looks for active drafts and provisioning jobs that have claimed this slug.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";

    const formatError = validateWorkspaceSlug(slug);
    if (formatError) {
      return NextResponse.json({ available: false, reason: formatError }, { status: 400 });
    }

    // Check active acquisition drafts for this slug
    const supabase = createAdminSupabase();
    const { data, error } = await supabase
      .from("onboarding_drafts")
      .select("id, status")
      .contains("draft_data", { workspaceSlug: slug })
      .in("status", [
        "started", "organisation_details_complete", "product_selected",
        "product_setup_complete", "capacity_complete", "pricing_complete",
        "account_pending", "account_created",
      ])
      .limit(1);

    if (error) throw error;

    const draftTaken = (data ?? []).length > 0;

    const { data: jobs, error: jobError } = await supabase
      .from("provisioning_jobs")
      .select("id, status")
      .eq("workspace_slug", slug)
      .in("status", ["queued", "running", "completed"])
      .limit(1);

    if (jobError && jobError.code !== "42P01" && jobError.code !== "PGRST205") throw jobError;

    const taken = draftTaken || (jobs ?? []).length > 0;

    return NextResponse.json({
      available: !taken,
      slug,
      ...(taken ? { reason: "This workspace URL is already taken." } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
