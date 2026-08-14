"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DirectorySummary = {
  totalRecords: number;
  statesCovered: number;
  duplicateCount: number;
  lastImport: string | null;
};

type Props = {
  productName: string;
  productKey: string;
  directory: DirectorySummary;
};

const steps = [
  "Project Setup",
  "Deployment Coverage",
  "Schedule",
  "Field Resources",
  "Review & Create",
] as const;

const deploymentTypes = ["Retail", "Fleet", "Build", "Healthcare"] as const;
const priorities = ["Normal", "High", "Urgent"] as const;

type FormState = {
  projectName: string;
  description: string;
  product: string;
  campaignName: string;
  deploymentType: string;
  expectedDeploymentQuantity: string;
  priority: string;
  objectives: string;
  states: string;
  regions: string;
  cities: string;
  startDate: string;
  expectedEndDate: string;
  milestones: string;
  timeZone: string;
  workingDays: string;
  agencies: string;
  installers: string;
  supervisors: string;
  managers: string;
};

const initialForm = (productKey: string): FormState => ({
  projectName: "",
  description: "",
  product: productKey,
  campaignName: "",
  deploymentType: "Retail",
  expectedDeploymentQuantity: "",
  priority: "Normal",
  objectives: "",
  states: "",
  regions: "",
  cities: "",
  startDate: "",
  expectedEndDate: "",
  milestones: "",
  timeZone: "Africa/Lagos",
  workingDays: "Monday, Tuesday, Wednesday, Thursday, Friday",
  agencies: "",
  installers: "",
  supervisors: "",
  managers: "",
});

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function plannedResourceCount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);
  return splitList(trimmed).length;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "min-h-11 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200";
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function readinessState(passed: boolean, important = true) {
  if (passed) return { label: "Complete", marker: "Done", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  return {
    label: important ? "Needs attention" : "Pending",
    marker: "Open",
    className: important ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600",
  };
}

export function ProjectCreateWizard({ productName, productKey, directory }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => initialForm(productKey));
  const [error, setError] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<{ id: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const draftValidation = useMemo(() => {
    const missing = [];
    if (!form.projectName.trim()) missing.push("Project Name");
    if (!form.expectedDeploymentQuantity || Number(form.expectedDeploymentQuantity) <= 0) missing.push("Expected Deployment Quantity");
    return missing;
  }, [form]);

  const launchReadiness = useMemo(() => {
    const hasCampaign = Boolean(form.campaignName.trim());
    const hasGeography = Boolean(form.states.trim() || form.regions.trim() || form.cities.trim());
    const hasTarget = Boolean(form.expectedDeploymentQuantity && Number(form.expectedDeploymentQuantity) > 0);
    const hasTimeline = Boolean(form.startDate && form.expectedEndDate);
    return [
      { key: "project", label: "Project configured", passed: draftValidation.length === 0, important: true },
      { key: "directory", label: "Deployment Directory Ready", passed: directory.totalRecords > 0, important: false },
      { key: "resources", label: "Field resources assigned", passed: false, important: false },
      { key: "campaign", label: "Campaign metadata added", passed: hasCampaign, important: false },
      { key: "geography", label: "Geography defined", passed: hasGeography, important: true },
      { key: "quantity", label: "Deployment target defined", passed: hasTarget, important: true },
      { key: "timeline", label: "Timeline completed", passed: hasTimeline, important: true },
    ];
  }, [directory.totalRecords, draftValidation.length, form]);

  const coverageSummary = splitList(form.states).length > 0
    ? countLabel(splitList(form.states).length, "State")
    : splitList(form.regions).length > 0
      ? countLabel(splitList(form.regions).length, "Region")
      : splitList(form.cities).length > 0
        ? countLabel(splitList(form.cities).length, "City", "Cities")
        : "Not set";
  const scheduleSummary = form.startDate && form.expectedEndDate ? `${form.startDate} - ${form.expectedEndDate}` : "Not set";
  const plannedInstallerCount = plannedResourceCount(form.installers);
  const plannedSupervisorCount = plannedResourceCount(form.supervisors);
  const plannedManagerCount = plannedResourceCount(form.managers);
  const plannedAgencyCount = plannedResourceCount(form.agencies);
  const timelineIncomplete = step === 2 && (!form.startDate || !form.expectedEndDate);

  function update(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function move(next: number) {
    setStep(Math.max(0, Math.min(steps.length - 1, next)));
  }

  async function submit() {
    if (draftValidation.length > 0) {
      setError(`Project could not be created. Please complete: ${draftValidation.join(", ")}.`);
      summaryRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/workspace/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        states: splitList(form.states),
        regions: splitList(form.regions),
        cities: splitList(form.cities),
        workingDays: splitList(form.workingDays),
        agencies: splitList(form.agencies),
        installers: splitList(form.installers),
        supervisors: splitList(form.supervisors),
        managers: splitList(form.managers),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error ?? "Project could not be created. Please review the highlighted information and try again.");
      setSubmitting(false);
      summaryRef.current?.focus();
      return;
    }
    setCreatedProject({ id: payload.project.id, name: payload.project.project_name ?? form.projectName });
    setSubmitting(false);
    window.setTimeout(() => router.push(`/workspace/admin/projects/${payload.project.id}`), 900);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Deployment preparation</p>
            <p className="mt-1 text-sm text-slate-600">Create the Project now, then use readiness actions to prepare the directory, locations, field resources and launch.</p>
          </div>
          <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Project creation steps">
            {steps.map((item, index) => (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => move(index)}
                  aria-current={index === step ? "step" : undefined}
                  className={`min-h-11 w-full rounded-lg border px-3 text-left text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-200 ${
                    index === step ? "border-orange-300 bg-orange-50 text-orange-900" : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {index + 1}. {item}
                </button>
              </li>
            ))}
          </ol>
        </div>

        {error ? (
          <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        {createdProject ? (
          <div ref={summaryRef} tabIndex={-1} role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
            <p className="font-bold">Project successfully created.</p>
            <p className="mt-2">Opening {createdProject.name}. Next recommended action: Upload Deployment Directory.</p>
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">{steps[step]}</h2>
          {step === 0 ? <p className="mt-2 text-sm text-slate-600">Project is the operational container for campaign identity, brand, deployment target and field activity.</p> : null}
          {step === 0 ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Field label="Project Name">
                <input className={inputClass()} value={form.projectName} onChange={(event) => update("projectName", event.target.value)} />
              </Field>
              <Field label="Product">
                <input className={inputClass()} value={productName} readOnly aria-readonly="true" />
              </Field>
              <Field label="Campaign Name">
                <input className={inputClass()} value={form.campaignName} onChange={(event) => update("campaignName", event.target.value)} />
              </Field>
              <Field label="Deployment Type">
                <select className={inputClass()} value={form.deploymentType} onChange={(event) => update("deploymentType", event.target.value)}>
                  {deploymentTypes.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Expected Deployment Quantity">
                <input className={inputClass()} type="number" min="1" value={form.expectedDeploymentQuantity} onChange={(event) => update("expectedDeploymentQuantity", event.target.value)} />
              </Field>
              <Field label="Priority">
                <select className={inputClass()} value={form.priority} onChange={(event) => update("priority", event.target.value)}>
                  {priorities.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Description">
                <textarea className={`${inputClass()} min-h-24`} value={form.description} onChange={(event) => update("description", event.target.value)} />
              </Field>
              <Field label="Objectives">
                <textarea className={`${inputClass()} min-h-24`} value={form.objectives} onChange={(event) => update("objectives", event.target.value)} />
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Field label="States">
                <input className={inputClass()} value={form.states} onChange={(event) => update("states", event.target.value)} placeholder="Lagos, Abuja" />
              </Field>
              <Field label="Regions">
                <input className={inputClass()} value={form.regions} onChange={(event) => update("regions", event.target.value)} />
              </Field>
              <Field label="Cities">
                <input className={inputClass()} value={form.cities} onChange={(event) => update("cities", event.target.value)} />
              </Field>
              <p className="text-sm text-slate-600 lg:col-span-2">Use comma-separated values. For broad rollouts, write the customer-facing coverage name clearly, such as All Lagos retail regions.</p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Field label="Start Date">
                <input className={inputClass()} type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} />
              </Field>
              <Field label="Expected End Date">
                <input className={inputClass()} type="date" value={form.expectedEndDate} onChange={(event) => update("expectedEndDate", event.target.value)} />
              </Field>
              <Field label="Time Zone">
                <input className={inputClass()} value={form.timeZone} onChange={(event) => update("timeZone", event.target.value)} />
              </Field>
              <Field label="Working Days">
                <input className={inputClass()} value={form.workingDays} onChange={(event) => update("workingDays", event.target.value)} />
              </Field>
              <Field label="Milestones">
                <textarea className={`${inputClass()} min-h-24 lg:col-span-2`} value={form.milestones} onChange={(event) => update("milestones", event.target.value)} />
              </Field>
              {timelineIncomplete ? <p className="text-sm font-semibold text-amber-800 lg:col-span-2">Timeline incomplete. You can save a Draft Project, but launch readiness will remain pending until Start Date and Expected End Date are set.</p> : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <p className="text-sm text-slate-600 lg:col-span-2">Field resources can be assigned after the Draft Project is created. They are required for launch readiness, not for draft creation.</p>
              <Field label="Planned Agencies">
                <input className={inputClass()} value={form.agencies} onChange={(event) => update("agencies", event.target.value)} />
              </Field>
              <Field label="Planned Installers">
                <input className={inputClass()} value={form.installers} onChange={(event) => update("installers", event.target.value)} />
              </Field>
              <Field label="Planned Supervisors">
                <input className={inputClass()} value={form.supervisors} onChange={(event) => update("supervisors", event.target.value)} />
              </Field>
              <Field label="Planned Managers">
                <input className={inputClass()} value={form.managers} onChange={(event) => update("managers", event.target.value)} />
              </Field>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="mt-5 grid gap-5 text-sm">
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Project Summary</p>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Info label="Project" value={form.projectName || "Not set"} />
                  <Info label="Campaign" value={form.campaignName || "Not set"} />
                  <Info label="Brand" value={form.product || productName} />
                  <Info label="Deployment Type" value={form.deploymentType} />
                  <Info label="Coverage" value={coverageSummary} />
                  <Info label="Schedule" value={scheduleSummary} />
                  <Info label="Target" value={form.expectedDeploymentQuantity ? `${form.expectedDeploymentQuantity} Deployments` : "Not set"} />
                  <Info label="Planned Installers" value={String(plannedInstallerCount)} />
                  <Info label="Planned Supervisors" value={String(plannedSupervisorCount)} />
                  <Info label="Planned Managers" value={String(plannedManagerCount)} />
                  <Info label="Planned Agencies" value={String(plannedAgencyCount)} />
                  <Info label="Status" value="Draft" />
                </dl>
              </section>
              <ReviewSection title="Geography details">
                <Info label="States" value={form.states || "Not set"} />
                <Info label="Regions" value={form.regions || "Not set"} />
                <Info label="Cities" value={form.cities || "Not set"} />
              </ReviewSection>
              <ReviewSection title="Timeline details">
                <Info label="Start Date" value={form.startDate || "Not set"} />
                <Info label="Expected End Date" value={form.expectedEndDate || "Not set"} />
                <Info label="Milestones" value={form.milestones || "Not set"} />
                <Info label="Time Zone" value={form.timeZone || "Not set"} />
                <Info label="Working Days" value={form.workingDays || "Not set"} />
              </ReviewSection>
              <ReviewSection title="Resources">
                <Info label="Planned Agencies" value={form.agencies || "0"} />
                <Info label="Planned Installers" value={form.installers || "0"} />
                <Info label="Planned Supervisors" value={form.supervisors || "0"} />
                <Info label="Planned Managers" value={form.managers || "0"} />
              </ReviewSection>
              <ReviewSection title="Deployment Targets">
                <Info label="Expected Installations" value={form.expectedDeploymentQuantity || "Not set"} />
                <Info label="Target Quantities" value={form.expectedDeploymentQuantity || "Not set"} />
              </ReviewSection>
              <ReviewSection title="Project Identity">
                <Info label="Project" value={form.projectName || "Not set"} />
                <Info label="Description" value={form.description || "Not set"} />
                <Info label="Product" value={productName} />
                <Info label="Campaign" value={form.campaignName || "Not set"} />
                <Info label="Deployment Type" value={form.deploymentType} />
                <Info label="Priority" value={form.priority} />
                <Info label="Objectives" value={form.objectives || "Not set"} />
              </ReviewSection>
              {launchReadiness.some((item) => !item.passed) ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Launch readiness is incomplete. This does not prevent Draft Project creation.</p> : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <button type="button" onClick={() => move(step - 1)} disabled={step === 0} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 disabled:opacity-50">
              Back
            </button>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => move(step + 1)} className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white">
                Continue
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={submitting} className="min-h-11 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-60">
                {submitting ? "Creating..." : "Create Project"}
              </button>
            )}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Launch readiness</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {launchReadiness.map((item) => {
              const state = readinessState(item.passed, item.important);
              return (
              <li key={item.key} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${state.className}`}>
                <span className="flex items-center gap-2 font-semibold"><span aria-hidden="true">{state.marker}</span>{item.label}</span>
                <span className="text-xs font-bold uppercase tracking-wider">{state.label}</span>
              </li>
              );
            })}
          </ul>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          Create Project saves a Draft. Launch remains blocked until the operational readiness checklist is complete.
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-bold text-slate-950">{title}</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}
