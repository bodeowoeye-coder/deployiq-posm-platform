const ROOT_KEYS = ["task", "question", "context", "policy", "outputContract"];
const CONTEXT_KEYS = ["tool", "scope", "facts", "coverage", "constraints", "selection"];
const FACT_KEYS = ["factRefId", "label", "value", "coverageRefIds"];
const COVERAGE_KEYS = ["coverageRefId", "label", "value"];
const POLICY_KEYS = ["governanceVersion", "visibility", "allowedTask", "allowedStatementTypes", "requireFactReferences", "requireCoverageQualification", "unsupportedConclusions", "allowAutonomousActions", "allowModelAuthoredFacts", "decisionOptionsOnly"];
const SELECTION_KEYS = ["contract", "sourceCoverage", "detail"];
const COVERAGE_VALUE_KEYS = new Set(["numerator", "denominator", "ratio", "state", "reason", "available", "measured", "total", "dataQuality"]);
const SENSITIVE_KEYS = new Set([
  "password", "access_token", "refresh_token", "authorization", "authorization_header", "bearer_token",
  "cookie", "session", "session_id", "credential", "credentials", "secret", "api_key",
  "email", "contact", "contact_information", "phone", "full_name", "display_name", "human_identity",
  "customer", "customer_name", "company", "company_name", "address", "location", "latitude", "longitude", "coordinates",
  "tenant_id", "client_id", "workspace_id", "user_id", "owner_user_id", "project_id", "work_package_id", "activity_id",
  "binary", "file_bytes", "storage_url", "storage_path", "evidence_url", "photo_url", "video_url",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT = /^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{7,20}$/;
const SECRET_VALUE = /^(?:bearer\s+\S+|sk-[A-Za-z0-9_-]{12,}|(?:password|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+)/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;

const plain = (value) => typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const scalar = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);

export function normalizeAcceptancePrivacyKey(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[-\s]+/g, "_").toLowerCase();
}

export function classifyAcceptancePrivacyKey(key) {
  const normalized = normalizeAcceptancePrivacyKey(key);
  return { normalized, sensitive: SENSITIVE_KEYS.has(normalized) };
}

function sensitiveValue(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (ISO_DATE.test(trimmed)) return false;
  return JWT.test(trimmed) || EMAIL.test(trimmed) || PHONE.test(trimmed) || UUID.test(trimmed)
    || SECRET_VALUE.test(trimmed) || /^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed);
}

function allowedKeys(value, keys, path, violations) {
  if (!plain(value)) { violations.push(`${path}:invalid_object`); return false; }
  for (const key of Object.keys(value)) {
    if (classifyAcceptancePrivacyKey(key).sensitive) violations.push(`${path}/${key}:sensitive_key`);
    else if (!keys.includes(key)) violations.push(`${path}/${key}:unknown_field`);
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) violations.push(`${path}/${key}:missing_field`);
  return violations.length === 0;
}

function inspectScalar(value, path, violations) {
  if (!scalar(value)) violations.push(`${path}:invalid_scalar`);
  else if (sensitiveValue(value)) violations.push(`${path}:sensitive_value`);
}

function inspectCoverageValue(value, path, violations) {
  if (scalar(value)) return inspectScalar(value, path, violations);
  if (!plain(value)) { violations.push(`${path}:invalid_coverage_value`); return; }
  for (const [key, child] of Object.entries(value)) {
    if (classifyAcceptancePrivacyKey(key).sensitive) violations.push(`${path}/${key}:sensitive_key`);
    else if (!COVERAGE_VALUE_KEYS.has(key)) violations.push(`${path}/${key}:unknown_field`);
    else inspectScalar(child, `${path}/${key}`, violations);
  }
}

export function inspectBuildAIAcceptanceProjection(value) {
  const violations = [];
  if (!allowedKeys(value, ROOT_KEYS, "$", violations)) return { ok: false, violations };
  if (!["executive_summary", "management_attention", "change_interpretation"].includes(value.task)) violations.push("$/task:invalid_value");
  if (value.question !== null) inspectScalar(value.question, "$/question", violations);
  if (!Array.isArray(value.context) || value.context.length !== 1) violations.push("$/context:invalid_cardinality");
  else value.context.forEach((context, index) => {
    const path = `$/context/${index}`;
    if (!allowedKeys(context, CONTEXT_KEYS, path, violations)) return;
    if (!["get_build_project_intelligence", "get_build_execution_history"].includes(context.tool)) violations.push(`${path}/tool:invalid_value`);
    if (!exact(context.scope, ["kind"]) || context.scope.kind !== "project") violations.push(`${path}/scope:invalid_value`);
    if (!Array.isArray(context.facts) || context.facts.length > 180) violations.push(`${path}/facts:invalid_bound`);
    else context.facts.forEach((fact, factIndex) => {
      const factPath = `${path}/facts/${factIndex}`;
      if (!allowedKeys(fact, FACT_KEYS, factPath, violations)) return;
      inspectScalar(fact.factRefId, `${factPath}/factRefId`, violations);
      inspectScalar(fact.label, `${factPath}/label`, violations);
      inspectScalar(fact.value, `${factPath}/value`, violations);
      if (!Array.isArray(fact.coverageRefIds) || fact.coverageRefIds.some((item) => typeof item !== "string" || sensitiveValue(item))) violations.push(`${factPath}/coverageRefIds:invalid_value`);
    });
    if (!Array.isArray(context.coverage)) violations.push(`${path}/coverage:invalid_value`);
    else context.coverage.forEach((coverage, coverageIndex) => {
      const coveragePath = `${path}/coverage/${coverageIndex}`;
      if (!allowedKeys(coverage, COVERAGE_KEYS, coveragePath, violations)) return;
      inspectScalar(coverage.coverageRefId, `${coveragePath}/coverageRefId`, violations);
      inspectScalar(coverage.label, `${coveragePath}/label`, violations);
      inspectCoverageValue(coverage.value, `${coveragePath}/value`, violations);
    });
    if (!exact(context.constraints, ["unsupportedConclusions"]) || !Array.isArray(context.constraints.unsupportedConclusions) || context.constraints.unsupportedConclusions.some((item) => typeof item !== "string" || sensitiveValue(item))) violations.push(`${path}/constraints:invalid_value`);
    if (!allowedKeys(context.selection, SELECTION_KEYS, `${path}/selection`, violations)) return;
    for (const key of SELECTION_KEYS) inspectScalar(context.selection[key], `${path}/selection/${key}`, violations);
  });
  if (allowedKeys(value.policy, POLICY_KEYS, "$/policy", violations)) {
    for (const key of ["governanceVersion", "visibility", "allowedTask"]) inspectScalar(value.policy[key], `$/policy/${key}`, violations);
    for (const key of ["allowedStatementTypes", "unsupportedConclusions"]) if (!Array.isArray(value.policy[key]) || value.policy[key].some((item) => typeof item !== "string" || sensitiveValue(item))) violations.push(`$/policy/${key}:invalid_value`);
    for (const key of ["requireFactReferences", "requireCoverageQualification", "allowAutonomousActions", "allowModelAuthoredFacts", "decisionOptionsOnly"]) if (typeof value.policy[key] !== "boolean") violations.push(`$/policy/${key}:invalid_value`);
  }
  if (!exact(value.outputContract, ["schemaVersion"]) || value.outputContract.schemaVersion !== "2.0") violations.push("$/outputContract:invalid_value");
  return { ok: violations.length === 0, violations };
}
