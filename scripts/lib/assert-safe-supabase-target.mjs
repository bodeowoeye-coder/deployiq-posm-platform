const PRODUCTION_PROJECT_REF = "vmurvcpmqwnxgruhqevf";
const STAGING_PROJECT_REF = "pmdgpgfbtolrgmuusszy";

export function parseSupabaseProjectRef(rawUrl) {
  if (!rawUrl) throw new Error("supabase_url_missing");
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error("supabase_url_malformed"); }
  if (isLoopback(url.hostname)) return "local";
  const match = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (!match || !match[1]) throw new Error("supabase_project_ref_ambiguous");
  return match[1].toLowerCase();
}

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function declaredProjectRef(env, key, missingCode) {
  const value = env[key]?.trim().toLowerCase();
  if (!value) throw new Error(missingCode);
  if (!/^[a-z0-9]{20}$/.test(value)) throw new Error(`${key.toLowerCase()}_invalid`);
  return value;
}

export function assertE1DUatApplicationEnvironment(env = process.env) {
  if (env.DEPLOYIQ_ENVIRONMENT?.trim().toLowerCase() !== "uat") throw new Error("e1d_uat_environment_required");
  let appUrl;
  try { appUrl = new URL(env.NEXT_PUBLIC_APP_URL ?? ""); } catch { throw new Error("e1d_uat_app_url_invalid"); }
  if (appUrl.protocol !== "https:" || appUrl.origin !== appUrl.href.replace(/\/$/, "")) throw new Error("e1d_uat_https_origin_required");
  if (!appUrl.hostname.endsWith(".vercel.app")) throw new Error("e1d_uat_generated_vercel_hostname_required");
  if (appUrl.hostname === "app.deployiq.ng" || appUrl.hostname.endsWith(".deployiq.ng")) throw new Error("e1d_uat_production_domain_rejected");
  const serverUrl = env.DEPLOYIQ_APP_URL?.trim();
  if (!serverUrl || serverUrl.replace(/\/$/, "") !== appUrl.origin) throw new Error("e1d_uat_app_url_mismatch");
  return { appUrl: appUrl.origin };
}

export function parseSupabaseDatabaseTarget(rawUrl) {
  if (!rawUrl) throw new Error("supabase_db_url_missing");
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error("supabase_db_url_malformed"); }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("supabase_db_url_protocol_invalid");
  }
  if (isLoopback(url.hostname)) return { kind: "local", projectRef: null };

  const direct = url.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i)?.[1];
  const pooled = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9-]+)$/i)?.[1];
  const projectRef = (direct ?? pooled)?.toLowerCase();
  if (!projectRef) throw new Error("supabase_db_project_ref_ambiguous");
  return { kind: "remote", projectRef };
}

export function assertSafeSupabaseTarget({
  operationClass,
  destructive = false,
  databaseUrl,
  env = process.env,
  log = console.log,
} = {}) {
  const environment = env.DEPLOYIQ_ENVIRONMENT?.trim().toLowerCase();
  if (!environment) throw new Error("deployiq_environment_missing");
  if (!new Set(["local", "development", "staging", "test", "uat"]).has(environment)) {
    throw new Error("deployiq_environment_not_mutable");
  }

  const projectRef = parseSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error("production_project_rejected");
  if (environment === "staging") {
    if (projectRef !== STAGING_PROJECT_REF) throw new Error("canonical_staging_project_required");
    const declaredProjectRef = env.SUPABASE_PROJECT_REF?.trim().toLowerCase();
    if (!declaredProjectRef) throw new Error("supabase_project_ref_missing");
    if (declaredProjectRef !== STAGING_PROJECT_REF || declaredProjectRef !== projectRef) {
      throw new Error("supabase_project_ref_mismatch");
    }
  } else if (environment === "uat") {
    if (projectRef === STAGING_PROJECT_REF) throw new Error("canonical_staging_project_rejected_for_uat");
    const declared = declaredProjectRef(env, "SUPABASE_PROJECT_REF", "supabase_project_ref_missing");
    const uatProjectRef = declaredProjectRef(env, "DEPLOYIQ_UAT_PROJECT_REF", "e1d_uat_project_ref_missing");
    if (declared !== projectRef || uatProjectRef !== projectRef) throw new Error("e1d_uat_project_ref_mismatch");
  } else if (projectRef === STAGING_PROJECT_REF) {
    throw new Error("staging_environment_required");
  }

  const allowed = new Set((env.DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (allowed.size === 0) throw new Error("mutation_project_allowlist_missing");
  if (!allowed.has(projectRef)) throw new Error("mutation_project_not_allowlisted");
  if (environment === "uat" && (allowed.size !== 1 || !allowed.has(projectRef))) throw new Error("e1d_uat_allowlist_must_be_exact");

  if (databaseUrl) {
    const databaseTarget = parseSupabaseDatabaseTarget(databaseUrl);
    if (databaseTarget.projectRef === PRODUCTION_PROJECT_REF) {
      throw new Error("production_database_project_rejected");
    }
    if (databaseTarget.kind === "local") {
      if (!new Set(["local", "test"]).has(environment)) {
        throw new Error("local_database_environment_mismatch");
      }
    } else if (databaseTarget.projectRef !== projectRef) {
      throw new Error("supabase_target_mismatch");
    }
  }
  if (!operationClass?.trim()) throw new Error("operation_class_missing");
  if (destructive && env.DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION !== "YES") {
    throw new Error("destructive_confirmation_missing");
  }

  log(`Environment: ${environment}`);
  log(`Supabase project reference: ${projectRef}`);
  log(`Operation class: ${operationClass}`);
  return { environment, projectRef };
}

export { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF };
