import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync(new URL("../supabase/migrations/20260901020000_add_build_runtime_activity_schedule_baseline.sql",import.meta.url),"utf8");
const workPlanMigration=readFileSync(new URL("../supabase/migrations/20260830010000_add_build_runtime_work_plan_foundation.sql",import.meta.url),"utf8");
const runtimeTypes=readFileSync(new URL("../lib/build/runtime/types.ts",import.meta.url),"utf8");
const runtimeService=readFileSync(new URL("../lib/build/runtime/service.ts",import.meta.url),"utf8");
const management=readFileSync(new URL("../lib/build/management/service.ts",import.meta.url),"utf8");

test("S3A-10A adds exactly the durable Runtime Activity schedule fields",()=>{assert.match(migration,/alter table public\.build_runtime_activities[\s\S]*add column planned_start_at timestamptz,[\s\S]*add column planned_finish_at timestamptz/);});
test("S3A-10A adds nullable Work Plan baseline metadata",()=>{assert.match(migration,/alter table public\.build_work_plans[\s\S]*add column schedule_baselined_at timestamptz/);assert.doesNotMatch(migration,/not null|default/i);});
test("schedule fields remain nullable and existing rows need no backfill",()=>{assert.doesNotMatch(migration,/\bupdate\b|backfill|coalesce\s*\(/i);});
test("schedule ordering accepts null and equal timestamps but rejects finish before start",()=>{assert.match(migration,/planned_finish_at is null[\s\S]*planned_start_at is null[\s\S]*planned_finish_at >= planned_start_at/);});
test("existing atomic Work Plan creation is unchanged",()=>{assert.match(workPlanMigration,/create or replace function public\.create_build_work_plan/);assert.doesNotMatch(migration,/create or replace function|create function|drop function/i);});
test("no parent date or duration is used to fabricate a baseline",()=>{assert.doesNotMatch(migration,/projects|build_sites|build_work_packages|planned_duration|created_at|started_at|completed_at/i);});
test("canonical runtime types preserve null schedule semantics",()=>{for(const field of ["planned_start_at: string | null","planned_finish_at: string | null","schedule_baselined_at: string | null"])assert.match(runtimeTypes,new RegExp(field.replace(/[|]/g,"\\|")));});
test("runtime service remains read-compatible through canonical wildcard hydration",()=>{assert.match(runtimeService,/from\("build_runtime_activities"\)\.select\("\*"\)/);assert.match(runtimeService,/row as Omit<BuildWorkPlan/);});
test("existing RLS and direct browser denial are not broadened",()=>{assert.doesNotMatch(migration,/disable row level security|grant\s+(insert|update|delete|all).*authenticated|grant\s+(insert|update|delete|all).*anon/i);assert.doesNotMatch(migration,/grant\s+/i);});
test("S3A-9C deterministic management remains unchanged",()=>{assert.match(management,/resolveCanonicalBuildProject/);assert.doesNotMatch(migration,/build_runtime_exceptions|build_runtime_inspections|build_runtime_evidence/);});
test("Retail and legacy client routing are untouched",()=>{assert.doesNotMatch(migration+runtimeTypes,/Retail Deployment|installation-images|["'`]\/client(?:\/|["'`])/);});
test("foundation introduces no critical path scoring calendars or second dependency model",()=>{assert.doesNotMatch(migration,/critical.path|float|slack|health.score|calendar|dependency.*table/i);});
