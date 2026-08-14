import { redirect } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { resolveWorkspaceContinuationToken } from "@/lib/acquisition/provisioning/activationNotifications";

export const dynamic = "force-dynamic";

export default async function WorkspaceContinuationPage({
  searchParams,
}: {
  searchParams?: { token?: string };
}) {
  const token = typeof searchParams?.token === "string" ? searchParams.token.trim() : "";
  const continuation = token ? await resolveWorkspaceContinuationToken(token) : null;

  if (continuation?.adminWorkspaceUrl) {
    redirect(continuation.adminWorkspaceUrl);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-xl rounded-lg border border-white/10 bg-white p-6 text-slate-900 shadow-2xl shadow-black/20">
        <BrandMark />
        <h1 className="mt-8 text-2xl font-bold">Workspace link unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This secure workspace link is invalid, expired, or has already been used. Sign in with your verified administrator account to continue.
        </p>
        <a
          href="/login?returnTo=%2Fworkspace%2Fadmin"
          className="mt-6 inline-flex rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Sign in
        </a>
      </div>
    </main>
  );
}
