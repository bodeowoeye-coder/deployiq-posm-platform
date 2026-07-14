import type { BuildModuleContext } from "@/lib/build/types";

export function getSuppliesModuleStatus(context: BuildModuleContext) {
  return {
    module: "supplies",
    projectId: context.projectId,
    ready: false,
    note: "Supplies workflows are not implemented in Sprint 1 foundation."
  };
}
