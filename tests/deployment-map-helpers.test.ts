import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkspaceMapMetrics,
  deriveMapGpsStatus,
  filterWorkspaceMapRows,
  mapQueryStatus,
  normalizeWorkspaceMapPoint,
  resolveLocationState,
  type WorkspaceMapPoint,
} from "../lib/workspace/deploymentMap.ts";

test("tenant-scoped map rows reject mismatched client ids", () => {
  const rows = [
    { client_id: "tenant-a", project_id: "p1", project_name: "Project One", installer_name: "A", selected_outlet_name: "Outlet 1", status: "Approved", gps_latitude: 12.5, gps_longitude: 13.5 },
    { client_id: "tenant-b", project_id: "p2", project_name: "Project Two", installer_name: "B", selected_outlet_name: "Outlet 2", status: "Pending", gps_latitude: 10, gps_longitude: 11 },
  ];

  const result = filterWorkspaceMapRows(rows, { clientId: "tenant-a" });
  assert.equal(result.length, 1);
  assert.equal(result[0].clientId, "tenant-a");
});

test("geography fallback prefers resolved state then installer state then state region", () => {
  const resolved = { resolved_state: "Lagos", installer_state: "Abuja", state_region: "North" };
  const installer = { resolved_state: "", installer_state: "Ogun", state_region: "South" };
  const region = { resolved_state: "", installer_state: "", state_region: "Kano" };

  assert.equal(resolveLocationState(resolved), "Lagos");
  assert.equal(resolveLocationState(installer), "Ogun");
  assert.equal(resolveLocationState(region), "Kano");
});

test("invalid or missing GPS rows are not plotted", () => {
  const rows = [
    { id: "1", project_name: "Project", installer_name: "Installer A", selected_outlet_name: "Outlet A", gps_latitude: 12.5, gps_longitude: 13.5, status: "Approved", gps_status: "Verified" },
    { id: "2", project_name: "Project", installer_name: "Installer B", selected_outlet_name: "Outlet B", gps_latitude: null, gps_longitude: null, status: "Pending", gps_status: "Unavailable" },
    { id: "3", project_name: "Project", installer_name: "Installer C", selected_outlet_name: "Outlet C", gps_latitude: 200, gps_longitude: 50, status: "Flagged", gps_status: "Approximate" },
  ];

  const points = rows.map(normalizeWorkspaceMapPoint);
  assert.equal(points.filter((point) => point.latitude !== null && point.longitude !== null).length, 1);
  assert.equal(points[0].gpsStatus, "Verified");
});

test("status and project filters work against canonical map rows", () => {
  const rows = [
    { client_id: "tenant-a", project_id: "p1", project_name: "Project One", installer_name: "Alice", selected_outlet_name: "Outlet One", status: "Approved", gps_latitude: 2, gps_longitude: 3, gps_status: "Verified" },
    { client_id: "tenant-a", project_id: "p2", project_name: "Project Two", installer_name: "Bob", selected_outlet_name: "Outlet Two", status: "Pending", gps_latitude: 4, gps_longitude: 5, gps_status: "Verified" },
  ];

  const byStatus = filterWorkspaceMapRows(rows, { status: "Pending" });
  const byProject = filterWorkspaceMapRows(rows, { projectId: "p2" });

  assert.equal(byStatus.length, 1);
  assert.equal(byProject[0].projectId, "p2");
  assert.equal(byProject[0].installer, "Bob");
});

test("query failure differs from empty state and GPS exception KPI follows canonical logic", () => {
  const failed = mapQueryStatus({ rows: [{ client_id: "tenant-a", gps_latitude: 1, gps_longitude: 2 }], error: new Error("boom"), clientId: "tenant-a" });
  const empty = mapQueryStatus({ rows: [], clientId: "tenant-a" });

  assert.equal(failed.queryStatus, "error");
  assert.equal(empty.queryStatus, "success");
  assert.equal(empty.total, 0);

  const metrics = buildWorkspaceMapMetrics([
    { id: "1", clientId: "tenant-a", projectId: "p1", project: "Project One", brand: null, installer: "Installer A", outlet: "Outlet A", state: "Lagos", latitude: 1, longitude: 2, status: "Approved", gpsStatus: "Verified", submittedAt: "2024-01-01T00:00:00Z", imageUrl: null },
    { id: "2", clientId: "tenant-a", projectId: "p2", project: "Project Two", brand: null, installer: "Installer B", outlet: "Outlet B", state: "Ogun", latitude: 3, longitude: 4, status: "Pending", gpsStatus: "Approximate", submittedAt: "2024-01-02T00:00:00Z", imageUrl: null },
    { id: "3", clientId: "tenant-a", projectId: "p3", project: "Project Three", brand: null, installer: "Installer C", outlet: "Outlet C", state: "Kano", latitude: 5, longitude: 6, status: "Rejected", gpsStatus: "Unavailable", submittedAt: "2024-01-03T00:00:00Z", imageUrl: null },
    { id: "4", clientId: "tenant-a", projectId: "p4", project: "Project Four", brand: null, installer: "Installer D", outlet: "Outlet D", state: "Abuja", latitude: 7, longitude: 8, status: "Flagged", gpsStatus: "Verified", submittedAt: "2024-01-04T00:00:00Z", imageUrl: null },
  ] satisfies WorkspaceMapPoint[]);

  assert.equal(metrics.completed, 1);
  assert.equal(metrics.pending, 2);
  assert.equal(metrics.rejected, 1);
  assert.equal(metrics.gpsExceptions, 2);
});

test("deriveMapGpsStatus follows canonical GPS state rules", () => {
  assert.equal(deriveMapGpsStatus({ gps_distance_meters: 100 }), "Verified");
  assert.equal(deriveMapGpsStatus({ gps_distance_meters: 250 }), "Approximate");
  assert.equal(deriveMapGpsStatus({ gps_status: "Unavailable" }), "Unavailable");
  assert.equal(deriveMapGpsStatus({ gps_latitude: 12.5, gps_longitude: 13.5 }), "Verified");
});
