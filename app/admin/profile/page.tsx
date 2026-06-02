import { AdminRoutePage } from "@/app/admin/AdminRoutePage";

export const dynamic = "force-dynamic";

export default async function AdminProfilePage() {
  return <AdminRoutePage initialView="profile" requestedPath="/admin/profile" />;
}
