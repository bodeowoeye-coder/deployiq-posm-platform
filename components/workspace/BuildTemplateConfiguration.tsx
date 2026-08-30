"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type { CanonicalBuildProject } from "@/lib/build/projects/types";
import type { BuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";
import type { BuildActivityTemplateDependency } from "@/lib/build/dependencies/types";
import type { BuildResource } from "@/lib/build/resources/types";
import type { BuildActivityCategory, BuildActivityTemplate, BuildChecklistTemplate, BuildWorkPackageTemplate } from "@/lib/build/templates/types";

type Site = BuildProjectWorkspaceOverview["sites"][number];
type WorkPackage = BuildProjectWorkspaceOverview["workPackages"][number];
type Configuration = {
  bundle: { template: BuildWorkPackageTemplate; categories: BuildActivityCategory[]; activities: BuildActivityTemplate[]; checklists: BuildChecklistTemplate[] };
  dependencies: BuildActivityTemplateDependency[];
  resourceRequirements: Array<{ id: string; activity_template_id: string | null; resource_name: string | null; quantity: number; unit_of_measure: string; requirement_type: string }>;
  templateValidation: { errors: string[]; warnings: string[] };
  instantiatePreview: { hierarchyCounts: { categories: number; activities: number; checklists: number; dependencies: number; resourceRequirements: number } };
};
type Context = { projectId: string; siteId: string; workPackageId: string; templateId: string };
type ConfigurationSection = "overview" | "categories" | "activities" | "dependencies" | "resources";

const CONFIGURATION_SECTIONS: Array<{ id: ConfigurationSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "categories", label: "Categories" },
  { id: "activities", label: "Activities" },
  { id: "dependencies", label: "Dependencies" },
  { id: "resources", label: "Resources" },
];

const CONTROL = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200";
const ACTION = "rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60";

async function send(url: string, method: "POST" | "PATCH", payload: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(response.status >= 500 ? "The configuration could not be saved." : typeof body?.error === "string" ? body.error : "The configuration could not be saved.");
  return body;
}

