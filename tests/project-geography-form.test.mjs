// Behavioural coverage for the Create / Review-Edit Project geography controls.
// Each test drives the same state machine the form uses, then round-trips through the
// persistence shape (regions_covered = States, project_regions = Regions) and reloads it.
import assert from "node:assert/strict";
import test from "node:test";
import { deriveProjectRegions, normalizeStates } from "../lib/geography.ts";
import {
  addRegionToSelection,
  addStateToSelection,
  removeRegionFromSelection,
  removeStateFromSelection,
  selectionFromProject,
  visibleStatesFor,
} from "../lib/geography.ts";

const EMPTY = { regions: [], states: [] };

// Mirrors updateCustomerProjectDetails: what the form submits becomes the persisted row.
function save(selection) {
  const states = normalizeStates(selection.states);
  const regions = deriveProjectRegions({ states, storedRegions: selection.regions });
  return {
    regions_covered: states,
    project_regions: regions,
    primary_target_state: states[0] ?? null,
    primary_target_region: regions[0] ?? null,
  };
}

function reopen(row) {
  return selectionFromProject(row);
}

test("1. Create Project can select 2 Regions", () => {
  let selection = addRegionToSelection(EMPTY, "South West");
  selection = addRegionToSelection(selection, "South East");
  assert.deepEqual(selection.regions, ["South West", "South East"]);
  assert.equal(selection.regions.length, 2);
});

test("2. Create Project can select 3 States", () => {
  let selection = addRegionToSelection(EMPTY, "South West");
  selection = addRegionToSelection(selection, "South East");
  for (const state of ["Lagos", "Ogun", "Enugu"]) selection = addStateToSelection(selection, state);
  assert.equal(selection.states.length, 3);
  assert.deepEqual(selection.states, ["Enugu", "Lagos", "Ogun"]);
});

test("3. Save persists all selected values", () => {
  let selection = addRegionToSelection(EMPTY, "South West");
  selection = addRegionToSelection(selection, "South East");
  for (const state of ["Lagos", "Ogun", "Enugu"]) selection = addStateToSelection(selection, state);

  const row = save(selection);
  assert.deepEqual(row.regions_covered, ["Enugu", "Lagos", "Ogun"]);
  assert.deepEqual(row.project_regions, ["South West", "South East"]);
  assert.equal(row.primary_target_state, "Enugu");
  assert.equal(row.primary_target_region, "South West");
});

test("4. Review/Edit reloads every saved Region and State as selected", () => {
  let selection = addRegionToSelection(EMPTY, "South West");
  selection = addRegionToSelection(selection, "South East");
  for (const state of ["Lagos", "Ogun", "Enugu"]) selection = addStateToSelection(selection, state);

  const reloaded = reopen(save(selection));
  assert.deepEqual(reloaded.regions, selection.regions);
  assert.deepEqual(reloaded.states, selection.states);
});

test("5. User can remove one State and save", () => {
  let selection = reopen(save({ regions: ["South West", "South East"], states: ["Lagos", "Ogun", "Enugu"] }));
  selection = removeStateFromSelection(selection, "Ogun");

  assert.deepEqual(selection.states, ["Enugu", "Lagos"]);
  const reloaded = reopen(save(selection));
  assert.deepEqual(reloaded.states, ["Enugu", "Lagos"]);
  assert.equal(reloaded.states.includes("Ogun"), false);
  // Removing a State does not drop its Region while another selection still implies it.
  assert.deepEqual(reloaded.regions, ["South West", "South East"]);
});

test("6. User can add another Region and save", () => {
  let selection = reopen(save({ regions: ["South West"], states: ["Lagos", "Ogun"] }));
  selection = addRegionToSelection(selection, "North Central");
  selection = addStateToSelection(selection, "Kwara");

  const reloaded = reopen(save(selection));
  assert.equal(reloaded.regions.length, 2);
  // Canonical NIGERIA_REGIONS order, not alphabetical.
  assert.deepEqual(reloaded.regions, ["South West", "North Central"]);
  assert.deepEqual(reloaded.states, ["Kwara", "Lagos", "Ogun"]);
});

test("7. Project Summary reflects the final values", () => {
  const row = save({ regions: ["South West", "South East"], states: ["Lagos", "Ogun", "Enugu"] });
  // Same derivation the detail read model uses.
  const summaryStates = normalizeStates(row.regions_covered);
  const summaryRegions = deriveProjectRegions({
    states: row.regions_covered,
    storedRegions: [...row.project_regions, row.primary_target_region],
  });
  assert.deepEqual(summaryRegions, ["South West", "South East"]);
  assert.deepEqual(summaryStates, ["Enugu", "Lagos", "Ogun"]);
});

test("removing a Region drops only that Region's States", () => {
  let selection = reopen(save({ regions: ["South West", "South East"], states: ["Lagos", "Ogun", "Enugu", "Anambra"] }));
  selection = removeRegionFromSelection(selection, "South East");

  assert.deepEqual(selection.regions, ["South West"]);
  assert.deepEqual(selection.states, ["Lagos", "Ogun"]);
});

test("Region selection narrows State options without blocking multi-region projects", () => {
  let selection = addRegionToSelection(EMPTY, "South West");
  selection = addRegionToSelection(selection, "South East");
  const options = visibleStatesFor(selection);

  for (const state of ["Lagos", "Ogun", "Oyo", "Enugu", "Anambra"]) {
    assert.equal(options.includes(state), true, `${state} must be selectable`);
  }
  assert.equal(options.includes("Kano"), false, "states outside the selected regions are not offered");

  // With no Region chosen, every State remains available.
  assert.equal(visibleStatesFor(EMPTY).length > options.length, true);
});

test("an already selected State is never silently removed from the options", () => {
  let selection = addStateToSelection(EMPTY, "Lagos");
  selection = addRegionToSelection(selection, "South East");
  assert.equal(visibleStatesFor(selection).includes("Lagos"), true);
  assert.equal(selection.states.includes("Lagos"), true);
});

test("adding a State adds its Region automatically and stays deduplicated", () => {
  let selection = addStateToSelection(EMPTY, "Enugu");
  assert.deepEqual(selection.regions, ["South East"]);
  selection = addStateToSelection(selection, "Enugu");
  selection = addRegionToSelection(selection, "South East");
  assert.deepEqual(selection.states, ["Enugu"]);
  assert.deepEqual(selection.regions, ["South East"]);
});

test("legacy single-value projects reload as editable multi-value selections", () => {
  const legacy = { regions_covered: ["Ekiti"], project_regions: [], primary_target_region: "South West", primary_target_state: "Ekiti" };
  const selection = reopen(legacy);
  assert.deepEqual(selection.states, ["Ekiti"]);
  assert.deepEqual(selection.regions, ["South West"]);

  const upgraded = save(addStateToSelection(selection, "Enugu"));
  assert.deepEqual(upgraded.regions_covered, ["Ekiti", "Enugu"]);
  assert.deepEqual(upgraded.project_regions, ["South West", "South East"]);
});
