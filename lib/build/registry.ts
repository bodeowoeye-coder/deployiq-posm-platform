import type { BuildModuleHealth, BuildModuleName } from "@/lib/build/types";

const moduleNames: BuildModuleName[] = [
  "sites",
  "work-packages",
  "templates",
  "activity-categories",
  "activities",
  "supplies",
  "progress",
  "documents",
  "site-diary",
  "inspections",
  "quality-assurance",
  "health-safety",
  "assets",
  "equipment"
];

export function listBuildModules() {
  return [...moduleNames];
}

export function getBuildModuleHealth(): BuildModuleHealth[] {
  return moduleNames.map((module) => ({
    module,
    ready: false,
    note: "Foundation scaffold created. Functional implementation is pending."
  }));
}
