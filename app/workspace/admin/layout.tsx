import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { CustomerWorkspaceShell } from "@/components/workspace/CustomerWorkspaceShell";
import {
  CustomerWorkspaceRedirect,
  CustomerWorkspaceTransientError,
  requireCustomerWorkspace,
} from "@/lib/workspace/customerAdmin";
import { getCustomerWorkspaceProjectScope } from "@/lib/workspace/projectScope";
import { workspaceNotificationsEnabled } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function CustomerWorkspaceAdminLayout({ children }: { children: React.ReactNode }) {
  let workspace;
  try {
    workspace = await requireCustomerWorkspace();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    if (error instanceof CustomerWorkspaceTransientError) {
      return (
        <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6 text-slate-950">
          <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-[var(--accent)] motion-safe:animate-spin" aria-hidden="true" />
            <h1 className="text-xl font-bold">We're having trouble loading your workspace.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Please try again. Your account and workspace have not been changed.</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <a
                href="/workspace/admin"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                Try Again
              </a>
              <SignOutButton className="min-h-11 rounded-lg px-4 text-sm" />
            </div>
          </section>
        </main>
      );
    }
    throw error;
  }

  const projectScope = await getCustomerWorkspaceProjectScope(workspace);
  const notificationEnabled = await workspaceNotificationsEnabled(workspace);
  return <CustomerWorkspaceShell workspace={workspace} projectScope={projectScope} notificationEnabled={notificationEnabled}>{children}</CustomerWorkspaceShell>;
}
