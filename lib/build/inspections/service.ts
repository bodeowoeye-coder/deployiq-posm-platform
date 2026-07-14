import type { BuildModuleContext } from "@/lib/build/types";

export function getInspectionsModuleStatus(context: BuildModuleContext) {
  return {
    module: "inspections",
    projectId: context.projectId,
    ready: false,
    note: "Inspection workflows are not implemented in Sprint 1 foundation."
  };
}
