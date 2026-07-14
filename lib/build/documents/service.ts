import type { BuildModuleContext } from "@/lib/build/types";

export function getDocumentsModuleStatus(context: BuildModuleContext) {
  return {
    module: "documents",
    projectId: context.projectId,
    ready: false,
    note: "Documents workflows are not implemented in Sprint 1 foundation."
  };
}
