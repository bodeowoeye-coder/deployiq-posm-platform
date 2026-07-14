import type { BuildModuleContext } from "@/lib/build/types";

export function getEquipmentModuleStatus(context: BuildModuleContext) {
  return {
    module: "equipment",
    projectId: context.projectId,
    ready: false,
    note: "Equipment workflows are not implemented in Sprint 1 foundation."
  };
}
