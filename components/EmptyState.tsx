import type { ReactNode } from "react";

export function EmptyState({ title, message, icon }: { title: string; message: string; icon?: ReactNode }) {
  return (
    <div className="flex min-h-32 min-w-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
      {icon ? <div className="mb-3 text-slate-400">{icon}</div> : null}
      <div className="whitespace-normal break-words text-sm font-semibold leading-snug text-slate-700">{title}</div>
      <p className="mt-1 max-w-md whitespace-normal break-words text-sm leading-snug text-slate-500">{message}</p>
    </div>
  );
}
