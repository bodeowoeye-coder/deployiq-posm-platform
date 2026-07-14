import type { BuildModuleContext } from "@/lib/build/types";

export function getWorkPackagesModuleStatus(context: BuildModuleContext) {
  return {
    module: "work-packages",
    projectId: context.projectId,
    siteId: context.siteId,
    ready: false,
    note: "Work Package foundation is available; operational module implementations are deferred to Sprint 2B+."
  };
}
