import { redirect } from "next/navigation";
import { defaultRouteForRole, getCurrentUserContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  redirect(defaultRouteForRole(context.role.role));
}
