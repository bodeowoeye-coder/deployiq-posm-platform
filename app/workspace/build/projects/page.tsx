import Link from "next/link";
import { resolveOperationalBuildAccess } from "@/lib/workspace/operationalBuildAccess";

export const dynamic = "force-dynamic";

export default async function OperationalBuildProjectsPage() {
  const access = await resolveOperationalBuildAccess();
  return <div className="space-y-5">
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Operational Build Workspace</p><h1 className="mt-2 text-3xl font-black">My Projects</h1><p className="mt-2 text-sm text-slate-600">Only active Build projects authorized by your workspace role and assignments are shown.</p></section>
    <ul className="grid gap-4 xl:grid-cols-2">{access.projects.map((project) => <li key={project.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-500">{project.projectType}</p><h2 className="mt-2 text-xl font-black">{project.name}</h2>{project.code ? <p className="mt-1 font-mono text-xs text-slate-500">{project.code}</p> : null}</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{project.status || "Status unavailable"}</span></div><Link href={`/workspace/build/projects/${project.id}`} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700">Open project</Link></li>)}</ul>
  </div>;
}
