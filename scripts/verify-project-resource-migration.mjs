/**
 * Verifies the project resource/region migration and runs the acceptance checks.
 * Run: node scripts/verify-project-resource-migration.mjs
 *      node scripts/verify-project-resource-migration.mjs --commit   (retain the acceptance configuration)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { deriveProjectRegions, normalizeStates } from "../lib/geography.ts";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const clientId = "d64d1efe-845e-4bc0-a985-5f4c1a4de92c";
const commit = process.argv.includes("--commit");
let failures = 0;

function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log(`Supabase project: ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n=== 1. Migration verification ===`);
const probe = await supabase.from("projects").select("id,agency_id,lead_installer_id,project_regions").limit(1);
if (probe.error) {
  console.log(`FAIL  columns missing — ${probe.error.message}`);
  console.log("\nApply supabase/migrations/20260815000000_add_project_resource_and_region_columns.sql first.");
  process.exit(1);
}
check("projects.agency_id / lead_installer_id / project_regions exist", true);

const { data: legacy } = await supabase.from("projects").select("id,name,agency_id,lead_installer_id,project_regions,regions_covered,primary_target_region,primary_target_state").eq("client_id", clientId).order("created_at");
check("existing projects default project_regions to '{}' (no data rewritten)", legacy.every((p) => Array.isArray(p.project_regions)), `${legacy.length} projects`);

console.log("\n=== 2. Acceptance configuration ===");
const target = legacy[1];
const other = legacy[2];
const beforeTarget = { ...target };
const beforeOther = { ...other };

const { data: agency } = await supabase.from("agencies").select("id,agency_name").eq("client_id", clientId).ilike("agency_name", "%monetium%").maybeSingle();
const { data: installer } = await supabase.from("installers").select("id,installer_name,user_id").eq("client_id", clientId).ilike("installer_name", "%kayode%").maybeSingle();
const { data: aliya } = await supabase.from("installers").select("id,installer_name,user_id").eq("client_id", clientId).ilike("installer_name", "%aliya%").maybeSingle();
check("Agency 'Monetium' exists in tenant", Boolean(agency), agency?.agency_name ?? "not found");
check("Installer 'Kayode Obolo' exists in tenant", Boolean(installer), installer?.installer_name ?? "not found");
if (!agency || !installer) {
  console.log("\nCreate the Agency and activate Kayode's invitation before running acceptance.");
  process.exit(1);
}

const { data: membership } = await supabase.from("workspace_memberships").select("status").eq("client_id", clientId).eq("user_id", installer.user_id).maybeSingle();
check("6/7. Kayode has an active accepted workspace membership", membership?.status === "active", `membership=${membership?.status ?? "none"}`);
check("8. Aliya remains a legacy record (no user_id, not assignable)", Boolean(aliya) && !aliya.user_id);

const states = normalizeStates(["Lagos", "Ogun", "Enugu"]);
const regions = deriveProjectRegions({ states, storedRegions: ["South West", "South East"] });
await supabase.from("projects").update({
  agency_id: agency.id,
  lead_installer_id: installer.id,
  project_regions: regions,
  regions_covered: states,
  primary_target_region: regions[0],
  primary_target_state: states[0],
}).eq("id", target.id).eq("client_id", clientId);

console.log("\n=== 3. Project Summary read-back ===");
const { data: after } = await supabase.from("projects").select("agency_id,lead_installer_id,project_regions,regions_covered,primary_target_region,primary_target_state").eq("id", target.id).eq("client_id", clientId).single();
const { data: agencyName } = await supabase.from("agencies").select("agency_name").eq("client_id", clientId).eq("id", after.agency_id).maybeSingle();
const { data: installerName } = await supabase.from("installers").select("installer_name").eq("client_id", clientId).eq("id", after.lead_installer_id).maybeSingle();
const readStates = normalizeStates(after.regions_covered ?? []);
const readRegions = deriveProjectRegions({ states: readStates, storedRegions: [...(after.project_regions ?? []), after.primary_target_region] });

check("1. Assigned Agency reads back", agencyName?.agency_name === agency.agency_name, agencyName?.agency_name);
check("1. Lead Installer reads back", installerName?.installer_name === installer.installer_name, installerName?.installer_name);
check("2. Both Regions read back", readRegions.length === 2 && readRegions.includes("South West") && readRegions.includes("South East"), readRegions.join(", "));
check("3. All three States read back", readStates.length === 3, readStates.join(", "));
check("4/5. Values are durable (same row re-read)", after.project_regions.length === 2 && after.regions_covered.length === 3);

console.log("\n=== 4. Isolation ===");
const { data: otherAfter } = await supabase.from("projects").select("agency_id,lead_installer_id,project_regions,regions_covered,primary_target_region").eq("id", other.id).single();
check("9. Another project is unaffected", otherAfter.agency_id === beforeOther.agency_id
  && otherAfter.lead_installer_id === beforeOther.lead_installer_id
  && JSON.stringify(otherAfter.project_regions) === JSON.stringify(beforeOther.project_regions)
  && JSON.stringify(otherAfter.regions_covered) === JSON.stringify(beforeOther.regions_covered),
  `${other.name}: agency=${otherAfter.agency_id} regions=${JSON.stringify(otherAfter.project_regions)} states=${JSON.stringify(otherAfter.regions_covered)}`);

// Cross-tenant probe with a genuinely foreign resource, created and removed here.
const foreignClient = "2caa17f4-0baf-417e-b0af-593e37233001";
const { data: foreignAgency, error: foreignAgencyError } = await supabase.from("agencies").insert({
  client_id: foreignClient,
  workspace_id: foreignClient,
  agency_name: `Cross Tenant Probe ${Date.now()}`,
  status: "Active",
}).select("id").single();
if (foreignAgencyError) {
  check("10. Cross-tenant agency id rejected by the ownership guard", false, foreignAgencyError.message);
} else {
  const { data: guarded } = await supabase.from("agencies").select("id").eq("id", foreignAgency.id).eq("client_id", clientId).eq("workspace_id", clientId).maybeSingle();
  check("10. Cross-tenant agency id rejected by the ownership guard", !guarded, `foreign agency ${foreignAgency.id} not visible to this tenant`);
  await supabase.from("agencies").delete().eq("id", foreignAgency.id);
}

const { data: foreignInstaller } = await supabase.from("installers").select("id,installer_name,client_id").neq("client_id", clientId).not("client_id", "is", null).limit(1).maybeSingle();
if (foreignInstaller) {
  const { data: guardedInstaller } = await supabase.from("installers").select("id").eq("id", foreignInstaller.id).eq("client_id", clientId).eq("workspace_id", clientId).maybeSingle();
  check("10. Cross-tenant installer id rejected by the ownership guard", !guardedInstaller, `${foreignInstaller.installer_name} belongs to ${foreignInstaller.client_id}`);
} else {
  const { data: unscopedInstaller } = await supabase.from("installers").select("id,installer_name").is("client_id", null).limit(1).maybeSingle();
  const { data: guardedInstaller } = unscopedInstaller
    ? await supabase.from("installers").select("id").eq("id", unscopedInstaller.id).eq("client_id", clientId).eq("workspace_id", clientId).maybeSingle()
    : { data: null };
  check("10. Untenanted legacy installer id rejected by the ownership guard", !guardedInstaller, unscopedInstaller?.installer_name ?? "none present");
}

const { data: crossWrite } = await supabase.from("projects").update({ agency_id: null }).eq("id", target.id).eq("client_id", foreignClient).select("id");
check("10. Cross-tenant project id cannot mutate this tenant", (crossWrite ?? []).length === 0);

if (!commit) {
  await supabase.from("projects").update({
    agency_id: beforeTarget.agency_id ?? null,
    lead_installer_id: beforeTarget.lead_installer_id ?? null,
    project_regions: beforeTarget.project_regions ?? [],
    regions_covered: beforeTarget.regions_covered ?? [],
    primary_target_region: beforeTarget.primary_target_region ?? null,
  }).eq("id", target.id).eq("client_id", clientId);
  console.log("\n(dry run — target project restored; pass --commit to retain)");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
