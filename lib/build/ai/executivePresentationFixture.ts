import "server-only";

import type { ExecutiveIntelligenceViewModel } from "./executivePresentation.ts";

const PROJECT_ID = "a1000000-0000-4000-8000-000000000002";
const timing = { asOf: "2026-09-20T17:30:00.000Z", generatedAt: "2026-09-20T17:31:12.000Z" };
const historyPeriod = { from: "2026-09-14", through: "2026-09-20", timezone: "UTC" as const, cadence: "daily" as const };
const reference = (factPath: string) => ({ toolCallId: "tool-call-1", factPath, provenanceKeys: ["local-presentation-fixture"] });

export function getLocalExecutivePresentationFixture(projectId: string): ExecutiveIntelligenceViewModel | null {
  if (process.env.NODE_ENV !== "development" || process.env.DEPLOYIQ_BUILD_EXECUTIVE_FIXTURE !== "1" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321" || projectId !== PROJECT_ID) return null;
  const evidence: ExecutiveIntelligenceViewModel["evidence"] = [
    { id: "fact-completed", label: "Activities Completed", source: { task: "executive_summary", label: "Executive Position" }, availability: "available", value: { type: "count", raw: 2 }, timing, authoritativeReference: reference("/currentState/activitiesCompleted"), href: null },
    { id: "fact-accepted", label: "Activities Accepted", source: { task: "executive_summary", label: "Executive Position" }, availability: "available", value: { type: "count", raw: 1 }, timing, authoritativeReference: reference("/currentState/activitiesAccepted"), href: null },
    { id: "fact-overdue", label: "Current Overdue", source: { task: "executive_summary", label: "Executive Position" }, availability: "available", value: { type: "count", raw: 3 }, timing, authoritativeReference: reference("/currentState/currentOverdue"), href: null },
    { id: "fact-exceptions", label: "Open Exceptions", source: { task: "executive_summary", label: "Executive Position" }, availability: "available", value: { type: "count", raw: 0 }, timing, authoritativeReference: reference("/currentState/openExceptions"), href: null },
    { id: "attention-overdue", label: "Schedule Overdue", source: { task: "management_attention", label: "Management Attention" }, availability: "available", value: { type: "count", raw: 3 }, timing, authoritativeReference: reference("/attention/summary/categoryCounts/scheduleOverdue"), href: null },
    { id: "attention-blocked", label: "Execution Blocks", source: { task: "management_attention", label: "Management Attention" }, availability: "available", value: { type: "count", raw: 1 }, timing, authoritativeReference: reference("/attention/summary/categoryCounts/executionBlocks"), href: null },
    { id: "history-started", label: "Activities Started", source: { task: "change_interpretation", label: "Material Execution Changes" }, availability: "available", value: { type: "count", raw: 2 }, timing: { ...timing, historyPeriod }, authoritativeReference: reference("/history/summary/activitiesStarted"), href: null },
    { id: "history-completed", label: "Activities Completed", source: { task: "change_interpretation", label: "Material Execution Changes" }, availability: "available", value: { type: "count", raw: 1 }, timing: { ...timing, historyPeriod }, authoritativeReference: reference("/history/summary/activitiesCompleted"), href: null },
    { id: "history-blocked", label: "Blocked Events", source: { task: "change_interpretation", label: "Material Execution Changes" }, availability: "available", value: { type: "count", raw: 1 }, timing: { ...timing, historyPeriod }, authoritativeReference: reference("/history/summary/blockedEvents"), href: null },
    { id: "coverage-review", label: "Review Coverage", source: { task: "executive_summary", label: "Executive Position" }, availability: "available", value: { type: "ratio", raw: 0.5 }, timing, authoritativeReference: reference("/quality/reviewCoverage/ratio"), href: null },
    { id: "evidence-unavailable", label: "Evidence descriptor unavailable", source: { task: "management_attention", label: "Management Attention" }, availability: "descriptor_unavailable", value: null, timing, authoritativeReference: reference("/attention/preview/items/0/internal"), href: null },
  ];
  const statement = (id: string, text: string, evidenceIds: string[], supportState: "fully_supported" | "coverage_limited" = "fully_supported") => ({ id, text, evidenceIds, limitationIds: supportState === "coverage_limited" ? ["partial-review"] : [], supportState });
  return {
    availability: "partial",
    timing: { executive_summary: timing, management_attention: timing, change_interpretation: { ...timing, historyPeriod } },
    executivePosition: { id: "executive_position", availability: "available", statements: [statement("position-1", "Delivery is progressing, while overdue activities require current management attention.", ["fact-completed", "fact-overdue"], "coverage_limited")] },
    managementAttention: { id: "current_management_attention", availability: "available", statements: [statement("attention-1", "Three activities are overdue and one activity is blocked.", ["attention-overdue", "attention-blocked"])] },
    materialChanges: { id: "material_execution_changes", availability: "available", statements: [statement("changes-1", "Two activities started, one completed and one blocking event was recorded during the selected period.", ["history-started", "history-completed", "history-blocked"])] },
    decisionConsiderations: { availability: "available", authority: "non_binding", items: [{ ...statement("decision-1", "Review the overdue completion position with accountable project management.", ["attention-overdue"]), sourceIds: ["decision-1", "decision-2", "decision-3"], itemCount: 3 }] },
    coverage: { availability: "available", measures: [{ label: "Review Coverage", represented: 1, eligible: 2, noun: "review-required Activities" }], limitations: [{ id: "partial-review", code: "partial_coverage", text: "Review conclusions represent 1 of 2 review-required Activities." }] },
    evidence,
    attentionGroups: [{ label: "Schedule Overdue", count: 3, evidenceId: "attention-overdue", href: null }, { label: "Execution Blocks", count: 1, evidenceId: "attention-blocked", href: null }],
    attentionItems: [{ condition: "Activity overdue to complete", expectedNextAction: "Complete work or submit for review as configured", itemCount: 3, evidenceIds: ["attention-overdue", "evidence-unavailable"] }],
    executiveFacts: evidence.slice(0, 4).map((item) => ({ label: item.label, value: item.value!.raw, evidenceId: item.id })),
    materialFacts: evidence.slice(6, 9).map((item) => ({ label: item.label, value: item.value!.raw, evidenceId: item.id })),
  };
}
