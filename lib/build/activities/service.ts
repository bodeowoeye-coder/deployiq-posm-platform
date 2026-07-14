import type { BuildModuleContext } from "@/lib/build/types";

export function getActivitiesModuleStatus(context: BuildModuleContext) {
  return {
    module: "activities",
    projectId: context.projectId,
    ready: false,
    note: "Activities workflows are not implemented in Sprint 1 foundation."
  };
}
