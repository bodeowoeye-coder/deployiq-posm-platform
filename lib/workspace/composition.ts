import { isBuildProjectType, type BuildProjectType } from "../build/projects/types.ts";

export const RETAIL_PROJECT_TYPE = "Retail Deployment" as const;
export type WorkspaceVertical = "retail" | "build";
export type WorkspaceCompositionKind = "shared" | "retail" | "build" | "mixed";
export type WorkspaceCompositionIssue =
  | "none"
  | "product_authority_conflict"
  | "unsupported_product_key"
  | "unknown_project_type"
  | "product_project_conflict";

export type WorkspaceComposition = {
  kind: WorkspaceCompositionKind;
  issue: WorkspaceCompositionIssue;
  productKey: WorkspaceVertical | null;
  settingsProductKey: string | null;
  entitlementProductKeys: string[];
  retailProjectCount: number;
  buildProjectCount: number;
  archivedProjectCount: number;
  unknownProjectTypes: Array<string | null>;
  buildProjectTypes: BuildProjectType[];
};

export type WorkspaceCompositionInput = {
  settingsProductKey?: unknown;
  entitlementProductKeys?: unknown[] | null;
  projects?: Array<{ project_type?: unknown; archived_at?: unknown }> | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalProductKey(value: unknown): WorkspaceVertical | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  const normalized = value.toLowerCase();
  return normalized === "retail" || normalized === "build" ? normalized : null;
}

function sharedResult(
  issue: WorkspaceCompositionIssue,
  facts: Omit<WorkspaceComposition, "kind" | "issue" | "productKey">,
): WorkspaceComposition {
  return { kind: "shared", issue, productKey: null, ...facts };
}

export function resolveWorkspaceComposition(input: WorkspaceCompositionInput): WorkspaceComposition {
  const settingsMalformed = input.settingsProductKey != null
    && (typeof input.settingsProductKey !== "string" || input.settingsProductKey !== input.settingsProductKey.trim());
  const settingsRaw = text(input.settingsProductKey) || null;
  const entitlementInputs = input.entitlementProductKeys ?? [];
  const entitlementMalformed = entitlementInputs.some((value) => typeof value !== "string" || !value || value !== value.trim());
  const entitlementRaw = [...new Set(entitlementInputs.map(text).filter(Boolean))].sort();
  const settingsProduct = canonicalProductKey(settingsRaw);
  const entitlementProducts = [...new Set(entitlementRaw.map(canonicalProductKey).filter((value): value is WorkspaceVertical => Boolean(value)))];

  let retailProjectCount = 0;
  let buildProjectCount = 0;
  let archivedProjectCount = 0;
  const unknownProjectTypes: Array<string | null> = [];
  const buildProjectTypes = new Set<BuildProjectType>();

  for (const project of input.projects ?? []) {
    if (text(project.archived_at)) {
      archivedProjectCount += 1;
      continue;
    }
    const projectType = project.project_type;
    if (projectType === RETAIL_PROJECT_TYPE) {
      retailProjectCount += 1;
    } else if (isBuildProjectType(projectType)) {
      buildProjectCount += 1;
      buildProjectTypes.add(projectType);
    } else {
      unknownProjectTypes.push(text(projectType) || null);
    }
  }

  const facts = {
    settingsProductKey: settingsRaw,
    entitlementProductKeys: entitlementRaw,
    retailProjectCount,
    buildProjectCount,
    archivedProjectCount,
    unknownProjectTypes,
    buildProjectTypes: [...buildProjectTypes].sort(),
  };

  if (settingsMalformed || entitlementMalformed || (settingsRaw && !settingsProduct) || entitlementRaw.some((key) => !canonicalProductKey(key))) {
    return sharedResult("unsupported_product_key", facts);
  }
  const productAuthorities = [...new Set([settingsProduct, ...entitlementProducts].filter((value): value is WorkspaceVertical => Boolean(value)))];
  if (productAuthorities.length > 1 || entitlementProducts.length > 1) {
    return sharedResult("product_authority_conflict", facts);
  }
  if (unknownProjectTypes.length > 0) {
    return sharedResult("unknown_project_type", facts);
  }

  const productKey = productAuthorities[0] ?? null;
  const projectKind: WorkspaceCompositionKind = retailProjectCount > 0 && buildProjectCount > 0
    ? "mixed"
    : retailProjectCount > 0
      ? "retail"
      : buildProjectCount > 0
        ? "build"
        : "shared";

  if (projectKind === "mixed") return { kind: "mixed", issue: "none", productKey, ...facts };
  if (productKey && projectKind !== "shared" && productKey !== projectKind) {
    return sharedResult("product_project_conflict", facts);
  }
  return { kind: projectKind === "shared" ? productKey ?? "shared" : projectKind, issue: "none", productKey, ...facts };
}
