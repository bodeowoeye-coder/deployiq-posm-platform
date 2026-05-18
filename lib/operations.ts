import type { DeploymentProgress, DeploymentStageCode, Project, ProjectTarget, Submission } from "@/lib/types";

const percentage = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

export function getProjectOperations(
  projects: Project[],
  targets: ProjectTarget[],
  submissions: Submission[],
  progress: DeploymentProgress[]
) {
  return projects.map((project) => {
    const projectTargets = targets.filter((target) => target.project_id === project.id);
    const projectSubmissions = submissions.filter(
      (submission) => submission.project_id === project.id || submission.project_name === project.project_name
    );
    const expected = projectTargets.reduce((sum, target) => sum + target.target_quantity, 0) || project.target_quantity;
    const actual = projectSubmissions.length;
    const approved = projectSubmissions.filter((item) => item.status === "Approved").length;
    const pending = projectSubmissions.filter((item) => item.status === "Pending" || item.status === "Flagged").length;
    const rejected = projectSubmissions.filter((item) => item.status === "Rejected").length;
    const outstanding = Math.max(expected - actual, 0);
    const completion = percentage(actual, expected);
    const variance = expected === 0 ? 0 : Math.round(((actual - expected) / expected) * 100);
    const reviewed = projectSubmissions.filter((item) => item.reviewed_at);
    const approvalHours =
      reviewed.length === 0
        ? 0
        : Math.round(
            reviewed.reduce(
              (sum, item) => sum + (new Date(item.reviewed_at!).getTime() - new Date(item.submitted_at).getTime()),
              0
            ) /
              reviewed.length /
              3600000
          );
    const approvedWithinSla = reviewed.filter(
      (item) => new Date(item.reviewed_at!).getTime() - new Date(item.submitted_at).getTime() <= 48 * 3600000
    ).length;
    const stageQuantities = Object.fromEntries(
      progress
        .filter((item) => item.project_id === project.id)
        .map((item) => [item.stage_code, item.quantity])
    ) as Partial<Record<DeploymentStageCode, number>>;

    return {
      project,
      expected,
      actual,
      approved,
      pending,
      rejected,
      outstanding,
      completion,
      variance,
      deploymentEfficiency: percentage(approved, expected || actual),
      averageApprovalHours: Math.max(approvalHours, 0),
      slaCompliance: percentage(approvedWithinSla, reviewed.length),
      stageQuantities,
      submissions: projectSubmissions
    };
  });
}

export function getPortfolioOperations(projectRows: ReturnType<typeof getProjectOperations>) {
  const expected = projectRows.reduce((sum, item) => sum + item.expected, 0);
  const actual = projectRows.reduce((sum, item) => sum + item.actual, 0);
  const approved = projectRows.reduce((sum, item) => sum + item.approved, 0);
  const pending = projectRows.reduce((sum, item) => sum + item.pending, 0);
  const rejected = projectRows.reduce((sum, item) => sum + item.rejected, 0);
  const outstanding = Math.max(expected - actual, 0);
  const approvalValues = projectRows.filter((item) => item.averageApprovalHours > 0);

  return {
    expected,
    actual,
    approved,
    pending,
    rejected,
    outstanding,
    completion: percentage(actual, expected),
    variance: expected === 0 ? 0 : Math.round(((actual - expected) / expected) * 100),
    deploymentEfficiency: percentage(approved, expected || actual),
    installerPerformance: percentage(approved, actual),
    averageApprovalHours:
      approvalValues.length === 0
        ? 0
        : Math.round(approvalValues.reduce((sum, item) => sum + item.averageApprovalHours, 0) / approvalValues.length),
    slaCompliance:
      projectRows.length === 0
        ? 0
        : Math.round(projectRows.reduce((sum, item) => sum + item.slaCompliance, 0) / projectRows.length)
  };
}

export function getStageTotals(projectRows: ReturnType<typeof getProjectOperations>) {
  return ["production", "warehouse", "in_transit", "installed", "approved"].map((stage) => ({
    stage,
    quantity: projectRows.reduce(
      (sum, item) => sum + (item.stageQuantities[stage as DeploymentStageCode] ?? (stage === "installed" ? item.actual : stage === "approved" ? item.approved : 0)),
      0
    )
  }));
}

export function getOperationalAlerts(projectRows: ReturnType<typeof getProjectOperations>) {
  const now = Date.now();
  return projectRows.flatMap((row) => {
    const alerts: Array<{ type: string; severity: "high" | "medium"; message: string }> = [];
    const endDate = row.project.end_date ? new Date(row.project.end_date).getTime() : null;

    if (row.expected > 0 && row.completion < 50 && row.project.status === "Active") {
      alerts.push({
        type: "low_completion",
        severity: "medium",
        message: `${row.project.project_name} is at ${row.completion}% completion against target.`
      });
    }
    if (endDate && endDate < now && row.outstanding > 0) {
      alerts.push({
        type: "overdue_deployment",
        severity: "high",
        message: `${row.project.project_name} is past its end date with ${row.outstanding} outstanding installations.`
      });
    }
    if (row.rejected > 0) {
      alerts.push({
        type: "rejected_deployment",
        severity: "medium",
        message: `${row.project.project_name} has ${row.rejected} rejected deployments requiring attention.`
      });
    }
    if (row.project.status === "Active" && row.actual === 0 && row.project.start_date && new Date(row.project.start_date).getTime() < now) {
      alerts.push({
        type: "stalled_project",
        severity: "high",
        message: `${row.project.project_name} has started but no deployments are recorded yet.`
      });
    }
    return alerts;
  });
}

export function getTargetAllocationRows(targets: ProjectTarget[], submissions: Submission[], projects: Project[]) {
  return targets.map((target) => {
    const project = projects.find((item) => item.id === target.project_id);
    const actual = submissions.filter((submission) => {
      const sameProject =
        submission.project_id === target.project_id ||
        Boolean(project && submission.project_name === project.project_name);
      const sameState = !target.state || submission.installer_state === target.state;
      const sameRegion = !target.region || submission.installer_region === target.region;
      const sameInstaller = !target.installer_name || submission.installer_name === target.installer_name;
      return sameProject && sameState && sameRegion && sameInstaller;
    }).length;
    const pending = Math.max(target.target_quantity - actual, 0);
    return {
      target,
      project,
      expected: target.target_quantity,
      actual,
      pending,
      completion: percentage(actual, target.target_quantity),
      variance: target.target_quantity === 0 ? 0 : Math.round(((actual - target.target_quantity) / target.target_quantity) * 100)
    };
  });
}
