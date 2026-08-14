"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NIGERIA_REGIONS, NIGERIA_STATES, getRegionForState } from "@/lib/geography";
import type { Project } from "@/lib/types";

type Props = {
  productName: string;
  productKey: string;
  directory?: {
    totalRecords: number;
    statesCovered: number;
    duplicateCount: number;
    lastImport: string | null;
  };
};

type FormState = {
  projectName: string;
  campaignName: string;
  brandName: string;
  targetQuantity: string;
  startDate: string;
  endDate: string;
  targetRegion: string;
  targetState: string;
  status: ProjectFormStatus;
};

const brandOptions = ["Multi-brand", "Darling", "MegaGrowth", "Tura", "Fresh Glow", "Godrej"] as const;
const projectStatuses = ["Planning", "Active", "On Hold", "Completed"] as const;
type ProjectFormStatus = (typeof projectStatuses)[number];
type ProjectFormResources = {
  agencyName?: string | null;
  leadInstallerName?: string | null;
};

const initialForm: FormState = {
  projectName: "",
  campaignName: "",
  brandName: "Multi-brand",
  targetQuantity: "",
  startDate: "",
  endDate: "",
  targetRegion: "",
  targetState: "",
  status: "Planning",
};

function text(value: string) {
  return value.trim();
}

