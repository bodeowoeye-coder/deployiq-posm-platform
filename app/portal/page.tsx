import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth";

export default async function PortalPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  redirect(context.role.role === "admin" ? "/admin" : context.role.role === "client" ? "/client" : "/submit");
}
