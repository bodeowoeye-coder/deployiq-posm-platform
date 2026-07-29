"use client";

import { useMemo, useState } from "react";
import type {
  BuildActivityTemplateAuthoringRecord,
  BuildChecklistTemplate,
  BuildTemplateAuthoringValidationSummary
} from "@/lib/build/templates/types";

type AuthoringContext = {
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
};

type CategorySummary = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  context: AuthoringContext;
  categories: CategorySummary[];
  activities: BuildActivityTemplateAuthoringRecord[];
  validation: BuildTemplateAuthoringValidationSummary;
  initialActivityId: string | null;
  checklists: BuildChecklistTemplate[];
};

async function sendJson(url: string, method: "POST" | "PATCH", payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Request failed (${response.status})`);
  }
}

export function BuildTemplateAuthoringPanel(props: Props) {
  const { context, categories, activities, validation, initialActivityId } = props;
  const [selectedActivityId, setSelectedActivityId] = useState<string>(initialActivityId ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");

  const checklists = useMemo(
    () => props.checklists.filter((item) => item.activity_template_id === selectedActivityId),
    [props.checklists, selectedActivityId]
  );

  async function run(action: () => Promise<void>, successMessage: string) {
    try {
      setBusy(true);
      setMessage("");
      await action();
      setMessage(successMessage);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
      <div className="mx-auto grid w-full max-w-7xl gap-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-xl font-bold">Activity Template Authoring</h1>
          <p className="mt-1 text-sm text-slate-600">
            Template -&gt; Category -&gt; Activities -&gt; Checklist Templates -&gt; Dependencies -&gt; Resource Requirements
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Context: project {context.projectId} | site {context.siteId} | work package {context.workPackageId} | template {context.templateId}
          </p>
          {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Validation Summary</h2>
          <div className="mt-2 grid gap-2 text-sm">
            <div>
              <strong>Errors:</strong> {validation.errors.length}
            </div>
            <div>
              <strong>Warnings:</strong> {validation.warnings.length}
            </div>
            {validation.errors.map((error) => (
              <p key={error} className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">
                {error}
              </p>
            ))}
            {validation.warnings.map((warning) => (
              <p key={warning} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                {warning}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Create Activity Template</h2>
          <form
            className="mt-3 grid gap-2 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const payload = {
                ...context,
                activityCategoryId: (form.elements.namedItem("activityCategoryId") as HTMLSelectElement).value,
                sequence: Number((form.elements.namedItem("sequence") as HTMLInputElement).value || "1"),
                code: (form.elements.namedItem("code") as HTMLInputElement).value,
                name: (form.elements.namedItem("name") as HTMLInputElement).value,
                estimatedDuration: Number((form.elements.namedItem("estimatedDuration") as HTMLInputElement).value || "0"),
                durationUnit: (form.elements.namedItem("durationUnit") as HTMLSelectElement).value,
                status: (form.elements.namedItem("status") as HTMLSelectElement).value,
                mandatory: (form.elements.namedItem("mandatory") as HTMLInputElement).checked,
                requiresPhoto: (form.elements.namedItem("requiresPhoto") as HTMLInputElement).checked,
                requiresGps: (form.elements.namedItem("requiresGps") as HTMLInputElement).checked,
                requiresApproval: (form.elements.namedItem("requiresApproval") as HTMLInputElement).checked,
                description: (form.elements.namedItem("description") as HTMLInputElement).value || null,
                notes: (form.elements.namedItem("notes") as HTMLInputElement).value || null
              };
              void run(
                async () => sendJson("/api/build/activity-templates", "POST", payload),
                "Activity template created."
              );
            }}
          >
            <select name="activityCategoryId" required className="rounded border border-slate-300 px-2 py-2 text-sm">
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.code} - {category.name}
                </option>
              ))}
            </select>
            <input name="code" required placeholder="Code" className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <input name="name" required placeholder="Name" className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <input name="sequence" type="number" min={1} defaultValue={1} className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <input name="estimatedDuration" type="number" min={0} defaultValue={0} className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <select name="durationUnit" defaultValue="days" className="rounded border border-slate-300 px-2 py-2 text-sm">
              <option value="hours">hours</option>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
            </select>
            <select name="status" defaultValue="draft" className="rounded border border-slate-300 px-2 py-2 text-sm">
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
            <input name="description" placeholder="Description" className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <input name="notes" placeholder="Notes" className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <label className="flex items-center gap-2 text-xs"><input name="mandatory" type="checkbox" defaultChecked />mandatory</label>
            <label className="flex items-center gap-2 text-xs"><input name="requiresPhoto" type="checkbox" />requires photo</label>
            <label className="flex items-center gap-2 text-xs"><input name="requiresGps" type="checkbox" />requires GPS</label>
            <label className="flex items-center gap-2 text-xs"><input name="requiresApproval" type="checkbox" />requires approval</label>
            <button disabled={busy} type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Create
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Activities</h2>
          <div className="mt-3 grid gap-3">
            {activities.map((activity) => (
              <form
                key={activity.id}
                className="rounded border border-slate-200 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const payload = {
                    ...context,
                    id: activity.id,
                    sequence: Number((form.elements.namedItem("sequence") as HTMLInputElement).value || activity.sequence),
                    code: (form.elements.namedItem("code") as HTMLInputElement).value,
                    name: (form.elements.namedItem("name") as HTMLInputElement).value,
                    status: (form.elements.namedItem("status") as HTMLSelectElement).value,
                    description: (form.elements.namedItem("description") as HTMLInputElement).value || null,
                    notes: (form.elements.namedItem("notes") as HTMLInputElement).value || null
                  };
                  void run(async () => sendJson("/api/build/activity-templates", "PATCH", payload), "Activity updated.");
                }}
              >
                <div className="mb-2 text-xs text-slate-600">
                  Category {activity.activity_category_id} | Checklists {activity.checklist_count} | Dependencies P/S {activity.dependency.predecessor_count}/{activity.dependency.successor_count} | Resources {activity.resources.requirement_count}
                </div>
                <div className="grid gap-2 md:grid-cols-5">
                  <input name="code" defaultValue={activity.code} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <input name="name" defaultValue={activity.name} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <input name="sequence" type="number" min={1} defaultValue={activity.sequence} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <select name="status" defaultValue={activity.status} className="rounded border border-slate-300 px-2 py-1 text-sm">
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                    <option value="archived">archived</option>
                  </select>
                  <button disabled={busy} className="rounded bg-slate-900 px-3 py-1 text-sm font-semibold text-white disabled:opacity-60" type="submit">
                    Save
                  </button>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <input name="description" defaultValue={activity.description ?? ""} placeholder="Description" className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <input name="notes" defaultValue={activity.notes ?? ""} placeholder="Notes" className="rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={busy}
                    type="button"
                    className="rounded border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 disabled:opacity-60"
                    onClick={() => {
                      void run(
                        async () =>
                          sendJson("/api/build/activity-templates", "PATCH", {
                            ...context,
                            id: activity.id,
                            action: "archive"
                          }),
                        "Activity archived."
                      );
                    }}
                  >
                    Archive
                  </button>
                  <button
                    disabled={busy}
                    type="button"
                    className="rounded border border-slate-300 px-3 py-1 text-xs"
                    onClick={() => setSelectedActivityId(activity.id)}
                  >
                    Manage checklist
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Reorder Activities In Category</h2>
          <form
            className="mt-3 grid gap-2 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const categoryId = (form.elements.namedItem("activityCategoryId") as HTMLSelectElement).value;
              const orderedIds = (form.elements.namedItem("orderedActivityTemplateIds") as HTMLInputElement).value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);

              void run(
                async () =>
                  sendJson("/api/build/activity-templates", "PATCH", {
                    ...context,
                    action: "reorder",
                    activityCategoryId: categoryId,
                    orderedActivityTemplateIds: orderedIds
                  }),
                "Activity order updated."
              );
            }}
          >
            <select name="activityCategoryId" required className="rounded border border-slate-300 px-2 py-2 text-sm">
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.code} - {category.name}
                </option>
              ))}
            </select>
            <input
              name="orderedActivityTemplateIds"
              placeholder="comma-separated activity ids"
              className="rounded border border-slate-300 px-2 py-2 text-sm md:col-span-2"
            />
            <button disabled={busy} type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Reorder Activities
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Checklist Templates</h2>
          <p className="mt-1 text-xs text-slate-500">Selected activity: {selectedActivityId || "none"}</p>

          <form
            className="mt-3 grid gap-2 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedActivityId) {
                setMessage("Select an activity before creating checklist templates.");
                return;
              }
              const form = event.currentTarget;
              void run(
                async () =>
                  sendJson("/api/build/checklist-templates", "POST", {
                    ...context,
                    activityTemplateId: selectedActivityId,
                    sequence: Number((form.elements.namedItem("sequence") as HTMLInputElement).value || "1"),
                    item: (form.elements.namedItem("item") as HTMLInputElement).value,
                    description: (form.elements.namedItem("description") as HTMLInputElement).value || null,
                    mandatory: (form.elements.namedItem("mandatory") as HTMLInputElement).checked,
                    requiresPhoto: (form.elements.namedItem("requiresPhoto") as HTMLInputElement).checked,
                    requiresComment: (form.elements.namedItem("requiresComment") as HTMLInputElement).checked,
                    acceptanceType: (form.elements.namedItem("acceptanceType") as HTMLInputElement).value || null
                  }),
                "Checklist template created."
              );
            }}
          >
            <input name="item" required placeholder="Checklist item" className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <input name="sequence" type="number" min={1} defaultValue={1} className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <input name="description" placeholder="Description" className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <input name="acceptanceType" placeholder="Acceptance type" className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <label className="flex items-center gap-2 text-xs"><input name="mandatory" type="checkbox" defaultChecked />mandatory</label>
            <label className="flex items-center gap-2 text-xs"><input name="requiresPhoto" type="checkbox" />requires photo</label>
            <label className="flex items-center gap-2 text-xs"><input name="requiresComment" type="checkbox" />requires comment</label>
            <button disabled={busy} type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Create Checklist
            </button>
          </form>

          <div className="mt-4 grid gap-2">
            {checklists.map((item) => (
              <form
                key={item.id}
                className="rounded border border-slate-200 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  void run(
                    async () =>
                      sendJson("/api/build/checklist-templates", "PATCH", {
                        ...context,
                        activityTemplateId: selectedActivityId,
                        id: item.id,
                        sequence: Number((form.elements.namedItem("sequence") as HTMLInputElement).value || item.sequence),
                        item: (form.elements.namedItem("item") as HTMLInputElement).value,
                        description: (form.elements.namedItem("description") as HTMLInputElement).value || null,
                        mandatory: (form.elements.namedItem("mandatory") as HTMLInputElement).checked,
                        requiresPhoto: (form.elements.namedItem("requiresPhoto") as HTMLInputElement).checked,
                        requiresComment: (form.elements.namedItem("requiresComment") as HTMLInputElement).checked,
                        acceptanceType: (form.elements.namedItem("acceptanceType") as HTMLInputElement).value || null
                      }),
                    "Checklist updated."
                  );
                }}
              >
                <div className="grid gap-2 md:grid-cols-5">
                  <input name="item" defaultValue={item.item} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <input name="sequence" type="number" min={1} defaultValue={item.sequence} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <input name="description" defaultValue={item.description ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <input name="acceptanceType" defaultValue={item.acceptance_type ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <button disabled={busy} type="submit" className="rounded bg-slate-900 px-3 py-1 text-sm font-semibold text-white disabled:opacity-60">
                    Save
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1"><input name="mandatory" type="checkbox" defaultChecked={item.mandatory} />mandatory</label>
                  <label className="flex items-center gap-1"><input name="requiresPhoto" type="checkbox" defaultChecked={item.requires_photo} />requires photo</label>
                  <label className="flex items-center gap-1"><input name="requiresComment" type="checkbox" defaultChecked={item.requires_comment} />requires comment</label>
                  <button
                    disabled={busy}
                    type="button"
                    className="rounded border border-rose-300 px-2 py-1 text-rose-700"
                    onClick={() => {
                      void run(
                        async () =>
                          sendJson("/api/build/checklist-templates", "PATCH", {
                            ...context,
                            activityTemplateId: selectedActivityId,
                            id: item.id,
                            action: "archive"
                          }),
                        "Checklist archived."
                      );
                    }}
                  >
                    Archive
                  </button>
                </div>
              </form>
            ))}
          </div>

          <form
            className="mt-4 grid gap-2 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedActivityId) {
                setMessage("Select an activity before reordering checklist templates.");
                return;
              }
              const form = event.currentTarget;
              const orderedChecklistTemplateIds = (form.elements.namedItem("orderedChecklistTemplateIds") as HTMLInputElement).value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);

              void run(
                async () =>
                  sendJson("/api/build/checklist-templates", "PATCH", {
                    ...context,
                    activityTemplateId: selectedActivityId,
                    action: "reorder",
                    orderedChecklistTemplateIds
                  }),
                "Checklist order updated."
              );
            }}
          >
            <input
              name="orderedChecklistTemplateIds"
              placeholder="comma-separated checklist ids"
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
            <button disabled={busy} type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Reorder Checklist
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
