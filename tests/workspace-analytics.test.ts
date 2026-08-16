import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildWorkspaceAnalytics, filterWorkspaceAnalyticsSubmissions, isMissingDeploymentProgressTable } from "../lib/workspace/analyticsCore.ts";
import type { Project, Submission } from "../lib/types.ts";

function submission(overrides: Partial<Submission>): Submission {
  return {
    id: "submission-1",
    local_submission_id: null,
    client_id: "tenant-a",
    installer_user_id: "installer-1",
    project_id: "project-1",
    brand_id: "brand-1",
    project_name: "Project One",
    installer_name: "Installer One",
    installer_email: null,
    brand_name: "Brand One",
    detected_brand_name: null,
    brand_match_status: "Matched",
    mismatch_reason: null,
    ai_review_note: null,
    ai_confidence_score: null,
    ai_confidence_level: null,
    auto_approved: false,
    duplicate_status: "Unique",
    duplicate_reason: null,
    image_fingerprint: null,
    selected_outlet_id: null,
    selected_outlet_code: null,
    selected_outlet_name: "Outlet One",
    selected_outlet_address: null,
    selected_outlet_brand_type: null,
    selected_outlet_state: "Do not use",
    outlet_match_status: "not_checked",
    outlet_match_notes: null,
    salon_name: null,
    address: null,
    phone: null,
    gps_latitude: 6.5,
    gps_longitude: 3.3,
    installer_state: "Lagos",
    installer_region: null,
    installer_lga: null,
    resolved_address: null,
    resolved_street: null,
    resolved_neighbourhood: null,
    resolved_lga: null,
    resolved_city: null,
    resolved_state: "Lagos",
    resolved_country: null,
    deployment_stage_code: "installed",
    state_region: "South West",
    status: "Approved",
    image_url: "https://example.com/image.jpg",
    image_path: null,
    ocr_text: null,
    ocr_salon_name: null,
    ocr_address: null,
    ocr_brand_name: null,
    ocr_phone: null,
    ocr_raw_text: null,
    ocr_confidence: null,
    ocr_note: null,
    approval_comments: null,
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    ai_raw_text: null,
    captured_at: null,
    installation_date: null,
    installation_time: null,
    submitted_at: "2026-08-10T10:00:00.000Z",
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    client_id: "tenant-a",
    brand_id: "brand-1",
    project_name: "Project One",
    campaign_name: null,
    start_date: null,
    end_date: null,
    target_quantity: 4,
    status: "Active",
    regions_covered: [],
    assigned_installers: [],
    archived_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

test("analytics loader is tenant scoped and preserves workspace_id-null compatibility", () => {
  const source = readFileSync(new URL("../lib/workspace/analytics.ts", import.meta.url), "utf8");
  const core = readFileSync(new URL("../lib/workspace/analyticsCore.ts", import.meta.url), "utf8");
  assert.match(source, /from\("submissions"\)/);
  assert.match(source, /\.eq\("client_id", workspace\.clientId\)/);
  assert.doesNotMatch(source, /\.eq\("workspace_id", workspace\.clientId\)/);
  assert.match(source, /\.is\("archived_at", null\)/);
  assert.match(core, /PGRST205/);
  assert.match(source, /compatibleDeploymentProgress/);
});

test("only the known absent optional progress table is treated as compatible", () => {
  assert.equal(isMissingDeploymentProgressTable({ code: "PGRST205", message: "Could not find the table 'public.deployment_progress' in the schema cache" }), true);
  assert.equal(isMissingDeploymentProgressTable({ code: "PGRST205", message: "Could not find the table 'public.submissions' in the schema cache" }), false);
  assert.equal(isMissingDeploymentProgressTable({ code: "42501", message: "permission denied" }), false);
});

test("canonical KPI calculations use Core Admin operations rules", () => {
  const rows = [
    submission({ id: "approved", status: "Approved", gps_latitude: 6.5, gps_longitude: 3.3 }),
    submission({ id: "pending", status: "Flagged", brand_match_status: "Mismatch", gps_latitude: null, gps_longitude: null }),
    submission({ id: "rejected", status: "Rejected", installer_name: "Installer Two", brand_name: "Brand Two", gps_latitude: 7.2, gps_longitude: 4.1 }),
  ];
  const analytics = buildWorkspaceAnalytics({ submissions: rows, projects: [project()], projectTargets: [], deploymentProgress: [] });

  assert.deepEqual(analytics.kpis, {
    total: 3,
    actual: 3,
    completion: 75,
    approved: 1,
    pending: 1,
    rejected: 1,
    outstanding: 1,
    gpsVerifiedPercent: 67,
  });
  assert.deepEqual(analytics.statusCounts, [
    { status: "Approved", count: 1 },
    { status: "Pending", count: 0 },
    { status: "Flagged", count: 1 },
    { status: "Rejected", count: 1 },
    { status: "Correction Requested", count: 0 },
  ]);
  assert.deepEqual(analytics.gpsQuality, [
    { label: "Verified / valid", count: 2 },
    { label: "Missing / unavailable", count: 1 },
  ]);
});

test("configured project targets drive zero-submission Dashboard KPIs", () => {
  const analytics = buildWorkspaceAnalytics({
    submissions: [],
    projects: [project({ target_quantity: 0 })],
    projectTargets: [{
      id: "target-1",
      project_id: "project-1",
      installer_name: null,
      agency_name: null,
      region: null,
      state: null,
      target_quantity: 7645,
      deployment_timeline_start: null,
      deployment_timeline_end: null,
      created_at: "2026-08-01T00:00:00.000Z",
    }],
    deploymentProgress: [],
  });

  assert.equal(analytics.portfolio.expected, 7645);
  assert.equal(analytics.kpis.actual, 0);
  assert.equal(analytics.kpis.outstanding, 7645);
  assert.equal(analytics.kpis.completion, 0);
  assert.equal(analytics.kpis.approved, 0);
  assert.equal(analytics.kpis.pending, 0);
  assert.equal(analytics.kpis.rejected, 0);
  assert.equal(analytics.kpis.gpsVerifiedPercent, 0);
});

test("combined and individual project reporting preserve project boundaries", () => {
  const projects = [
    project({ id: "project-1", project_name: "Van Rollout", campaign_name: "Van Campaign", target_quantity: 4 }),
    project({ id: "project-2", project_name: "Store Rollout", campaign_name: "Store Campaign", target_quantity: 6 }),
  ];
  const targets = projects.map((item, index) => ({
    id: `target-${index + 1}`,
    project_id: item.id,
    installer_name: null,
    agency_name: null,
    region: null,
    state: null,
    target_quantity: item.target_quantity,
    deployment_timeline_start: null,
    deployment_timeline_end: null,
    created_at: "2026-08-01T00:00:00.000Z",
  }));
  const submissions = [
    submission({ id: "van-1", project_id: "project-1", project_name: "Van Rollout", status: "Approved" }),
    submission({ id: "store-1", project_id: "project-2", project_name: "Store Rollout", status: "Pending" }),
  ];

  const combined = buildWorkspaceAnalytics({ submissions, projects, projectTargets: targets, deploymentProgress: [] });
  const selected = buildWorkspaceAnalytics({ submissions, projects, projectTargets: targets, deploymentProgress: [], filters: { projectId: "project-2" } });

  assert.equal(combined.portfolio.expected, 10);
  assert.equal(combined.projectProgress.length, 2);
  assert.deepEqual(combined.projectProgress.map((row) => row.project), ["Van Rollout", "Store Rollout"]);
  assert.equal(selected.portfolio.expected, 6);
  assert.equal(selected.projectProgress.length, 1);
  assert.equal(selected.projectProgress[0].campaign, "Store Campaign");
});

test("Dashboard and Analytics preserve their monitor versus analyse boundary", () => {
  const page = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceAnalyticsClient.tsx", import.meta.url), "utf8");

  for (const label of ["Expected / target deployments", "Actual deployments", "Outstanding", "Completion", "Approved", "Pending", "Rejected", "GPS verified"]) {
    assert.match(page, new RegExp(label));
  }
  for (const chart of ["Deployment trend", "Deployment by project", "State / region performance", "Installer performance", "Brand compliance", "GPS quality", "Approval and rejection pattern"]) {
    assert.match(client, new RegExp(chart));
  }
  assert.match(client, /No data yet/);
  assert.doesNotMatch(client, /<Metric label="Actual deployments"/);
});

test("filters update the same canonical submission set used by KPI and aggregations", () => {
  const rows = [
    submission({ id: "one", brand_name: "Brand One", status: "Approved", resolved_state: "Lagos" }),
    submission({ id: "two", project_id: "project-2", project_name: "Project Two", brand_name: "Brand Two", installer_name: "Installer Two", status: "Pending", resolved_state: null, installer_state: "Abuja", submitted_at: "2026-08-12T10:00:00.000Z" }),
  ];
  const projects = [project(), project({ id: "project-2", project_name: "Project Two", target_quantity: 2 })];

  assert.equal(filterWorkspaceAnalyticsSubmissions(rows, projects, { projectId: "project-2" }).length, 1);
  assert.equal(filterWorkspaceAnalyticsSubmissions(rows, projects, { brand: "brand two", status: "Pending" }).length, 1);
  assert.equal(filterWorkspaceAnalyticsSubmissions(rows, projects, { state: "Abuja", dateFrom: "2026-08-12" }).length, 1);
});

test("project-scoped child filters use project data and reset invalid selections", () => {
  const rows = [submission({ brand_name: "Darling", installer_region: "South East", resolved_state: "Abia" })];
  const scoped = buildWorkspaceAnalytics({ submissions: rows, projects: [project({ primary_target_region: "South East", primary_target_state: "Abia" })], projectTargets: [], deploymentProgress: [], filters: { projectId: "project-1", brand: "Other" } });
  assert.equal(scoped.submissions.length, 0);
  const source = readFileSync(new URL("../components/workspace/WorkspaceAnalyticsClient.tsx", import.meta.url), "utf8");
  assert.match(source, /brandOptions/);
  assert.match(source, /regionOptions/);
  assert.match(source, /stateOptions/);
  assert.match(source, /current\.brand && brandOptions\.includes/);
});

test("geography uses resolved_state then installer_state then state_region and ignores selected outlet state", () => {
  const rows = [
    submission({ id: "resolved", resolved_state: "Lagos", installer_state: "Abuja", selected_outlet_state: "Wrong" }),
    submission({ id: "installer", resolved_state: null, installer_state: "Abuja", state_region: "North", selected_outlet_state: "Wrong" }),
    submission({ id: "region", resolved_state: null, installer_state: null, state_region: "Kano", selected_outlet_state: "Wrong" }),
  ];
  const analytics = buildWorkspaceAnalytics({ submissions: rows, projects: [project()], projectTargets: [], deploymentProgress: [] });

  assert.deepEqual(analytics.stateCounts.map((row) => row.state).sort(), ["Abuja", "Kano", "Lagos"]);
  assert.equal(analytics.stateCounts.some((row) => row.state === "Wrong"), false);
});

test("installer and brand aggregations reuse Core Admin reporting definitions", () => {
  const rows = [
    submission({ id: "matched", installer_name: "Installer One", brand_name: "Brand One", brand_match_status: "Matched" }),
    submission({ id: "mismatch", installer_name: "Installer One", brand_name: "Brand One", brand_match_status: "Mismatch" }),
    submission({ id: "brand-two", installer_user_id: "installer-2", installer_name: "Installer Two", brand_name: "Brand Two", brand_match_status: "Matched" }),
  ];
  const analytics = buildWorkspaceAnalytics({ submissions: rows, projects: [project()], projectTargets: [], deploymentProgress: [] });

  assert.equal(analytics.installerPerformance.find((row) => row.installer === "Installer One")?.score, 50);
  assert.equal(analytics.brandCompliance.find((row) => row.brand === "Brand One")?.score, 50);
  assert.equal(analytics.brandCompliance.find((row) => row.brand === "Brand Two")?.score, 100);
});

test("zero-data and query-error states are distinct", () => {
  const emptyAnalytics = buildWorkspaceAnalytics({ submissions: [], projects: [project()], projectTargets: [], deploymentProgress: [] });
  assert.equal(emptyAnalytics.kpis.actual, 0);
  assert.equal(emptyAnalytics.kpis.completion, 0);
  assert.equal(emptyAnalytics.kpis.gpsVerifiedPercent, 0);
  assert.equal(emptyAnalytics.submissions.length, 0);

  const source = readFileSync(new URL("../lib/workspace/analytics.ts", import.meta.url), "utf8");
  assert.match(source, /queryStatus: "error"/);
  assert.match(source, /queryStatus: "success"/);
  assert.match(source, /isEmpty: canonicalSubmissions\.length === 0/);
});
