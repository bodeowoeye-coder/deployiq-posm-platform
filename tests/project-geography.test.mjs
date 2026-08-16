import assert from "node:assert/strict";
import test from "node:test";
import {
  NIGERIA_REGIONS,
  NIGERIA_STATES,
  deriveProjectRegions,
  getStatesForRegion,
  normalizeRegions,
  normalizeStates,
} from "../lib/geography.ts";

test("geography: multi-region multi-state selection round-trips", () => {
  const states = normalizeStates(["Lagos", "Ogun", "Enugu"]);
  const regions = deriveProjectRegions({ states, storedRegions: ["South West"] });
  assert.deepEqual(states, ["Enugu", "Lagos", "Ogun"].sort((a, b) => NIGERIA_STATES.indexOf(a) - NIGERIA_STATES.indexOf(b)));
  assert.deepEqual(regions, ["South West", "South East"].sort((a, b) => NIGERIA_REGIONS.indexOf(a) - NIGERIA_REGIONS.indexOf(b)));
  assert.equal(regions.includes("South West"), true);
  assert.equal(regions.includes("South East"), true);
});

test("geography: one region containing several states is preserved", () => {
  const states = normalizeStates(["Lagos", "Ogun", "Oyo"]);
  assert.equal(states.length, 3);
  assert.deepEqual(deriveProjectRegions({ states, storedRegions: [] }), ["South West"]);
});

test("geography: several regions containing several states are preserved", () => {
  const states = normalizeStates(["Lagos", "Ogun", "Oyo", "Enugu", "Anambra"]);
  assert.equal(states.length, 5);
  const regions = deriveProjectRegions({ states, storedRegions: [] });
  assert.equal(regions.length, 2);
  assert.equal(regions.includes("South West"), true);
  assert.equal(regions.includes("South East"), true);
});

test("geography: legacy single-region single-state projects remain readable", () => {
  const states = normalizeStates(["Ekiti"]);
  const regions = deriveProjectRegions({ states, storedRegions: ["South West"] });
  assert.deepEqual(states, ["Ekiti"]);
  assert.deepEqual(regions, ["South West"]);

  // A legacy row whose stored region has no states still reads back.
  assert.deepEqual(deriveProjectRegions({ states: [], storedRegions: ["North East"] }), ["North East"]);
});

test("geography: non-canonical values are rejected rather than stored as free text", () => {
  assert.deepEqual(normalizeStates(["Lagos", "Atlantis", "", null, undefined]), ["Lagos"]);
  assert.deepEqual(normalizeRegions(["South West", "Middle Earth"]), ["South West"]);
  assert.deepEqual(deriveProjectRegions({ states: ["Atlantis"], storedRegions: ["Nowhere"] }), []);
});

test("geography: values are deduplicated and canonically ordered", () => {
  assert.deepEqual(normalizeStates(["Ogun", "Lagos", "Ogun", "Lagos"]), ["Lagos", "Ogun"]);
  const regions = normalizeRegions(["South East", "South West", "South East"]);
  assert.deepEqual(regions, ["South West", "South East"]);
});

test("geography: region to state narrowing supports every canonical region", () => {
  for (const region of NIGERIA_REGIONS) {
    const states = getStatesForRegion(region);
    assert.ok(states.length > 0, `${region} must map to at least one state`);
    for (const state of states) {
      assert.equal(deriveProjectRegions({ states: [state], storedRegions: [] })[0], region);
    }
  }
});
