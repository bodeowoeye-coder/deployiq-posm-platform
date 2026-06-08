export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="brand-logo flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-lg font-black tracking-tight text-orange-500 shadow-sm">
        DQ
      </div>
      <div className="min-w-0">
        <div className="whitespace-normal break-words text-lg font-black leading-none tracking-tight text-slate-950">
          DeployIQ<span className="align-super text-xs">&trade;</span>
        </div>
        {!compact ? (
          <div className="mt-1 whitespace-normal break-words text-[10px] font-bold uppercase leading-snug tracking-[0.24em] text-slate-500 sm:text-xs sm:tracking-[0.28em]">
            Field Deployment Intelligence Platform
          </div>
        ) : null}
      </div>
    </div>
  );
}
