import type { ManagementAttentionItem, ManagementAttentionType } from "./managementAttention.ts";

const presentationOrder: Record<ManagementAttentionType, number> = {
  schedule_overdue: 0,
  execution_block: 1,
  changes_required: 2,
  exception: 3,
  review_pending: 4,
  assignment_missing: 5,
  dependency_attention: 6,
  data_incomplete: 7,
};

export function selectActivityAttentionItems(items: ReadonlyArray<ManagementAttentionItem>, activityId: string) {
  return items.filter((item) => item.activityId === activityId).sort((left, right) => {
    if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
    if (left.overdue && right.overdue) {
      const due = (left.dueAt ?? "").localeCompare(right.dueAt ?? "");
      if (due) return due;
    }
    const category = presentationOrder[left.type] - presentationOrder[right.type];
    if (category) return category;
    return (left.dueAt ?? "").localeCompare(right.dueAt ?? "")
      || (left.observedAt ?? "").localeCompare(right.observedAt ?? "")
      || left.key.localeCompare(right.key);
  });
}
