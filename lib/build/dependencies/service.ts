import { AccessControlError } from "@/lib/accessControl";
import { assertWorkPackageAccess } from "@/lib/build/workPackages/service";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { BuildActivityTemplate } from "@/lib/build/templates/types";
import type {
  BuildActivityDependencyLagUnit,
  BuildActivityDependencyType,
  BuildActivityTemplateDependency,
  CreateBuildActivityTemplateDependencyInput,
  DependencyGraphValidationResult,
  DependencyValidationIssue,
  UpdateBuildActivityTemplateDependencyInput
} from "@/lib/build/dependencies/types";

type TemplateRow = {
  id: string;
  client_id: string | null;
  is_global: boolean;
  archived_at: string | null;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDependencyType(value: unknown): BuildActivityDependencyType {
  const candidate = textValue(value).toUpperCase() as BuildActivityDependencyType;
  if (candidate === "FS" || candidate === "SS" || candidate === "FF" || candidate === "SF") return candidate;
  return "FS";
}

function parseLagUnit(value: unknown): BuildActivityDependencyLagUnit {
  const candidate = textValue(value).toLowerCase() as BuildActivityDependencyLagUnit;
  if (candidate === "hours" || candidate === "days" || candidate === "weeks") return candidate;
  return "days";
}

function normalizeDependency(row: Record<string, unknown>): BuildActivityTemplateDependency {
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    predecessor_activity_template_id: textValue(row.predecessor_activity_template_id),
    successor_activity_template_id: textValue(row.successor_activity_template_id),
    dependency_type: parseDependencyType(row.dependency_type),
    lag_value: Number(row.lag_value || 0),
    lag_unit: parseLagUnit(row.lag_unit),
    mandatory: Boolean(row.mandatory),
    notes: textValue(row.notes) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    archived_at: textValue(row.archived_at) || null
  };
}

async function getVisibleTemplateOrThrow(params: {
  templateId: string;
  clientId: string;
  includeArchived?: boolean;
}) {
  const supabase = createAdminSupabase();
  let query = supabase
    .from("build_work_package_templates")
    .select("id, client_id, is_global, archived_at")
    .eq("id", params.templateId)
    .or(`client_id.eq.${params.clientId},is_global.eq.true`);

  if (!params.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query.maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve template: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Template not found or not visible.", 404);
  return data as TemplateRow;
}

async function getTemplateActivities(templateId: string): Promise<BuildActivityTemplate[]> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_templates")
    .select("id, template_id, activity_category_id, sequence, code, name, description, estimated_duration, mandatory, requires_photo, requires_gps, requires_approval, created_at, updated_at")
    .eq("template_id", templateId)
    .order("sequence", { ascending: true });

  if (error) throw new AccessControlError(`Could not load activity templates for dependency graph: ${error.message}`, 500);

  return (data ?? []).map((row) => ({
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    activity_category_id: textValue(row.activity_category_id) || "",
    sequence: Number(row.sequence || 0),
    code: textValue(row.code),
    name: textValue(row.name),
    description: textValue(row.description) || null,
    estimated_duration: row.estimated_duration === null ? null : Number(row.estimated_duration || 0),
    duration_unit: "days" as const,
    mandatory: Boolean(row.mandatory),
    requires_photo: Boolean(row.requires_photo),
    requires_gps: Boolean(row.requires_gps),
    requires_approval: Boolean(row.requires_approval),
    status: "active" as const,
    notes: null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    archived_at: null
  }));
}

function edgeKey(predecessorId: string, successorId: string) {
  return `${predecessorId}->${successorId}`;
}

