import { AdminRoutePage } from "@/app/admin/AdminRoutePage";

export const dynamic = "force-dynamic";

export default async function CommercialPricingPage() {
  return <AdminRoutePage initialView="commercial-pricing" requestedPath="/admin/commercial/pricing" />;
}
