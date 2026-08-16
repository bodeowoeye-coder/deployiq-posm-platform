import { requireRole } from "@/lib/auth";
import { PricingStudio } from "@/components/PricingStudio";

export const dynamic = "force-dynamic";

/**
 * Dedicated Pricing Studio route.
 * Only loads auth context — no submissions, projects, clients or unrelated dashboard data.
 */
// PricingStudio renders its own full-page chrome, so it is intentionally not wrapped in
// CoreAdminShell; wrapping it would produce a duplicate header and sign-out control.
export default async function PricingStudioPage() {
  const context = await requireRole(["admin"], "/admin/commercial/pricing");

  return (
    <PricingStudio currentUserEmail={context.user.email ?? null} />
  );
}

