import type { BuildModuleContext } from "@/lib/build/types";

export function getAssetsModuleStatus(context: BuildModuleContext) {
  return {
    module: "assets",
    projectId: context.projectId,
    ready: false,
    note: "Asset workflows are not implemented in Sprint 1 foundation."
  };
}
