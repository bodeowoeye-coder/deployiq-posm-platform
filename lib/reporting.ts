import type { Submission } from "@/lib/types";

function sortCounts<T extends string>(counts: Map<T, number>, key: string) {
  return Array.from(counts.entries())
    .map(([label, count]) => ({ [key]: label, count }))
    .sort((a, b) => b.count - a.count);
}

export function getDailyCounts(submissions: Submission[]) {
  const counts = new Map<string, number>();

  submissions.forEach((item) => {
    const day = new Date(item.submitted_at).toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getRegionCounts(submissions: Submission[]) {
  const counts = new Map<string, number>();

  submissions.forEach((item) => {
    const region = item.installer_region || item.state_region || "Unknown";
    counts.set(region, (counts.get(region) ?? 0) + 1);
  });

  return sortCounts(counts, "region") as Array<{ region: string; count: number }>;
}

export function getBrandCounts(submissions: Submission[]) {
  const counts = new Map<string, number>();

  submissions.forEach((item) => {
    const brand = item.brand_name || "Unassigned";
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
  });

  return sortCounts(counts, "brand") as Array<{ brand: string; count: number }>;
}

export function getStateCounts(submissions: Submission[]) {
  const counts = new Map<string, number>();

  submissions.forEach((item) => {
    const state = item.installer_state || "Unknown";
    counts.set(state, (counts.get(state) ?? 0) + 1);
  });

  return sortCounts(counts, "state") as Array<{ state: string; count: number }>;
}

export function getProjectCounts(submissions: Submission[]) {
  const counts = new Map<string, number>();

  submissions.forEach((item) => {
    const project = item.project_name || "General Deployment";
    counts.set(project, (counts.get(project) ?? 0) + 1);
  });

  return sortCounts(counts, "project") as Array<{ project: string; count: number }>;
}

export function getInstallerCounts(submissions: Submission[]) {
  const counts = new Map<string, number>();

  submissions.forEach((item) => {
    const installer = item.installer_name || "Unnamed installer";
    counts.set(installer, (counts.get(installer) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([installer, count]) => ({ installer, count }))
    .sort((a, b) => b.count - a.count);
}

function percentage(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

export function getExecutiveMetrics(submissions: Submission[]) {
  const total = submissions.length;
  const approved = submissions.filter((item) => item.status === "Approved").length;
  const mismatched = submissions.filter((item) => item.brand_match_status === "Mismatch").length;
  const duplicates = submissions.filter((item) => item.duplicate_status && item.duplicate_status !== "Unique").length;
  const autoApproved = submissions.filter((item) => item.auto_approved).length;
  const reviewed = submissions.filter((item) => item.reviewed_at);
  const turnaroundHours =
    reviewed.length === 0
      ? 0
      : Math.round(
          reviewed.reduce((sum, item) => sum + (new Date(item.reviewed_at!).getTime() - new Date(item.submitted_at).getTime()), 0) /
            reviewed.length /
            3600000
        );

  return {
    successRate: percentage(approved, total),
    mismatchRate: percentage(mismatched, total),
    duplicateRate: percentage(duplicates, total),
    autoApprovalRate: percentage(autoApproved, total),
    approvalTurnaroundHours: Math.max(turnaroundHours, 0)
  };
}

export function getInstallerAccuracyRanking(submissions: Submission[]) {
  const buckets = new Map<string, { total: number; matched: number }>();
  submissions.forEach((item) => {
    const installer = item.installer_name || "Unnamed installer";
    const current = buckets.get(installer) ?? { total: 0, matched: 0 };
    current.total += 1;
    if (item.brand_match_status === "Matched") current.matched += 1;
    buckets.set(installer, current);
  });

  return Array.from(buckets.entries())
    .map(([installer, value]) => ({ installer, score: percentage(value.matched, value.total), total: value.total }))
    .sort((a, b) => b.score - a.score || b.total - a.total);
}

export function getRegionPerformanceRanking(submissions: Submission[]) {
  const buckets = new Map<string, { total: number; approved: number }>();
  submissions.forEach((item) => {
    const region = item.installer_region || item.state_region || "Unknown";
    const current = buckets.get(region) ?? { total: 0, approved: 0 };
    current.total += 1;
    if (item.status === "Approved") current.approved += 1;
    buckets.set(region, current);
  });

  return Array.from(buckets.entries())
    .map(([region, value]) => ({ region, score: percentage(value.approved, value.total), total: value.total }))
    .sort((a, b) => b.score - a.score || b.total - a.total);
}

export function getBrandComplianceScores(submissions: Submission[]) {
  const buckets = new Map<string, { total: number; compliant: number }>();
  submissions.forEach((item) => {
    const brand = item.brand_name || "Unassigned";
    const current = buckets.get(brand) ?? { total: 0, compliant: 0 };
    current.total += 1;
    if (item.brand_match_status === "Matched" && item.duplicate_status !== "Duplicate") current.compliant += 1;
    buckets.set(brand, current);
  });

  return Array.from(buckets.entries())
    .map(([brand, value]) => ({ brand, score: percentage(value.compliant, value.total), total: value.total }))
    .sort((a, b) => b.score - a.score || b.total - a.total);
}

export function getTrendSeries(submissions: Submission[]) {
  const buckets = new Map<string, { date: string; submissions: number; flagged: number; approved: number; mismatches: number }>();
  submissions.forEach((item) => {
    const date = new Date(item.submitted_at).toISOString().slice(0, 10);
    const current = buckets.get(date) ?? { date, submissions: 0, flagged: 0, approved: 0, mismatches: 0 };
    current.submissions += 1;
    if (item.status === "Flagged") current.flagged += 1;
    if (item.status === "Approved") current.approved += 1;
    if (item.brand_match_status === "Mismatch") current.mismatches += 1;
    buckets.set(date, current);
  });

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}
