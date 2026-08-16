import { CoreAdminShell } from "@/components/admin/CoreAdminShell";

export default function CustomerManagementLayout({ children }: { children: React.ReactNode }) {
  return <CoreAdminShell>{children}</CoreAdminShell>;
}
