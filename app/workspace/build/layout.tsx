import { redirect } from "next/navigation";
import { OperationalBuildWorkspaceShell } from "@/components/workspace/OperationalBuildWorkspaceShell";
import { OperationalBuildAccessError, resolveOperationalBuildAccess } from "@/lib/workspace/operationalBuildAccess";

export const dynamic = "force-dynamic";

export default async function OperationalBuildLayout({ children }: { children: React.ReactNode }) {
  try {
    const access = await resolveOperationalBuildAccess();
    return <OperationalBuildWorkspaceShell access={access}>{children}</OperationalBuildWorkspaceShell>;
  } catch (error) {
    if (error instanceof OperationalBuildAccessError && error.code === "authentication_required") redirect("/login?returnTo=%2Fworkspace%2Fbuild");
    if (error instanceof OperationalBuildAccessError && error.code === "customer_admin_workspace") redirect("/workspace/admin");
    return <main className="grid min-h-[100dvh] place-items-center bg-slate-100 px-5"><section className="max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">DeployIQ Build</p><h1 className="mt-3 text-2xl font-black">Operational access is unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your account does not currently have an authorized Build project scope on this device.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><a href="/workspace/notifications" className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold">Open Notifications</a><a href="/logout" className="min-h-11 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white">Sign out</a></div></section></main>;
  }
}
