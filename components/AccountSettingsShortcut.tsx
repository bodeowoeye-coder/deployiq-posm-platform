"use client";

import Link from "next/link";
import { Settings2 } from "lucide-react";

type AccountRole = "admin" | "client" | "installer";

const roleTargets: Record<AccountRole, string> = {
  admin: "/admin/profile",
  client: "/client/account",
  installer: "/installer/history"
};

export function AccountSettingsShortcut({
  role,
  className = ""
}: {
  role: AccountRole | null | undefined;
  className?: string;
}) {
  if (!role) return null;

  return (
    <Link
      href={roleTargets[role]}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 ${className}`}
    >
      <Settings2 aria-hidden size={16} />
      Account Settings
    </Link>
  );
}
