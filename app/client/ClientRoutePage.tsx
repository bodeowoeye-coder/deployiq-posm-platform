import { ClientDashboard } from "@/components/ClientDashboard";
import { BrandMark } from "@/components/BrandMark";
import type { DashboardView } from "@/components/DashboardSidebar";
import { requireRole } from "@/lib/auth";
import { loadClientSubmissionScope } from "@/lib/clientSubmissions";
import { notificationsEnabled } from "@/lib/notifications";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { DeploymentProgress, Project, ProjectTarget, Submission } from "@/lib/types";
import { normalizeProjectRecords } from "@/lib/projects";

const imageDebugNeedles = ["ABUKKYA STORE", "MAC-DAVIS VENTURES", "MECHE"];

function sanitizeImageUrlForLog(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.split("?")[0].slice(0, 220);
  }
}

function isImageDebugTarget(submission: Submission) {
  const haystack = [submission.salon_name, submission.address, submission.project_name, submission.installer_name]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return imageDebugNeedles.some((needle) => haystack.includes(needle));
}

export async function ClientRoutePage({ initialView = "overview" }: { initialView?: DashboardView }) {
  console.info("[client-route] entered", { initialView });
  const context = await requireRole(["client"], "/client");
  console.info("[client-route] auth context resolved", {
    role: context.role.role,
    userId: context.user.id,
    userEmail: context.user.email,
    roleClientId: context.role.client_id,
    client: context.client ? { id: context.client.id, name: context.client.name } : null
  });

  if (!context.client || !context.role.client_id) {
    console.warn("[client-route] missing client linkage", {
      userId: context.user.id,
      userEmail: context.user.email,
      roleClientId: context.role.client_id,
      hasClient: Boolean(context.client)
    });
    return (
      <main className="min-h-screen bg-[var(--page-bg)] px-4 py-8 text-[var(--text-primary)]">
        <div className="mx-auto max-w-3xl rounded-xl border border-[var(--border-soft)] bg-[var(--card-bg)] p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <BrandMark />
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-500">Client portal setup</p>
              <h1 className="mt-2 text-2xl font-bold leading-tight">Client account is not linked yet</h1>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
            This login is authenticated, but it is not linked to a client company record. Please ask an admin to connect this user role to the correct client in
            <span className="font-semibold text-[var(--text-primary)]"> public.user_roles.client_id</span>.
          </p>
        </div>
      </main>
    );
  }

  const client = context.client;
  const clientId = context.role.client_id;
  const supabase = createAdminSupabase();
  const { projects, submissions, visibilityScope, effectiveClient, effectiveClientId, directClientRows } = await loadClientSubmissionScope(supabase, client, clientId);
  console.info("[client-route] submission scope resolved", {
    requestedClient: { id: client.id, name: client.name },
    effectiveClient: { id: effectiveClient.id, name: effectiveClient.name },
    requestedClientId: clientId,
    effectiveClientId,
    directClientRows,
    submissionCount: submissions.length,
    projectCount: projects.length,
    brandNames: visibilityScope.brandNames,
    brandIdsCount: visibilityScope.brandIds.length,
    projectIdsCount: visibilityScope.projectIds.length,
    selectStrategy: 'loadClientSubmissionScope uses submissions.select("*")',
    sampleSubmissionShape: submissions[0]
      ? {
          id: submissions[0].id,
          client_id: submissions[0].client_id,
          brand_id: submissions[0].brand_id,
          brand_name: submissions[0].brand_name,
          project_id: submissions[0].project_id,
          project_name: submissions[0].project_name,
          status: submissions[0].status,
          submitted_at: submissions[0].submitted_at,
          installation_date: submissions[0].installation_date,
          hasImageUrl: Boolean(submissions[0].image_url),
          hasImagePath: Boolean((submissions[0] as Submission & { image_path?: unknown }).image_path),
          hasPhotoUrl: Boolean((submissions[0] as Submission & { photo_url?: unknown }).photo_url),
          hasEvidencePhotoUrl: Boolean((submissions[0] as Submission & { evidence_photo_url?: unknown }).evidence_photo_url),
          hasPhotoPath: Boolean((submissions[0] as Submission & { photo_path?: unknown }).photo_path)
        }
      : null
  });
  const debugTarget = submissions.find((item) => isImageDebugTarget(item));
  if (debugTarget) {
    console.info("[client-route-image-debug]", {
      submissionId: debugTarget.id,
      salonName: debugTarget.salon_name || null,
      projectName: debugTarget.project_name || null,
      installerName: debugTarget.installer_name || null,
      image_url: sanitizeImageUrlForLog((debugTarget as Submission & { image_url?: unknown }).image_url),
      image_path: sanitizeImageUrlForLog((debugTarget as Submission & { image_path?: unknown }).image_path),
      photo_url: sanitizeImageUrlForLog((debugTarget as Submission & { photo_url?: unknown }).photo_url),
      evidence_photo_url: sanitizeImageUrlForLog((debugTarget as Submission & { evidence_photo_url?: unknown }).evidence_photo_url),
      photo_path: sanitizeImageUrlForLog((debugTarget as Submission & { photo_path?: unknown }).photo_path)
    });
  } else {
    console.info("[client-route-image-debug]", {
      note: "No named debug record matched in current client scope",
      needles: imageDebugNeedles
    });
  }
  const { brandNames: clientBrandNames, projectIds } = visibilityScope;
  const assignedProjectIds = Array.isArray((context as any).profile?.assigned_project_ids) ? ((context as any).profile.assigned_project_ids as string[]) : [];
  const initialAssignedProject = (projects ?? []).find((p) => assignedProjectIds.includes(p.id));
  const initialProjectName = initialAssignedProject ? initialAssignedProject.project_name : undefined;
  const normalizedProjects = normalizeProjectRecords(projects ?? []) as Project[];
  const [{ data: projectTargets }, { data: deploymentProgress }] =
    projectIds.length > 0
      ? await Promise.all([
          supabase.from("project_targets").select("*").in("project_id", projectIds),
          supabase.from("deployment_progress").select("*").in("project_id", projectIds)
        ])
      : [{ data: [] }, { data: [] }];
  console.info("[client-route] dashboard related data resolved", {
    projectTargetCount: projectTargets?.length ?? 0,
    deploymentProgressCount: deploymentProgress?.length ?? 0,
    initialView
  });

  return (
    <ClientDashboard
      client={effectiveClient}
      submissions={submissions as Submission[]}
      availableBrands={clientBrandNames}
      projects={normalizedProjects}
      projectTargets={(projectTargets ?? []) as ProjectTarget[]}
      deploymentProgress={(deploymentProgress ?? []) as DeploymentProgress[]}
      initialView={initialView}
      initialProjectName={initialProjectName}
      notificationsEnabled={notificationsEnabled()}
    />
  );
}
