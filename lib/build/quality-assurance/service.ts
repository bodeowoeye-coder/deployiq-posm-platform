import type { BuildModuleContext } from "@/lib/build/types";

export function getQualityAssuranceModuleStatus(context: BuildModuleContext) {
  return {
    module: "quality-assurance",
    projectId: context.projectId,
    ready: false,
    note: "Quality assurance workflows are not implemented in Sprint 1 foundation."
  };
}
