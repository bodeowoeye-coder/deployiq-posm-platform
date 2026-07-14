import type { BuildModuleContext } from "@/lib/build/types";

export function getProgressModuleStatus(context: BuildModuleContext) {
  return {
    module: "progress",
    projectId: context.projectId,
    ready: false,
    note: "Progress workflows are not implemented in Sprint 1 foundation."
  };
}
