import { AdminRoutePage } from "@/app/admin/AdminRoutePage";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionsPage() {
  return <AdminRoutePage initialView="submissions" requestedPath="/admin/submissions" />;
}
