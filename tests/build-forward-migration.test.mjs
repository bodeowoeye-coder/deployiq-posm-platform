import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260828010000_harmonize_build_foundation.sql",
  import.meta.url
);
const sql = readFileSync(migrationUrl, "utf8");
const privilegeMigrationUrl = new URL(
  "../supabase/migrations/20260828020000_normalize_build_function_privileges.sql",
  import.meta.url
);
const privilegeSql = readFileSync(privilegeMigrationUrl, "utf8");
const privilegeStatements = privilegeSql.replace(/^\s*--.*$/gm, "");

const buildTriggerFunctions = [
  "prevent_build_category_template_change",
  "prevent_build_resource_scope_change",
  "prevent_build_template_scope_change",
  "touch_build_updated_at",
  "validate_build_activity_template_category",
  "validate_build_activity_template_dependency",
  "validate_build_site_authority",
  "validate_build_template_resource_requirement",
  "validate_build_work_package_template_assignment"
];

function functionDefinition(name) {
  const match = sql.match(new RegExp(
    `create or replace function public\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`,
    "i"
  ));
  assert.ok(match, `missing function ${name}`);
  return match[0];
}

const buildTables = [
  "build_sites",
  "build_work_packages",
  "build_work_package_templates",
  "build_activity_categories",
  "build_activity_templates",
  "build_checklist_templates",
  "build_inspection_templates",
  "build_safety_templates",
  "build_supply_templates",
  "build_equipment_templates",
  "build_resources",
  "build_template_resource_requirements",
  "build_activity_template_dependencies"
];

test("BH-1B represents every accumulated Build table", () => {
  for (const table of buildTables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, "i"), table);
  }
});

test("BH-1B represents every accumulated Build enum", () => {
  for (const type of [
    "build_activity_category_type",
    "build_resource_type",
    "build_resource_requirement_type",
    "build_activity_dependency_type",
    "build_activity_dependency_lag_unit"
  ]) {
    assert.match(sql, new RegExp(`create type public\\.${type} as enum`, "i"), type);
  }
  for (const value of ["'FS'", "'SS'", "'FF'", "'SF'", "'hours'", "'days'", "'weeks'"]) {
    assert.match(sql, new RegExp(value, "i"));
  }
});

test("BH-1B enables RLS on every Build table and default-denies browser roles", () => {
  assert.match(sql, /foreach table_name in array array\[[\s\S]*alter table public\.%I enable row level security/i);
  for (const table of buildTables) assert.match(sql, new RegExp(`'${table}'`));
  assert.match(sql, /revoke all privileges on table public\.%I from anon, authenticated/i);
  assert.doesNotMatch(sql, /create\s+policy[\s\S]*\bto\s+(anon|authenticated)\b/i);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[\s\S]*\bto\s+(anon|authenticated)\b/i);
});

test("BH-1B constrains sites to canonical project and client authority", () => {
  assert.match(sql, /foreign key \(project_id, client_id\) references public\.projects\(id, client_id\)/i);
  assert.match(sql, /validate_build_site_authority/);
  assert.match(sql, /authoritative_project_type not in \('Construction', 'Real Estate', 'Facility Management'\)/);
  assert.doesNotMatch(sql, /projects\.(name|campaign|brand)\b|project_name\s*:\s*name/i);
});

test("BH-1B constrains work packages through site project and client hierarchy", () => {
  assert.match(sql, /foreign key \(site_id, project_id, client_id\)[\s\S]*references public\.build_sites\(id, project_id, client_id\)/i);
  assert.match(sql, /build_work_packages_project_client_fkey/);
});

test("BH-1B defines explicit tenant and global template semantics", () => {
  assert.match(sql, /is_global = true and client_id is null/);
  assert.match(sql, /is_global = false and client_id is not null/);
  assert.match(sql, /uq_build_wp_templates_global_code/);
  assert.match(sql, /uq_build_wp_templates_tenant_code[\s\S]*\(client_id, code\)/);
  assert.match(sql, /drop constraint %I[\s\S]*constraint_name/);
});

test("BH-1B rejects cross-tenant template assignment while allowing valid global templates", () => {
  assert.match(sql, /validate_build_work_package_template_assignment/);
  assert.match(sql, /template_is_global = false and template_client_id <> new\.client_id/);
  assert.match(sql, /template_is_global = true and template_client_id is not null/);
  assert.match(sql, /prevent_build_template_scope_change/);
  assert.match(sql, /Build template tenant\/global ownership is immutable/);
});

