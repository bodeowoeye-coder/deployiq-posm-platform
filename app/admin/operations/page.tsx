import { AdminRoutePage } from "@/app/admin/AdminRoutePage";

export const dynamic = "force-dynamic";

// The legacy operational dashboard and its views remain reachable while /admin hosts the
// platform-owner landing experience.
export default async function AdminOperationsPage() {
  return <AdminRoutePage initialView="dashboard" requestedPath="/admin/operations" />;
}