export function validateDependencyGraph(params: {
  activityIds: string[];
  dependencies: Array<{
    predecessorActivityTemplateId: string;
    successorActivityTemplateId: string;
  }>;
}): DependencyGraphValidationResult {
  const activityIdSet = new Set(params.activityIds.filter(Boolean));
  const issues: DependencyValidationIssue[] = [];
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const undirected = new Map<string, string[]>();

  for (const activityId of activityIdSet) {
    adjacency.set(activityId, []);
    inDegree.set(activityId, 0);
    undirected.set(activityId, []);
  }

  const seenEdges = new Set<string>();

  for (const dependency of params.dependencies) {
    const predecessor = textValue(dependency.predecessorActivityTemplateId);
    const successor = textValue(dependency.successorActivityTemplateId);

    if (!predecessor || !successor) {
      issues.push({
        code: "MISSING_NODE",
        message: "Dependency requires both predecessor and successor activity template ids."
      });
      continue;
    }

    if (predecessor === successor) {
      issues.push({
        code: "SELF_REFERENCE",
        message: "Activity cannot depend on itself.",
        nodes: [predecessor]
      });
      continue;
    }

    if (!activityIdSet.has(predecessor) || !activityIdSet.has(successor)) {
      issues.push({
        code: "MISSING_NODE",
        message: "Dependency references activity templates outside the current template scope.",
        nodes: [predecessor, successor]
      });
      continue;
    }

    const key = edgeKey(predecessor, successor);
    if (seenEdges.has(key)) {
      issues.push({
        code: "DUPLICATE_EDGE",
        message: "Duplicate dependency pair detected.",
        nodes: [predecessor, successor]
      });
      continue;
    }
    seenEdges.add(key);

    adjacency.get(predecessor)?.push(successor);
    inDegree.set(successor, (inDegree.get(successor) || 0) + 1);
    undirected.get(predecessor)?.push(successor);
    undirected.get(successor)?.push(predecessor);
  }

  const queue: string[] = [];
  for (const [node, count] of inDegree.entries()) {
    if (count === 0) queue.push(node);
  }

  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    topologicalOrder.push(node);
    for (const neighbour of adjacency.get(node) ?? []) {
      const next = (inDegree.get(neighbour) || 0) - 1;
      inDegree.set(neighbour, next);
      if (next === 0) queue.push(neighbour);
    }
  }

  if (topologicalOrder.length !== activityIdSet.size) {
    issues.push({
      code: "CYCLE",
      message: "Circular dependency detected in activity dependency graph."
    });
  }

  const disconnectedNodeIds: string[] = [];
  if (activityIdSet.size > 1) {
    const nodes = Array.from(activityIdSet);
    const visited = new Set<string>();
    const stack = [nodes[0]];
    while (stack.length > 0) {
      const node = stack.pop() as string;
      if (visited.has(node)) continue;
      visited.add(node);
      for (const neighbour of undirected.get(node) ?? []) {
        if (!visited.has(neighbour)) stack.push(neighbour);
      }
    }

    for (const node of nodes) {
      if (!visited.has(node)) disconnectedNodeIds.push(node);
    }

    if (disconnectedNodeIds.length > 0) {
      issues.push({
        code: "DISCONNECTED",
        message: "Dependency graph contains disconnected activities.",
        nodes: disconnectedNodeIds
      });
    }
  }

  const hasBlockingIssue = issues.some((issue) => issue.code !== "DISCONNECTED");

  return {
    isValid: !hasBlockingIssue,
    issues,
    disconnectedNodeIds,
    topologicalOrder
  };
}

function assertBlockingValidation(result: DependencyGraphValidationResult) {
  const blockingIssues = result.issues.filter((issue) => issue.code !== "DISCONNECTED");
  if (blockingIssues.length === 0) return;
  throw new AccessControlError(blockingIssues.map((issue) => issue.message).join(" "), 400);
}

export async function assertDependencyAccess(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  dependencyId?: string | null;
  canWrite?: boolean;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: params.canWrite
  });

  const templateId = textValue(params.templateId);
  if (!templateId) throw new AccessControlError("templateId is required.", 400);

  const template = await getVisibleTemplateOrThrow({
    templateId,
    clientId: access.project.client_id,
    includeArchived: true
  });

  const activities = await getTemplateActivities(template.id);
  const activityIdSet = new Set(activities.map((activity) => activity.id));

  let dependency: BuildActivityTemplateDependency | null = null;
  const dependencyId = textValue(params.dependencyId);
  if (dependencyId) {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase
      .from("build_activity_template_dependencies")
      .select("*")
      .eq("id", dependencyId)
      .maybeSingle();

    if (error) throw new AccessControlError(`Could not resolve dependency: ${error.message}`, 500);
    if (!data) throw new AccessControlError("Dependency not found.", 404);

    const normalized = normalizeDependency(data as Record<string, unknown>);
    if (normalized.template_id !== template.id) {
      throw new AccessControlError("Dependency does not belong to the specified template.", 400);
    }
    if (
      !activityIdSet.has(normalized.predecessor_activity_template_id) ||
      !activityIdSet.has(normalized.successor_activity_template_id)
    ) {
      throw new AccessControlError("Dependency activity references are outside template scope.", 400);
    }

    dependency = normalized;
  }

  return {
    authContext: access.authContext,
    project: access.project,
    site: access.site,
    workPackage: access.workPackage,
    template,
    activities,
    dependency
  };
}

