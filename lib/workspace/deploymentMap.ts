type MapRow = Record<string, unknown>;

export type WorkspaceMapFilterInput = {
  clientId?: string | null;
  projectId?: string | null;
  status?: string | null;
  installer?: string | null;
  state?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type WorkspaceMapPoint = {
  id: string;
  clientId: string | null;
  projectId: string | null;
  project: string;
  brand: string | null;
  installer: string;
  outlet: string;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  gpsStatus: "Verified" | "Approximate" | "Unavailable";
  submittedAt: string | null;
  imageUrl: string | null;
};

export function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidGpsCoordinate(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function resolveLocationState(row: MapRow) {
  return text(row.resolved_state) || text(row.installer_state) || text(row.state_region) || null;
}

export function deriveMapGpsStatus(row: MapRow): WorkspaceMapPoint["gpsStatus"] {
  const raw = text(row.gps_status);
  if (raw === "Verified" || raw === "Approximate" || raw === "Unavailable") return raw;
  const distanceMeters = numberOrNull(row.gps_distance_meters);
  if (distanceMeters !== null) return distanceMeters <= 150 ? "Verified" : "Approximate";
  const latitude = numberOrNull(row.gps_latitude);
  const longitude = numberOrNull(row.gps_longitude);
  return isValidGpsCoordinate(latitude, longitude) ? "Verified" : "Unavailable";
}

export function normalizeWorkspaceMapPoint(row: MapRow): WorkspaceMapPoint {
  const latitude = numberOrNull(row.gps_latitude);
  const longitude = numberOrNull(row.gps_longitude);
  const gpsStatus = deriveMapGpsStatus(row);
  return {
    id: text(row.id),
    clientId: text(row.client_id) || null,
    projectId: text(row.project_id) || null,
    project: text(row.project_name) || "Project",
    brand: text(row.brand_name) || null,
    installer: text(row.installer_name) || "Installer",
    outlet: text(row.selected_outlet_name) || "Deployment location",
    state: resolveLocationState(row),
    latitude: isValidGpsCoordinate(latitude, longitude) ? latitude : null,
    longitude: isValidGpsCoordinate(latitude, longitude) ? longitude : null,
    status: text(row.status) || "Pending",
    gpsStatus,
    submittedAt: text(row.submitted_at) || null,
    imageUrl: text(row.image_url) || null,
  };
}

export function filterWorkspaceMapRows(rows: MapRow[], filters: WorkspaceMapFilterInput = {}) {
  const projectId = text(filters.projectId).trim();
  const status = text(filters.status).trim();
  const installer = text(filters.installer).trim().toLowerCase();
  const state = text(filters.state).trim();
  const dateFrom = text(filters.dateFrom).trim();
  const dateTo = text(filters.dateTo).trim();
  const clientId = text(filters.clientId).trim();

  return rows.map(normalizeWorkspaceMapPoint).filter((point) => {
    if (clientId && point.clientId && point.clientId !== clientId) return false;
    if (projectId && point.projectId && point.projectId !== projectId) return false;
    if (projectId && !point.projectId && point.project.toLowerCase() !== projectId.toLowerCase()) return false;
    if (status && point.status !== status) return false;
    if (installer && !point.installer.toLowerCase().includes(installer)) return false;
    if (state && point.state !== state) return false;
    if (dateFrom && point.submittedAt && point.submittedAt < dateFrom) return false;
    if (dateTo && point.submittedAt && point.submittedAt > dateTo) return false;
    return point.latitude !== null && point.longitude !== null;
  });
}

export function buildWorkspaceMapMetrics(points: WorkspaceMapPoint[]) {
  return {
    completed: points.filter((point) => point.status === "Approved").length,
    pending: points.filter((point) => ["Pending", "Flagged"].includes(point.status)).length,
    rejected: points.filter((point) => ["Rejected", "Correction Requested"].includes(point.status)).length,
    gpsExceptions: points.filter((point) => point.gpsStatus !== "Verified").length,
  };
}

export function buildWorkspaceMapFilters(rows: MapRow[]) {
  const points = rows.map(normalizeWorkspaceMapPoint).filter((point) => point.latitude !== null && point.longitude !== null);
  return {
    projects: Array.from(new Set(points.map((point) => point.projectId).filter(Boolean))).sort(),
    installers: Array.from(new Set(points.map((point) => point.installer).filter(Boolean))).sort(),
    states: Array.from(new Set(points.map((point) => point.state).filter((value): value is string => Boolean(value)))).sort(),
  };
}

export function mapQueryStatus(summary: { rows: MapRow[]; error?: unknown; clientId?: string | null; }) {
  if (summary.error) return { queryStatus: "error" as const, loadError: "Map data could not be loaded. Please try again." };
  const validRows = summary.rows.filter((row) => {
    if (summary.clientId && text((row as MapRow).client_id) && text((row as MapRow).client_id) !== summary.clientId) return false;
    const latitude = numberOrNull((row as MapRow).gps_latitude);
    const longitude = numberOrNull((row as MapRow).gps_longitude);
    return isValidGpsCoordinate(latitude, longitude);
  });
  return { queryStatus: "success" as const, points: validRows.map(normalizeWorkspaceMapPoint), total: validRows.length };
}
