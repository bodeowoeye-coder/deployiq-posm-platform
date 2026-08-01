import { requireRole } from "@/lib/auth";
import { PricingStudio } from "@/components/PricingStudio";

export const dynamic = "force-dynamic";

/**
 * Dedicated Pricing Studio route.
 * Only loads auth context — no submissions, projects, clients or unrelated dashboard data.
 */
export default async function PricingStudioPage() {
  const context = await requireRole(["admin"], "/admin/commercial/pricing");

  return (
    <PricingStudio currentUserEmail={context.user.email ?? null} />
  );
}

