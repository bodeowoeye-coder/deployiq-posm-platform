import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { assertSafeSupabaseTarget, STAGING_PROJECT_REF } from "./lib/assert-safe-supabase-target.mjs";

export const STAGING_ENV_FILE = ".env.staging.local";
export const STAGING_APP_URL = "http://localhost:3000";
export const STAGING_DEV_PORT = "3000";
export const REQUIRED_STAGING_VARIABLES = [
  "DEPLOYIQ_ENVIRONMENT",
  "SUPABASE_PROJECT_REF",
  "DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
];
export const SHADOW_STAGING_VARIABLES = [
  "OPENAI_API_KEY",
  "DEPLOYIQ_PROVISIONING_AGENT_MODE",
  "DEPLOYIQ_PROVISIONING_AGENT_PRODUCTS",
  "DEPLOYIQ_PROVISIONING_AGENT_PROVIDER",
  "DEPLOYIQ_PROVISIONING_AGENT_MODEL",
  "DEPLOYIQ_PROVISIONING_AGENT_EXECUTION_ENABLED",
];

const SAFE_HOST_VARIABLES = new Set([
  "HOME", "LANG", "LOGNAME", "PATH", "SHELL", "TERM", "TMPDIR", "USER",
  "COLORTERM", "FORCE_COLOR", "NO_COLOR",
]);

function unresolved(value) {
  return !value?.trim() || /^<[^>]+>$/.test(value.trim());
}

export function loadAndValidateStagingEnvironment({ projectRoot = process.cwd() } = {}) {
  const filePath = path.join(projectRoot, STAGING_ENV_FILE);
  let parsed;
  try {
    parsed = dotenv.parse(readFileSync(filePath));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error("staging_environment_file_missing");
    }
    throw new Error("staging_environment_file_unreadable");
  }

  for (const variable of REQUIRED_STAGING_VARIABLES) {
    if (unresolved(parsed[variable])) throw new Error(`staging_environment_variable_missing:${variable}`);
  }
  if (parsed.DEPLOYIQ_ENVIRONMENT.trim().toLowerCase() !== "staging") {
    throw new Error("canonical_staging_environment_required");
  }
  if (parsed.SUPABASE_PROJECT_REF.trim().toLowerCase() !== STAGING_PROJECT_REF) {
    throw new Error("canonical_staging_project_required");
  }
  const allowed = parsed.DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (allowed.length !== 1 || allowed[0] !== STAGING_PROJECT_REF) {
    throw new Error("canonical_staging_allowlist_required");
  }
  if (parsed.NEXT_PUBLIC_APP_URL && parsed.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "") !== STAGING_APP_URL) {
    throw new Error("canonical_staging_app_url_required");
  }

  const shadowEnabled = parsed.DEPLOYIQ_PROVISIONING_AGENT_ENABLED?.trim() === "1";
  if (shadowEnabled) {
    for (const variable of SHADOW_STAGING_VARIABLES) {
      if (unresolved(parsed[variable])) throw new Error(`staging_shadow_variable_missing:${variable}`);
    }
    if (parsed.DEPLOYIQ_PROVISIONING_AGENT_MODE.trim().toLowerCase() !== "shadow") {
      throw new Error("staging_shadow_mode_required");
    }
    const products = parsed.DEPLOYIQ_PROVISIONING_AGENT_PRODUCTS
      .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!products.includes("retail")) throw new Error("staging_shadow_retail_required");
    if (parsed.DEPLOYIQ_PROVISIONING_AGENT_PROVIDER.trim().toLowerCase() !== "openai") {
      throw new Error("staging_shadow_openai_provider_required");
    }
  }
  if (parsed.DEPLOYIQ_PROVISIONING_AGENT_EXECUTION_ENABLED
    && parsed.DEPLOYIQ_PROVISIONING_AGENT_EXECUTION_ENABLED.trim() !== "0") {
    throw new Error("staging_ai_execution_forbidden");
  }

  assertSafeSupabaseTarget({
    env: parsed,
    databaseUrl: parsed.SUPABASE_DB_URL,
    operationClass: "isolated staging development launch",
    log() {},
  });
  return parsed;
}

export function buildIsolatedChildEnvironment(stagingEnvironment, hostEnvironment = process.env) {
  const childEnvironment = {};
  for (const [key, value] of Object.entries(hostEnvironment)) {
    if (value !== undefined && (SAFE_HOST_VARIABLES.has(key) || key.startsWith("LC_"))) {
      childEnvironment[key] = value;
    }
  }
  Object.assign(childEnvironment, stagingEnvironment, {
    NODE_ENV: "development",
    NEXT_DIST_DIR: ".next-dev",
    NEXT_PUBLIC_APP_URL: STAGING_APP_URL,
  });
  return childEnvironment;
}

async function linkDirectoryContents(sourceDirectory, targetDirectory) {
  await mkdir(targetDirectory, { recursive: true });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(sourceDirectory, entry.name);
    const target = path.join(targetDirectory, entry.name);
    if (entry.isDirectory()) {
      await linkDirectoryContents(source, target);
    } else {
      await symlink(source, target, "file");
    }
  }
}

export async function createIsolatedProjectView(projectRoot, temporaryRoot = tmpdir()) {
  const isolatedRoot = await mkdtemp(path.join(temporaryRoot, "deployiq-staging-dev-"));
  const entries = await readdir(projectRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name.startsWith(".env") || entry.name.startsWith(".next")) continue;
    const source = path.join(projectRoot, entry.name);
    const target = path.join(isolatedRoot, entry.name);
    if (entry.name === "app" && entry.isDirectory()) {
      await linkDirectoryContents(source, target);
    } else {
      await symlink(source, target, entry.isDirectory() ? "junction" : "file");
    }
  }
  return isolatedRoot;
}

async function run() {
  const projectRoot = process.cwd();
  const stagingEnvironment = loadAndValidateStagingEnvironment({ projectRoot });
  const childEnvironment = buildIsolatedChildEnvironment(stagingEnvironment);
  const isolatedRoot = await createIsolatedProjectView(projectRoot);
  const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

  console.log(`Starting isolated staging development server for ${STAGING_PROJECT_REF}.`);
  console.log(`Application URL: ${STAGING_APP_URL}`);
  console.log(`${STAGING_ENV_FILE} loaded; repository .env files excluded.`);

  try {
    // Never let Next.js silently choose 3001 when a stopped or stale process
    // still owns the canonical staging URL on port 3000. Failing with
    // EADDRINUSE makes the operator stop the existing process before testing.
    const child = spawn(process.execPath, [nextCli, "dev", "--port", STAGING_DEV_PORT], {
      cwd: isolatedRoot,
      env: childEnvironment,
      stdio: "inherit",
    });
    const forward = (signal) => child.kill(signal);
    process.once("SIGINT", forward);
    process.once("SIGTERM", forward);

    process.exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(signal ? 1 : code ?? 1));
    });
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  run().catch((error) => {
    console.error(`Staging development launch failed: ${error instanceof Error ? error.message : "unknown_error"}`);
    process.exitCode = 1;
  });
}
