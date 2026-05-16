import { ClientDashboard } from "@/components/ClientDashboard";
import { requireRole } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClientPage() {
  const context = await requireRole(["client"]);

  if (!context.client || !context.role.client_id) {
    throw new Error("Client users must be linked to a client record.");
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("client_id", context.role.client_id)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const { data: brands } = await supabase
    .from("brands")
    .select("brand_name")
    .eq("client_id", context.role.client_id)
    .order("brand_name", { ascending: true });

  return (
    <ClientDashboard
      client={context.client}
      submissions={(data ?? []) as Submission[]}
      availableBrands={(brands ?? []).map((brand) => brand.brand_name)}
    />
  );
}
