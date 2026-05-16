export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="brand-logo flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-[9px] font-bold text-white shadow-sm ring-[3px] ring-orange-300">
        DeployIQ
      </div>
      <div className="min-w-0">
        <div className="whitespace-normal break-words text-sm font-bold leading-snug text-slate-950">Impact Visibility Ltd</div>
        {!compact ? <div className="whitespace-normal break-words text-xs leading-snug text-slate-500">POSM Deployment &amp; Intelligence Platform</div> : null}
      </div>
    </div>
  );
}
