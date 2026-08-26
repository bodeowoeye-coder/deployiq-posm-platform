const PRODUCTION_PROJECT_REF = "vmurvcpmqwnxgruhqevf";

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
  if (!new Set(["local", "development", "staging", "test"]).has(environment)) {
    throw new Error("deployiq_environment_not_mutable");
  }

  const projectRef = parseSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error("production_project_rejected");

  const allowed = new Set((env.DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (allowed.size === 0) throw new Error("mutation_project_allowlist_missing");
  if (!allowed.has(projectRef)) throw new Error("mutation_project_not_allowlisted");

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

export { PRODUCTION_PROJECT_REF };
