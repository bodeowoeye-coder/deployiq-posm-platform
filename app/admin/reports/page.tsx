import { AdminRoutePage } from "@/app/admin/AdminRoutePage";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  return <AdminRoutePage initialView="reports" requestedPath="/admin/reports" />;
}
