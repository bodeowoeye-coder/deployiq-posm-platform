export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <div className="brand-logo flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xl font-black tracking-tight text-orange-500 shadow-sm">
        DQ
      </div>
      <div className="min-w-0">
        <div className="whitespace-normal break-words text-2xl font-black leading-none tracking-tight text-slate-950">
          DeployIQ<span className="align-super text-xs">&trade;</span>
        </div>
        {!compact ? (
          <div className="mt-2 whitespace-normal break-words text-xs font-bold uppercase leading-snug tracking-[0.32em] text-slate-500">
            Field Deployment Intelligence Platform
          </div>
        ) : null}
      </div>
    </div>
  );
}
