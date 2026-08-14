import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function NewInstallerPage() {
  redirect("/workspace/admin/team");
}
