import type { BuildModuleContext } from "@/lib/build/types";

export function getResourcesModuleStatus(context: BuildModuleContext) {
  return {
    module: "resources",
    projectId: context.projectId,
    siteId: context.siteId,
    ready: false,
    note: "Shared resource catalogue and template requirement foundation is available; live assignment and consumption workflows are deferred."
  };
}
