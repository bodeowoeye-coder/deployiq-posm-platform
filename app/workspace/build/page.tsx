import Link from "next/link";
import { listMobileBuildActivities } from "@/lib/build/mobile/activities";
import { resolveOperationalBuildAccess } from "@/lib/workspace/operationalBuildAccess";

export const dynamic = "force-dynamic";

export default async function OperationalBuildPage() {
  const access = await resolveOperationalBuildAccess();
  const activities = await listMobileBuildActivities(access);
  const attention = activities.filter((item) => ["blocked", "changes_required", "submitted_for_review"].includes(item.status));
  return <div className="space-y-5 pb-24 lg:pb-0"><section className="rounded-xl bg-slate-950 p-6 text-white shadow-sm"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">DeployIQ Build</p><h1 className="mt-2 text-3xl font-black">Operational Home</h1><p className="mt-2 text-sm text-slate-300">Your authorized projects, Activities and field attention in one mobile workspace.</p></section><section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Projects" value={access.projects.length}/><Metric label="Activities" value={activities.length}/><Metric label="Attention" value={attention.length}/><Metric label="Pending sync" value="On device"/></section><section className="grid gap-3 sm:grid-cols-2"><Action href="/workspace/build/activities" title="My Activities" copy="Open assigned, supervised and authorized execution work."/><Action href="/workspace/build/projects" title="My Projects" copy="Browse your server-authorized Build project scope."/><Action href="/workspace/notifications" title="Notifications" copy="Open authorized operational alerts and deep links."/><Action href="/workspace/build/sync" title="Pending Synchronization" copy="Review locally retained evidence and retry safely."/></section>{attention.length ? <section className="rounded-xl border border-orange-200 bg-orange-50 p-5"><h2 className="font-black text-orange-950">Needs attention</h2><ul className="mt-3 space-y-2">{attention.slice(0,5).map((item)=><li key={item.id}><Link className="text-sm font-bold text-orange-800 underline" href={`/workspace/build/projects/${item.projectId}/activities/${item.id}`}>{item.name} · {item.status.replaceAll("_", " ")}</Link></li>)}</ul></section>:null}</div>;
}

function Metric({label,value}:{label:string;value:string|number}) { return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
function Action({href,title,copy}:{href:string;title:string;copy:string}) { return <Link href={href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-orange-300"><h2 className="text-lg font-black">{title}</h2><p className="mt-2 text-sm text-slate-600">{copy}</p></Link>; }
