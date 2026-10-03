import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { AccessControlError, getAuthenticatedUserContext } from "@/lib/accessControl";
import { defaultDestinationForRole } from "@/lib/authDestinations";
import {
  getOperationalNotificationDestination,
  requireOperationalNotificationContext,
} from "@/lib/workspace/operationalNotifications";

export const dynamic = "force-dynamic";

export default async function OperationalNotificationsLayout({ children }: { children: React.ReactNode }) {
  let auth;
  try {
    auth = await getAuthenticatedUserContext();
  } catch (error) {
    if (error instanceof AccessControlError) redirect("/login?returnTo=%2Fworkspace%2Fnotifications");
    throw error;
  }

  if (auth.role !== "client" || !auth.client_id) {
    redirect(defaultDestinationForRole(auth.role, auth.client_id));
  }

  const canonicalDestination = await getOperationalNotificationDestination({
    userId: auth.user_id,
    clientId: auth.client_id,
  });
  if (canonicalDestination === "/workspace/admin") redirect(canonicalDestination);
  if (canonicalDestination !== "/workspace/notifications") notFound();

  const context = await requireOperationalNotificationContext();
  return <div className="min-h-[100dvh] bg-slate-100 text-slate-950"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6"><div><Link href="/workspace/notifications" className="text-xl font-black tracking-tight">DeployIQ<span className="text-orange-600">™</span></Link><p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Operational Workspace · {context.organisationName}</p></div><div className="flex items-center gap-3"><Link href="/workspace/notifications" className="min-h-11 rounded-lg px-4 py-3 text-sm font-bold text-orange-700 hover:bg-orange-50">Notifications</Link><SignOutButton className="min-h-11 rounded-lg px-4 text-sm" /></div></div></header><main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main></div>;
}
