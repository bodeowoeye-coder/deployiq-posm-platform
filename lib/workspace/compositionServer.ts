import "server-only";

import {
  resolveWorkspaceComposition as classifyWorkspaceComposition,
  type WorkspaceCompositionInput,
} from "./composition.ts";

export type {
  WorkspaceComposition,
  WorkspaceCompositionIssue,
  WorkspaceCompositionKind,
  WorkspaceVertical,
} from "./composition.ts";

export function resolveWorkspaceComposition(input: WorkspaceCompositionInput) {
  return classifyWorkspaceComposition(input);
}