export function BuildTemplateConfiguration({ project, site, workPackage, configuration, resources, canConfigure }: {
  project: CanonicalBuildProject;
  site: Site;
  workPackage: WorkPackage;
  configuration: Configuration;
  resources: BuildResource[];
  canConfigure: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [activeSection, setActiveSection] = useState<ConfigurationSection>("overview");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [checklistActivityId, setChecklistActivityId] = useState<string | null>(null);
  const template = configuration.bundle.template;
  const context: Context = { projectId: project.id, siteId: site.id, workPackageId: workPackage.id, templateId: template.id };
  const categoryById = new Map(configuration.bundle.categories.map((item) => [item.id, item]));
  const activityById = new Map(configuration.bundle.activities.map((item) => [item.id, item]));
  const activityCountByCategory = new Map<string, number>();
  const checklistsByActivity = new Map<string, BuildChecklistTemplate[]>();
  const checklistCountByActivity = new Map<string, number>();
  const resourceCountByActivity = new Map<string, number>();
  for (const item of configuration.bundle.activities) activityCountByCategory.set(item.activity_category_id, (activityCountByCategory.get(item.activity_category_id) ?? 0) + 1);
  for (const item of configuration.bundle.checklists) {
    checklistCountByActivity.set(item.activity_template_id, (checklistCountByActivity.get(item.activity_template_id) ?? 0) + 1);
    checklistsByActivity.set(item.activity_template_id, [...(checklistsByActivity.get(item.activity_template_id) ?? []), item]);
  }
  for (const item of configuration.resourceRequirements) {
    if (item.activity_template_id) resourceCountByActivity.set(item.activity_template_id, (resourceCountByActivity.get(item.activity_template_id) ?? 0) + 1);
  }

  async function run(task: () => Promise<unknown>, success: string) {
    try { setBusy(true); setMessage(""); await task(); setMessage(success); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The configuration could not be saved."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <nav aria-label="Template context" className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <Link href={`/workspace/admin/projects/${project.id}/work-packages`} className="text-orange-700">Work Packages</Link><span>›</span><span>{workPackage.name}</span><span>›</span><span>{template.name}</span>
      </nav>
      <nav aria-label="Template configuration" className="overflow-x-auto rounded-xl border border-slate-200 bg-white px-2 shadow-sm">
        <div className="flex min-w-max items-center gap-1">
          {CONFIGURATION_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={() => setActiveSection(section.id)}
              className={`border-b-2 px-4 py-3 text-sm font-bold transition ${activeSection === section.id ? "border-orange-600 text-orange-700" : "border-transparent text-slate-600 hover:text-slate-950"}`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </nav>
      {activeSection === "overview" ? <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Operational Template</p><h3 className="mt-2 text-2xl font-bold text-slate-950">{template.name}</h3><p className="mt-1 font-mono text-xs text-slate-500">{template.code}</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${canConfigure ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{canConfigure ? "Tenant configuration" : "Global template · View only"}</span>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><ContextItem label="Project" value={project.project_name} /><ContextItem label="Site" value={`${site.name} · ${site.siteCode}`} /><ContextItem label="Work Package" value={`${workPackage.name} · ${workPackage.code}`} /><ContextItem label="Status" value={template.status} /></dl>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(configuration.instantiatePreview.hierarchyCounts).map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>
        {!canConfigure ? <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">This shared template can be reviewed here. Its definition is managed by DeployIQ Core Admin.</p> : null}
        {canConfigure ? <details className="mt-5 rounded-lg border border-orange-200 bg-orange-50/40 p-3"><summary className="cursor-pointer text-sm font-bold text-orange-800">Edit template details</summary><form className="mt-3 grid gap-3 md:grid-cols-3" onSubmit={(event)=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>;void run(()=>send("/api/build/templates","PATCH",{...context,id:template.id,code:values.code,name:values.name,description:values.description||null,status:values.status}),"Template updated.");}}><Input name="code" label="Code" required defaultValue={template.code}/><Input name="name" label="Name" required defaultValue={template.name}/><Input name="description" label="Description" defaultValue={template.description ?? ""}/><Select name="status" label="Status" options={[template.status,"draft","active"].filter((value,index,list)=>list.indexOf(value)===index)}/><div className="flex items-end gap-3"><button disabled={busy} className={ACTION}>Save</button><ArchiveButton busy={busy} onClick={()=>run(()=>send("/api/build/templates","PATCH",{...context,id:template.id,action:"archive"}),"Template archived.")}/></div></form></details> : null}
        {message ? <p role="status" className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-900">{message}</p> : null}
      </section> : null}

      {activeSection === "categories" ? <Section title="Activity Categories" description="Organise the work sequence into clear construction stages.">
        <div className="grid gap-3">{configuration.bundle.categories.map((category) => <EditableCategory key={category.id} category={category} activityCount={activityCountByCategory.get(category.id) ?? 0} editing={editingCategoryId === category.id} onEdit={() => setEditingCategoryId((current) => current === category.id ? null : category.id)} context={context} canConfigure={canConfigure} busy={busy} run={run} />)}</div>
        {canConfigure ? <CreateForm title="Add Category" busy={busy} fields={<><Input name="code" label="Code" required /><Input name="name" label="Name" required /><Input name="sequence" label="Order" type="number" defaultValue="1" /><Select name="categoryType" label="Type" options={["preparation","execution","inspection","testing","commissioning","close_out","general"]} /></>} onSubmit={(values) => run(() => send("/api/build/activity-categories", "POST", { ...context, code: values.code, name: values.name, sequence: Number(values.sequence), categoryType: values.categoryType, status: "active" }), "Category added.")} /> : null}
      </Section> : null}

      {activeSection === "activities" ? <Section title="Activities" description="Define the work activities required for this Operational Template.">
        <div className="grid gap-3">{configuration.bundle.activities.map((activity) => {
          const editing = editingActivityId === activity.id;
          const checklistOpen = checklistActivityId === activity.id;
          const checklists = checklistsByActivity.get(activity.id) ?? [];
          return <article key={activity.id} className={`rounded-lg border bg-white p-4 ${editing ? "border-orange-300 shadow-sm" : "border-slate-200"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h5 className="font-bold text-slate-950">{activity.sequence}. {activity.name}</h5><p className="mt-1 text-xs font-semibold text-slate-500">{categoryById.get(activity.activity_category_id)?.name ?? "Category unavailable"}</p><p className="mt-1 font-mono text-xs text-slate-500">{activity.code}</p></div><div className="text-right"><p className="text-xs font-bold capitalize text-slate-600">{activity.estimated_duration ?? 0} {activity.duration_unit} · {activity.status}</p><p className="mt-2 text-xs text-slate-500">Checklist: {checklistCountByActivity.get(activity.id) ?? 0} items · Resources: {resourceCountByActivity.get(activity.id) ?? 0}</p></div></div><div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => { setEditingActivityId((current) => current === activity.id ? null : activity.id); setChecklistActivityId(null); }} className="text-sm font-bold text-orange-700">{editing ? "Close editor" : "View / Edit"}</button></div>{editing ? <div className="mt-4 border-t border-slate-100 pt-4">{activity.description ? <p className="mb-4 text-sm text-slate-600">{activity.description}</p> : null}{canConfigure ? <EditActivity activity={activity} categories={configuration.bundle.categories} context={context} busy={busy} run={run} /> : null}<div className="mt-4 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">Checklist</p><p className="text-xs text-slate-500">{checklists.length} {checklists.length === 1 ? "item" : "items"}</p></div><button type="button" onClick={() => setChecklistActivityId((current) => current === activity.id ? null : activity.id)} className="text-sm font-bold text-orange-700">{checklistOpen ? "Hide Checklist" : "View Checklist"}</button></div>{checklistOpen ? <ChecklistList activity={activity} checklists={checklists} context={context} canConfigure={canConfigure} busy={busy} run={run} /> : null}</div> : null}</article>;
        })}</div>
        {canConfigure ? <CreateForm title="Add Activity" busy={busy} fields={<><Select name="activityCategoryId" label="Category" options={configuration.bundle.categories.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /><Input name="code" label="Code" required /><Input name="name" label="Name" required /><Input name="sequence" label="Order" type="number" defaultValue="1" /><Input name="estimatedDuration" label="Duration" type="number" defaultValue="1" /><Select name="durationUnit" label="Unit" options={["hours","days","weeks"]} /></>} onSubmit={(values) => run(() => send("/api/build/activity-templates", "POST", { ...context, activityCategoryId: values.activityCategoryId, code: values.code, name: values.name, sequence: Number(values.sequence), estimatedDuration: Number(values.estimatedDuration), durationUnit: values.durationUnit, status: "active", mandatory: true }), "Activity added.")} /> : null}
      </Section> : null}

      {activeSection === "dependencies" ? <Section title="Dependencies" description="Define the required sequence between activities.">
        <div className="grid gap-3">{configuration.dependencies.map((dependency) => <ConfigCard key={dependency.id} title={`${activityById.get(dependency.predecessor_activity_template_id)?.name ?? "Activity"} → ${activityById.get(dependency.successor_activity_template_id)?.name ?? "Activity"}`} detail={`${dependency.dependency_type} · ${dependency.lag_value} ${dependency.lag_unit}`} action={canConfigure ? <ArchiveButton busy={busy} onClick={() => run(() => send("/api/build/dependencies", "PATCH", { ...context, id: dependency.id, action: "archive" }), "Dependency archived.")} /> : null} />)}</div>
        {canConfigure ? <CreateForm title="Add Dependency" busy={busy} fields={<><Select name="predecessorActivityTemplateId" label="First activity" options={configuration.bundle.activities.map(option)} /><Select name="successorActivityTemplateId" label="Following activity" options={configuration.bundle.activities.map(option)} /><Select name="dependencyType" label="Relationship" options={[{value:"FS",label:"Finish to Start"},{value:"SS",label:"Start to Start"},{value:"FF",label:"Finish to Finish"},{value:"SF",label:"Start to Finish"}]} /><Input name="lagValue" label="Lag" type="number" defaultValue="0" /><Select name="lagUnit" label="Lag unit" options={["hours","days","weeks"]} /></>} onSubmit={(values) => run(() => send("/api/build/dependencies", "POST", { ...context, predecessorActivityTemplateId: values.predecessorActivityTemplateId, successorActivityTemplateId: values.successorActivityTemplateId, dependencyType: values.dependencyType, lagValue: Number(values.lagValue), lagUnit: values.lagUnit, mandatory: true }), "Dependency added.")} /> : null}
      </Section> : null}

      {activeSection === "resources" ? <Section title="Resource Requirements" description="Define the resources expected to perform the work.">
        <div className="grid gap-3">{configuration.resourceRequirements.map((requirement) => <ConfigCard key={requirement.id} title={requirement.resource_name ?? "Resource"} detail={`${requirement.quantity} ${requirement.unit_of_measure} · ${requirement.requirement_type}${requirement.activity_template_id ? ` · ${activityById.get(requirement.activity_template_id)?.name ?? "Activity"}` : ""}`} action={canConfigure ? <ArchiveButton busy={busy} onClick={() => run(() => send("/api/build/resource-requirements", "PATCH", { ...context, id: requirement.id, action: "archive" }), "Resource requirement archived.")} /> : null} />)}</div>
        {canConfigure ? <CreateForm title="Add Resource Requirement" busy={busy} fields={<><Select name="resourceId" label="Resource" options={resources.filter((item) => item.status === "active" && !item.archived_at).map((item) => ({value:item.id,label:`${item.code} · ${item.name}`}))} /><Select name="activityTemplateId" label="Activity" options={configuration.bundle.activities.map(option)} /><Input name="quantity" label="Quantity" type="number" defaultValue="1" /><Input name="unitOfMeasure" label="Unit" required /><Select name="requirementType" label="Requirement" options={["mandatory","estimated","optional"]} /></>} onSubmit={(values) => run(() => send("/api/build/resource-requirements", "POST", { ...context, resourceId: values.resourceId, activityTemplateId: values.activityTemplateId, quantity: Number(values.quantity), unitOfMeasure: values.unitOfMeasure, requirementType: values.requirementType, mandatory: values.requirementType === "mandatory" }), "Resource requirement added.")} /> : null}
      </Section> : null}

      {activeSection === "overview" ? <Section title="Create a Tenant Template" description="Start a separate tenant-owned template and assign it to this Work Package.">
        <CreateForm title="New Operational Template" busy={busy} fields={<><Input name="code" label="Template code" required /><Input name="name" label="Template name" required /><Input name="description" label="Description" /></>} onSubmit={(values) => run(async () => { const created = await send("/api/build/templates", "POST", { ...context, code: values.code, name: values.name, description: values.description || null, status: "active", isGlobal: false }); const templateId = created?.template?.id; if (!templateId) throw new Error("The template was created but could not be assigned."); await send("/api/build/templates", "PATCH", { ...context, action: "assign", templateId }); }, "Tenant template created and assigned.")} />
      </Section> : null}
    </div>
  );
}

function ChecklistList({ activity, checklists, context, canConfigure, busy, run }: { activity: BuildActivityTemplate; checklists: BuildChecklistTemplate[]; context: Context; canConfigure: boolean; busy: boolean; run: (task: () => Promise<unknown>, success: string) => Promise<void> }) {
  return <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Checklist</p><ul className="mt-2 space-y-2">{checklists.map((item) => <li key={item.id} className="rounded border border-slate-100 p-2 text-sm text-slate-700"><div className="flex items-center justify-between gap-3"><span>{item.sequence}. {item.item}{item.requires_photo ? " · Photo required" : ""}{item.requires_comment ? " · Comment required" : ""}</span>{canConfigure ? <ArchiveButton busy={busy} onClick={() => run(() => send("/api/build/checklist-templates", "PATCH", { ...context, activityTemplateId: activity.id, id: item.id, action: "archive" }), "Checklist item archived.")} /> : null}</div>{canConfigure ? <details className="mt-2"><summary className="cursor-pointer text-xs font-bold text-orange-700">Edit checklist item</summary><form className="mt-2 grid gap-2 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const values=Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>; void run(() => send("/api/build/checklist-templates", "PATCH", { ...context, activityTemplateId: activity.id, id:item.id, item:values.item, sequence:Number(values.sequence), description:values.description||null, acceptanceType:values.acceptanceType||null }), "Checklist item updated."); }}><Input name="item" label="Item" required defaultValue={item.item} /><Input name="sequence" label="Order" type="number" defaultValue={String(item.sequence)} /><Input name="description" label="Description" defaultValue={item.description ?? ""} /><button disabled={busy} className={ACTION}>Save</button></form></details> : null}</li>)}</ul>{canConfigure ? <CreateForm title="Add Checklist Item" busy={busy} compact fields={<><Input name="item" label="Checklist item" required /><Input name="sequence" label="Order" type="number" defaultValue={String(checklists.length + 1)} /><Input name="description" label="Description" /><Input name="acceptanceType" label="Acceptance type" /></>} onSubmit={(values) => run(() => send("/api/build/checklist-templates", "POST", { ...context, activityTemplateId: activity.id, item: values.item, sequence: Number(values.sequence), description: values.description || null, acceptanceType: values.acceptanceType || null, mandatory: true }), "Checklist item added.")} /> : null}</div>;
}

function EditableCategory({ category, activityCount, editing, onEdit, context, canConfigure, busy, run }: { category: BuildActivityCategory; activityCount: number; editing: boolean; onEdit: () => void; context: Context; canConfigure: boolean; busy: boolean; run: (task: () => Promise<unknown>, success: string) => Promise<void> }) {
  return <div className={`rounded-lg border bg-white p-3 ${editing ? "border-orange-300" : "border-slate-200"}`}><div className="flex items-center justify-between gap-4"><div><p className="font-semibold text-slate-900">{category.sequence}. {category.name}</p><p className="mt-1 text-xs capitalize text-slate-500">{category.code} · {category.category_type.replaceAll("_", " ")} · {category.status}</p><p className="mt-2 text-xs font-semibold text-slate-600">{activityCount} {activityCount === 1 ? "Activity" : "Activities"}</p></div>{canConfigure ? <div className="flex items-center gap-3"><button type="button" onClick={onEdit} className="text-sm font-bold text-orange-700">{editing ? "Close" : "Edit"}</button><ArchiveButton busy={busy} onClick={() => run(() => send("/api/build/activity-categories", "PATCH", { ...context, id:category.id, action:"archive" }), "Category archived.")} /></div> : null}</div>{canConfigure && editing ? <form className="mt-3 grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-4" onSubmit={(event)=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>;void run(()=>send("/api/build/activity-categories","PATCH",{...context,id:category.id,code:values.code,name:values.name,sequence:Number(values.sequence),categoryType:values.categoryType}),"Category updated.");}}><Input name="code" label="Code" required defaultValue={category.code}/><Input name="name" label="Name" required defaultValue={category.name}/><Input name="sequence" label="Order" type="number" defaultValue={String(category.sequence)}/><Select name="categoryType" label="Type" options={[category.category_type,"preparation","execution","inspection","testing","commissioning","close_out","general"].filter((value,index,list)=>list.indexOf(value)===index)}/><button disabled={busy} className={ACTION}>Save</button></form> : null}</div>;
}

function EditActivity({ activity, categories, context, busy, run }: { activity: BuildActivityTemplate; categories: BuildActivityCategory[]; context: Context; busy: boolean; run: (task: () => Promise<unknown>, success: string) => Promise<void> }) {
  return <form className="grid gap-2 md:grid-cols-3" onSubmit={(event)=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>;void run(()=>send("/api/build/activity-templates","PATCH",{...context,id:activity.id,activityCategoryId:values.activityCategoryId,code:values.code,name:values.name,sequence:Number(values.sequence),estimatedDuration:Number(values.estimatedDuration),durationUnit:values.durationUnit,status:values.status}),"Activity updated.");}}><Select name="activityCategoryId" label="Category" options={categories.map((item)=>({value:item.id,label:item.name}))}/><Input name="code" label="Code" required defaultValue={activity.code}/><Input name="name" label="Name" required defaultValue={activity.name}/><Input name="sequence" label="Order" type="number" defaultValue={String(activity.sequence)}/><Input name="estimatedDuration" label="Duration" type="number" defaultValue={String(activity.estimated_duration ?? 0)}/><Select name="durationUnit" label="Unit" options={[activity.duration_unit,"hours","days","weeks"].filter((value,index,list)=>list.indexOf(value)===index)}/><Select name="status" label="Status" options={[activity.status,"draft","active","inactive"].filter((value,index,list)=>list.indexOf(value)===index)}/><div className="flex items-end gap-3"><button disabled={busy} className={ACTION}>Save</button><ArchiveButton busy={busy} onClick={() => run(() => send("/api/build/activity-templates", "PATCH", { ...context, id:activity.id, action:"archive" }), "Activity archived.")} /></div></form>;
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h4 className="text-lg font-bold text-slate-950">{title}</h4><p className="mt-1 text-sm text-slate-600">{description}</p><div className="mt-5 space-y-4">{children}</div></section>; }
function ConfigCard({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-3"><div><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs capitalize text-slate-500">{detail}</p></div>{action}</div>; }
function ContextItem({ label, value }: { label: string; value: string }) { return <div><dt className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label.replace(/([A-Z])/g," $1")}</p><p className="mt-1 text-xl font-bold text-slate-950">{value}</p></div>; }
function ArchiveButton({ busy, onClick }: { busy: boolean; onClick: () => void }) { return <button type="button" disabled={busy} onClick={onClick} className="text-xs font-bold text-rose-700 disabled:opacity-50">Archive</button>; }
function option(item: BuildActivityTemplate) { return { value: item.id, label: `${item.code} · ${item.name}` }; }

function CreateForm({ title, fields, busy, onSubmit, compact = false }: { title: string; fields: ReactNode; busy: boolean; onSubmit: (values: Record<string,string>) => void; compact?: boolean }) {
  return <details className="rounded-lg border border-dashed border-orange-300 bg-orange-50/40 p-3"><summary className="cursor-pointer text-sm font-bold text-orange-800">{title}</summary><form className={`mt-4 grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-3"}`} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onSubmit(Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>); }}><>{fields}</><div className="flex items-end"><button disabled={busy} className={ACTION} type="submit">{busy ? "Saving…" : "Save"}</button></div></form></details>;
}
function Input({ name, label, required = false, type = "text", defaultValue }: { name: string; label: string; required?: boolean; type?: string; defaultValue?: string }) { return <label className="grid gap-1 text-xs font-bold text-slate-600">{label}<input name={name} type={type} required={required} defaultValue={defaultValue} min={type === "number" ? 0 : undefined} className={CONTROL} /></label>; }
function Select({ name, label, options }: { name: string; label: string; options: Array<string | {value:string;label:string}> }) { return <label className="grid gap-1 text-xs font-bold text-slate-600">{label}<select name={name} required className={CONTROL}>{options.map((entry) => { const item=typeof entry === "string" ? {value:entry,label:entry.replaceAll("_"," ")} : entry; return <option key={item.value} value={item.value}>{item.label}</option>; })}</select></label>; }
