import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SubmitLayout({ children }: { children: ReactNode }) {
  await requireRole(["installer", "admin"]);
  return children;
}