test("BH-1B preserves category activity and checklist ancestry", () => {
  assert.match(sql, /validate_build_activity_template_category/);
  assert.match(sql, /category_template_id <> new\.template_id/);
  assert.match(sql, /activity_template_id uuid not null references public\.build_activity_templates\(id\)/);
  assert.match(sql, /unique \(activity_template_id, sequence\)/);
  assert.match(sql, /activity category template ownership is immutable/);
  assert.match(sql, /activity template ownership is immutable/);
  assert.match(sql, /activity category change would invalidate resource requirement ancestry/);
});

test("BH-1B enforces resource visibility and same-template ancestry", () => {
  assert.match(sql, /global templates may only reference global resources/);
  assert.match(sql, /resource_id is not visible to template tenant/);
  assert.match(sql, /activity_parent_template_id <> new\.template_id/);
  assert.match(sql, /activity_parent_category_id <> new\.activity_category_id/);
  assert.match(sql, /Build resource tenant\/global ownership is immutable/);
});

test("BH-1B preserves dependency semantics and integrity", () => {
  assert.match(sql, /check \(predecessor_activity_template_id <> successor_activity_template_id\)/);
  assert.match(sql, /uq_build_activity_dependency_pair/);
  assert.match(sql, /dependency activities must belong to the same template/);
  assert.match(sql, /activity template dependency cannot reference itself/);
});

test("BH-1B preserves Sprint 2F activity and checklist authoring fields", () => {
  for (const field of ["duration_unit", "status", "notes", "archived_at"]) {
    assert.match(sql, new RegExp(`add column if not exists ${field}\\b`), `activity ${field}`);
  }
  for (const field of ["description", "requires_photo", "requires_comment", "acceptance_type", "archived_at"]) {
    assert.match(sql, new RegExp(`add column if not exists ${field}\\b`), `checklist ${field}`);
  }
});

test("BH-1B contains no destructive Build table or data operation", () => {
  assert.doesNotMatch(sql, /drop\s+table/i);
  assert.doesNotMatch(sql, /truncate\b/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.build_/i);
  assert.doesNotMatch(sql, /alter\s+table\s+public\.build_\w+\s+drop\s+column/i);
});

test("BH-1B uses controlled definer authority only for canonical project validation", () => {
  const siteAuthority = functionDefinition("validate_build_site_authority");
  assert.match(siteAuthority, /security\s+definer/i);
  assert.match(siteAuthority, /set search_path = pg_catalog\b/i);
  assert.match(siteAuthority, /from public\.projects p/i);
  assert.doesNotMatch(siteAuthority, /\bexecute\b|format\s*\(/i);

  const definerFunctions = sql.match(/security\s+definer/gi) ?? [];
  assert.equal(definerFunctions.length, 1);
  for (const name of [
    "touch_build_updated_at",
    "validate_build_work_package_template_assignment",
    "prevent_build_template_scope_change",
    "prevent_build_resource_scope_change",
    "validate_build_activity_template_category",
    "prevent_build_category_template_change",
    "validate_build_template_resource_requirement",
    "validate_build_activity_template_dependency"
  ]) {
    assert.doesNotMatch(functionDefinition(name), /security\s+definer/i, name);
  }
});

test("BH-1B protects trigger-only definer execution without broad canonical grants", () => {
  const triggerInstall = sql.indexOf("create trigger trg_bh1b_validate_site_authority");
  const executionRevoke = sql.indexOf(
    "revoke all on function public.validate_build_site_authority() from public, anon, authenticated"
  );
  assert.ok(triggerInstall >= 0 && executionRevoke > triggerInstall);
  assert.match(sql, /revoke all on function public\.validate_build_site_authority\(\) from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function\s+public\.validate_build_site_authority/i);
  assert.doesNotMatch(sql, /grant\s+(select|all)[\s\S]*on\s+(table\s+)?public\.projects[\s\S]*to\s+service_role/i);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[\s\S]*on\s+(table\s+)?public\.projects[\s\S]*to\s+(anon|authenticated)/i);
  assert.match(sql, /revoke all privileges on table public\.%I from anon, authenticated/i);
});

test("BH-3A removes environment-default direct service-role execution from every Build trigger function", () => {
  for (const name of buildTriggerFunctions) {
    assert.match(
      privilegeSql,
      new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${name}\\(\\)\\s+from\\s+service_role`, "i"),
      name
    );
  }
  assert.equal(
    privilegeSql.match(/revoke\s+execute\s+on\s+function/gi)?.length,
    buildTriggerFunctions.length
  );
});

test("BH-3A is a privilege-only, narrowly scoped correction", () => {
  assert.doesNotMatch(privilegeStatements, /\b(create|alter|drop|truncate|insert|update|delete|grant)\b/i);
  assert.doesNotMatch(privilegeStatements, /public\.projects|\bon\s+table\b|\bpolicy\b|\brow\s+level\s+security\b/i);
  assert.doesNotMatch(privilegeStatements, /\b(public|anon|authenticated)\b\s*;/i);
});