export async function getDependencies(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  includeArchived?: boolean;
}) {
  const access = await assertDependencyAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    canWrite: false
  });

  const includeArchived = Boolean(params.includeArchived);
  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived dependencies.", 403);
  }

  const supabase = createAdminSupabase();
  let query = supabase
    .from("build_activity_template_dependencies")
    .select("*")
    .eq("template_id", access.template.id)
    .order("created_at", { ascending: true });

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load dependencies: ${error.message}`, 500);

  const dependencies = (data ?? []).map((row) => normalizeDependency(row as Record<string, unknown>));
  const graphValidation = validateDependencyGraph({
    activityIds: access.activities.map((activity) => activity.id),
    dependencies: dependencies.map((dependency) => ({
      predecessorActivityTemplateId: dependency.predecessor_activity_template_id,
      successorActivityTemplateId: dependency.successor_activity_template_id
    }))
  });

  return { dependencies, graphValidation };
}

export async function getDependency(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  dependencyId: string;
  includeArchived?: boolean;
}) {
  const access = await assertDependencyAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    dependencyId: params.dependencyId,
    canWrite: false
  });

  if (!access.dependency) return null;
  if (!params.includeArchived && access.dependency.archived_at) return null;
  return access.dependency;
}

export async function createDependency(params: {
  request?: Request;
  input: CreateBuildActivityTemplateDependencyInput;
}) {
  const input = params.input;
  const access = await assertDependencyAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    canWrite: true
  });

  const predecessorId = textValue(input.predecessorActivityTemplateId);
  const successorId = textValue(input.successorActivityTemplateId);
  if (!predecessorId || !successorId) {
    throw new AccessControlError("Both predecessorActivityTemplateId and successorActivityTemplateId are required.", 400);
  }

  if (!access.activities.some((activity) => activity.id === predecessorId)) {
    throw new AccessControlError("Predecessor activity template does not belong to the selected template.", 400);
  }

  if (!access.activities.some((activity) => activity.id === successorId)) {
    throw new AccessControlError("Successor activity template does not belong to the selected template.", 400);
  }

  if (typeof input.lagValue === "number" && input.lagValue < 0) {
    throw new AccessControlError("lagValue must be zero or greater.", 400);
  }

  const existing = await getDependencies({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    includeArchived: true
  });

  const draftDependencies = [
    ...existing.dependencies.filter((item) => !item.archived_at),
    {
      id: "new",
      template_id: access.template.id,
      predecessor_activity_template_id: predecessorId,
      successor_activity_template_id: successorId,
      dependency_type: parseDependencyType(input.dependencyType),
      lag_value: typeof input.lagValue === "number" ? input.lagValue : 0,
      lag_unit: parseLagUnit(input.lagUnit),
      mandatory: typeof input.mandatory === "boolean" ? input.mandatory : true,
      notes: textValue(input.notes) || null,
      created_at: "",
      updated_at: "",
      archived_at: null
    }
  ];

  const validation = validateDependencyGraph({
    activityIds: access.activities.map((activity) => activity.id),
    dependencies: draftDependencies.map((dependency) => ({
      predecessorActivityTemplateId: dependency.predecessor_activity_template_id,
      successorActivityTemplateId: dependency.successor_activity_template_id
    }))
  });
  assertBlockingValidation(validation);

  const payload = {
    template_id: access.template.id,
    predecessor_activity_template_id: predecessorId,
    successor_activity_template_id: successorId,
    dependency_type: parseDependencyType(input.dependencyType),
    lag_value: typeof input.lagValue === "number" ? input.lagValue : 0,
    lag_unit: parseLagUnit(input.lagUnit),
    mandatory: typeof input.mandatory === "boolean" ? input.mandatory : true,
    notes: textValue(input.notes) || null
  };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_template_dependencies")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Duplicate dependency pair already exists.", 409);
    }
    throw new AccessControlError(`Could not create dependency: ${error.message}`, 500);
  }

  return {
    dependency: normalizeDependency(data as Record<string, unknown>),
    graphValidation: validation
  };
}

export async function updateDependency(params: {
  request?: Request;
  input: UpdateBuildActivityTemplateDependencyInput;
}) {
  const input = params.input;
  const access = await assertDependencyAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    dependencyId: input.id,
    canWrite: true
  });

  const current = access.dependency;
  if (!current) throw new AccessControlError("Dependency not found.", 404);

  const predecessorId =
    typeof input.predecessorActivityTemplateId === "string"
      ? textValue(input.predecessorActivityTemplateId)
      : current.predecessor_activity_template_id;
  const successorId =
    typeof input.successorActivityTemplateId === "string"
      ? textValue(input.successorActivityTemplateId)
      : current.successor_activity_template_id;

  if (!predecessorId || !successorId) {
    throw new AccessControlError("Both predecessor and successor activities are required.", 400);
  }

  if (!access.activities.some((activity) => activity.id === predecessorId)) {
    throw new AccessControlError("Predecessor activity template does not belong to the selected template.", 400);
  }

  if (!access.activities.some((activity) => activity.id === successorId)) {
    throw new AccessControlError("Successor activity template does not belong to the selected template.", 400);
  }

  const existing = await getDependencies({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    includeArchived: true
  });

  const draftDependencies = existing.dependencies
    .filter((dependency) => !dependency.archived_at)
    .map((dependency) =>
      dependency.id === current.id
        ? {
            ...dependency,
            predecessor_activity_template_id: predecessorId,
            successor_activity_template_id: successorId
          }
        : dependency
    );

  const validation = validateDependencyGraph({
    activityIds: access.activities.map((activity) => activity.id),
    dependencies: draftDependencies.map((dependency) => ({
      predecessorActivityTemplateId: dependency.predecessor_activity_template_id,
      successorActivityTemplateId: dependency.successor_activity_template_id
    }))
  });
  assertBlockingValidation(validation);

  const updates: Record<string, unknown> = {
    predecessor_activity_template_id: predecessorId,
    successor_activity_template_id: successorId,
    updated_at: new Date().toISOString()
  };

  if (input.dependencyType) updates.dependency_type = parseDependencyType(input.dependencyType);
  if (typeof input.lagValue === "number") {
    if (input.lagValue < 0) throw new AccessControlError("lagValue must be zero or greater.", 400);
    updates.lag_value = input.lagValue;
  }
  if (input.lagUnit) updates.lag_unit = parseLagUnit(input.lagUnit);
  if (typeof input.mandatory === "boolean") updates.mandatory = input.mandatory;
  if ("notes" in input) updates.notes = textValue(input.notes) || null;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_template_dependencies")
    .update(updates)
    .eq("id", current.id)
    .eq("template_id", access.template.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Duplicate dependency pair already exists.", 409);
    }
    throw new AccessControlError(`Could not update dependency: ${error.message}`, 500);
  }

  return {
    dependency: normalizeDependency(data as Record<string, unknown>),
    graphValidation: validation
  };
}

export async function archiveDependency(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  dependencyId: string;
}) {
  const access = await assertDependencyAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    dependencyId: params.dependencyId,
    canWrite: true
  });

  const current = access.dependency;
  if (!current) throw new AccessControlError("Dependency not found.", 404);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_template_dependencies")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", current.id)
    .eq("template_id", access.template.id)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive dependency: ${error.message}`, 500);

  const graphValidation = validateDependencyGraph({
    activityIds: access.activities.map((activity) => activity.id),
    dependencies: (await getDependencies({
      request: params.request,
      projectId: params.projectId,
      siteId: params.siteId,
      workPackageId: params.workPackageId,
      templateId: params.templateId,
      includeArchived: false
    })).dependencies.map((dependency) => ({
      predecessorActivityTemplateId: dependency.predecessor_activity_template_id,
      successorActivityTemplateId: dependency.successor_activity_template_id
    }))
  });

  return {
    dependency: normalizeDependency(data as Record<string, unknown>),
    graphValidation
  };
}
