import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth";
import { defaultDestinationForResolvedUser } from "@/lib/authDestinations";

export default async function Home() {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  redirect(await defaultDestinationForResolvedUser({ role: context.role.role, userId: context.user.id, clientId: context.role.client_id, email: context.user.email }));
}
