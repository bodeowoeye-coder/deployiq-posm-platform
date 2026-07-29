import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildTemplateAuthoringPanel } from "@/components/BuildTemplateAuthoringPanel";
import { requireRole } from "@/lib/auth";
import { getActivityTemplates } from "@/lib/build/activityTemplates/service";
import { getCategories } from "@/lib/build/activityCategories/service";
import { getChecklistTemplates } from "@/lib/build/checklists/service";

export const dynamic = "force-dynamic";

export default async function ActivityTemplateAuthoringPage({
  searchParams
}: {
  searchParams?: {
    projectId?: string;
    siteId?: string;
    workPackageId?: string;
    templateId?: string;
    activityTemplateId?: string;
  };
}) {
  await requireRole(["admin"], "/admin/build/template-authoring");

  const projectId = (searchParams?.projectId ?? "").trim();
  const siteId = (searchParams?.siteId ?? "").trim();
  const workPackageId = (searchParams?.workPackageId ?? "").trim();
  const templateId = (searchParams?.templateId ?? "").trim();
  const activityTemplateId = (searchParams?.activityTemplateId ?? "").trim();

  if (!projectId || !siteId || !workPackageId || !templateId) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold">Activity Template Authoring</h1>
          <p className="mt-2 text-sm text-slate-600">
            Provide projectId, siteId, workPackageId, and templateId in the query string to open authoring controls.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Example: /admin/build/template-authoring?projectId=...&siteId=...&workPackageId=...&templateId=...
          </p>
          <Link href="/admin" className="mt-4 inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
            Back to Admin
          </Link>
        </div>
      </main>
    );
  }

  const categories = await getCategories({ projectId, siteId, workPackageId, templateId });
  if (categories.length === 0) {
    notFound();
  }

  const activityResult = await getActivityTemplates({ projectId, siteId, workPackageId, templateId });
  const selectedActivityId = activityTemplateId || activityResult.activities[0]?.id || "";
  const checklists = selectedActivityId
    ? await getChecklistTemplates({
        projectId,
        siteId,
        workPackageId,
        templateId,
        activityTemplateId: selectedActivityId
      })
    : [];

  return (
    <BuildTemplateAuthoringPanel
      context={{ projectId, siteId, workPackageId, templateId }}
      categories={categories.map((category) => ({ id: category.id, code: category.code, name: category.name }))}
      activities={activityResult.activities}
      validation={activityResult.validation}
      initialActivityId={selectedActivityId || null}
      checklists={checklists}
    />
  );
}
