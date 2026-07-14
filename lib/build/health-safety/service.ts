import type { BuildModuleContext } from "@/lib/build/types";

export function getHealthSafetyModuleStatus(context: BuildModuleContext) {
  return {
    module: "health-safety",
    projectId: context.projectId,
    ready: false,
    note: "Health and safety workflows are not implemented in Sprint 1 foundation."
  };
}
