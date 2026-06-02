import { AdminRoutePage } from "@/app/admin/AdminRoutePage";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  return <AdminRoutePage initialView="dashboard" requestedPath="/admin" />;
}
