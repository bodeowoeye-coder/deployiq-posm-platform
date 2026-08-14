type Props = {
  title: string;
  description: string;
  items?: string[];
};

export function WorkspaceModulePlaceholder({ title, description, items = [] }: Props) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Customer Workspace</p>
          <h2 className="mt-2 text-xl font-bold">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
          <h3 className="text-base font-bold text-slate-950">Workspace module foundation</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This area is being prepared for your workspace and will connect to the same DeployIQ tools your team already uses.
          </p>
          {items.length > 0 ? (
            <ul className="mt-4 grid gap-2 text-sm text-slate-700">
              {items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-2 w-2 rounded-full bg-orange-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
      <aside className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-sm font-bold text-emerald-900">Workspace access protected</p>
        <p className="mt-2 text-sm leading-6 text-emerald-800">
          Your workspace pages stay connected to your organisation, product and administrator permissions.
        </p>
      </aside>
    </div>
  );
}
