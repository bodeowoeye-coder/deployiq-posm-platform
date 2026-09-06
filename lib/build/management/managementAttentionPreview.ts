import type { ManagementAttentionItem } from "./managementAttention.ts";

export type BuildManagementAttentionPreview = ManagementAttentionItem & {
  activityName: string;
  siteName: string;
  workPackageName: string;
  exceptionTitle: string | null;
  exceptionSeverity: "low" | "medium" | "high" | "critical" | null;
};

const attentionOrder: Record<ManagementAttentionItem["type"], number> = {
  execution_block: 1,
  changes_required: 2,
  exception: 3,
  review_pending: 4,
  assignment_missing: 5,
  dependency_attention: 6,
  data_incomplete: 7,
  schedule_overdue: 8,
};

export function orderManagementAttentionPreview(items: ReadonlyArray<BuildManagementAttentionPreview>) {
  return [...items].sort((left, right) => {
    if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
    if (left.overdue && right.overdue) {
      const overdueDue = (left.dueAt ?? "").localeCompare(right.dueAt ?? "");
      if (overdueDue) return overdueDue;
    }
    const category = attentionOrder[left.type] - attentionOrder[right.type];
    if (category) return category;
    const due = (left.dueAt ?? "").localeCompare(right.dueAt ?? "");
    if (due) return due;
    const observed = (left.observedAt ?? "").localeCompare(right.observedAt ?? "");
    if (observed) return observed;
    return left.activityName.localeCompare(right.activityName) || left.sourceRecordId.localeCompare(right.sourceRecordId);
  });
}
