import type { BuildModuleContext } from "@/lib/build/types";

export function getSiteDiaryModuleStatus(context: BuildModuleContext) {
  return {
    module: "site-diary",
    projectId: context.projectId,
    ready: false,
    note: "Site diary workflows are not implemented in Sprint 1 foundation."
  };
}