function inputClass() {
  return "min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-200";
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-xs font-medium leading-relaxed text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3">
      <dt className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function statusFor(value: unknown): ProjectFormStatus {
  return projectStatuses.includes(value as ProjectFormStatus) ? value as ProjectFormStatus : "Planning";
}

function resourceValue(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function ProjectCreateWizard({ productName, productKey }: Props) {
  return (
    <ProjectDetailsForm
      mode="create"
      productName={productName}
      productKey={productKey}
    />
  );
}

export function ProjectEditForm({
  project,
  productName,
  productKey,
  resources,
}: Props & {
  project: Project;
  resources?: ProjectFormResources;
}) {
  return (
    <ProjectDetailsForm
      mode="edit"
      productName={productName}
      productKey={productKey}
      project={project}
      resources={resources}
    />
  );
}

function initialFormFor(project?: Project): FormState {
  if (!project) return initialForm;
  const fallbackState = project.primary_target_state ?? project.regions_covered?.[0] ?? "";
  const fallbackRegion = project.primary_target_region ?? (fallbackState ? getRegionForState(fallbackState) : "");
  return {
    projectName: project.project_name ?? "",
    campaignName: project.campaign_name ?? "",
    brandName: (project.brand?.brand_name ?? String((project as Record<string, unknown>).brand ?? "")) || "Multi-brand",
    targetQuantity: String(project.target_quantity ?? ""),
    startDate: project.start_date ?? "",
    endDate: project.end_date ?? "",
    targetRegion: fallbackRegion,
    targetState: fallbackState,
    status: statusFor(project.status),
  };
}

function ProjectDetailsForm({
  mode,
  productName,
  productKey,
  project,
  resources,
}: Props & {
  mode: "create" | "edit";
  project?: Project;
  resources?: ProjectFormResources;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialFormFor(project));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const isEdit = mode === "edit";

  const visibleStates = useMemo(() => {
    if (!form.targetRegion) return [...NIGERIA_STATES];
    return NIGERIA_STATES.filter((state) => getRegionForState(state) === form.targetRegion);
  }, [form.targetRegion]);

  const missingFields = useMemo(() => {
    const missing = [];
    if (!text(form.projectName)) missing.push("Project Name");
    if (!text(form.targetQuantity) || Number(form.targetQuantity) <= 0) missing.push("Target Quantity");
    return missing;
  }, [form.projectName, form.targetQuantity]);

  function update(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function updateRegion(value: string) {
    setForm((current) => ({
      ...current,
      targetRegion: value,
      targetState: current.targetState && getRegionForState(current.targetState) !== value ? "" : current.targetState,
    }));
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingFields.length > 0) {
      setError(`Project could not be ${isEdit ? "saved" : "created"}. Please complete: ${missingFields.join(", ")}.`);
      summaryRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const response = await fetch(isEdit ? `/api/workspace/projects/${project?.id}` : "/api/workspace/projects", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: text(form.projectName),
        campaignName: text(form.campaignName),
        brandName: form.brandName === "Multi-brand" ? "" : form.brandName,
        status: form.status,
        product: productKey,
        expectedDeploymentQuantity: form.targetQuantity,
        regions: form.targetRegion ? [form.targetRegion] : [],
        states: form.targetState ? [form.targetState] : [],
        startDate: form.startDate || null,
        expectedEndDate: form.endDate || null,
        agencies: [],
        installers: [],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error ?? `Project could not be ${isEdit ? "saved" : "created"}. Please review the highlighted information and try again.`);
      setSubmitting(false);
      summaryRef.current?.focus();
      return;
    }

    setSuccess(isEdit ? "Project and campaign details saved." : "Project successfully created.");
    setSubmitting(false);
    window.setTimeout(() => {
      router.push(isEdit ? "/workspace/admin/campaigns" : "/workspace/admin/projects");
      router.refresh();
    }, 700);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        {isEdit ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Campaign Management</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">Review / Edit Project</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Review project and campaign details, make any required changes, then save.</p>
          </div>
        ) : null}

        {error ? (
          <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        {success ? (
          <div ref={summaryRef} tabIndex={-1} role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
            <p className="font-bold">{success}</p>
            <p className="mt-2">{isEdit ? "Returning to Campaign Management." : "Returning to Projects."}</p>
          </div>
        ) : null}

        <form className="rounded-lg border border-slate-200 bg-white p-5" onSubmit={submit}>
          {isEdit ? <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Project Details</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Project Name">
              <input className={inputClass()} value={form.projectName} onChange={(event) => update("projectName", event.target.value)} required />
            </Field>
            <Field label="Campaign Name">
              <input className={inputClass()} value={form.campaignName} onChange={(event) => update("campaignName", event.target.value)} />
            </Field>
            <Field label="Brand / Multi-brand">
              <select className={inputClass()} value={form.brandName} onChange={(event) => update("brandName", event.target.value)}>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </Field>
            <Field label="Target Quantity">
              <input className={inputClass()} type="number" min="1" value={form.targetQuantity} onChange={(event) => update("targetQuantity", event.target.value)} required />
            </Field>
            <Field label="Status">
              <select className={inputClass()} value={form.status} onChange={(event) => update("status", statusFor(event.target.value))}>
                {projectStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Start Date">
              <input className={inputClass()} type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} />
            </Field>
            <Field label="Expected End Date">
              <input className={inputClass()} type="date" value={form.endDate} onChange={(event) => update("endDate", event.target.value)} />
            </Field>
            <Field label={isEdit ? "Region" : "Primary Target Region"}>
              <select className={inputClass()} value={form.targetRegion} onChange={(event) => updateRegion(event.target.value)}>
                <option value="">Select region</option>
                {NIGERIA_REGIONS.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </Field>
            <Field label={isEdit ? "State" : "Primary Target State"}>
              <select className={inputClass()} value={form.targetState} onChange={(event) => update("targetState", event.target.value)}>
                <option value="">Select state</option>
                {visibleStates.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </Field>
            <Field label="Assigned Agency">
              <input className={`${inputClass()} bg-slate-50 text-slate-600`} value={resourceValue(resources?.agencyName, "No agency assigned")} readOnly aria-readonly="true" />
            </Field>
            <Field label="Lead Installer">
              <input className={`${inputClass()} bg-slate-50 text-slate-600`} value={resourceValue(resources?.leadInstallerName, "No lead installer assigned")} readOnly aria-readonly="true" />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <p className="max-w-xl text-xs font-medium leading-5 text-slate-500">
              {isEdit
                ? "Save Changes updates project and campaign information in this workspace."
                : "Save the project in this workspace."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {isEdit ? <Link href="/workspace/admin/campaigns" className="text-sm font-bold text-slate-600 hover:text-slate-950">Cancel</Link> : null}
              <button type="submit" disabled={submitting || missingFields.length > 0} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create")}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Project Summary</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Info label="Project Name" value={form.projectName || "Not set"} />
          <Info label="Campaign" value={form.campaignName || "Not set"} />
          <Info label="Brand" value={form.brandName} />
          <Info label="Status" value={form.status} />
          <Info label="Target Quantity" value={form.targetQuantity || "Not set"} />
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
        <p className="font-bold text-slate-950">Workspace product</p>
        <p className="mt-2">{productName}</p>
      </section>
    </div>
  );
}
