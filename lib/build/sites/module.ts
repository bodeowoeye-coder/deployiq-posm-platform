import type { BuildModuleContext } from "@/lib/build/types";

export function getSitesModuleStatus(context: BuildModuleContext) {
  return {
    module: "sites",
    projectId: context.projectId,
    siteId: context.siteId,
    ready: false,
    note: "Site foundation is available; full site management workflows are deferred to Sprint 2."
  };
}
