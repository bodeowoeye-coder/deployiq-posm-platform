export const NIGERIA_REGIONS = ["South West", "South East", "South South", "North Central", "North East", "North West", "FCT"] as const;

export const NIGERIA_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara"
] as const;

export const STATE_TO_REGION: Record<(typeof NIGERIA_STATES)[number], (typeof NIGERIA_REGIONS)[number]> = {
  Abia: "South East",
  Adamawa: "North East",
  "Akwa Ibom": "South South",
  Anambra: "South East",
  Bauchi: "North East",
  Bayelsa: "South South",
  Benue: "North Central",
  Borno: "North East",
  "Cross River": "South South",
  Delta: "South South",
  Ebonyi: "South East",
  Edo: "South South",
  Ekiti: "South West",
  Enugu: "South East",
  FCT: "FCT",
  Gombe: "North East",
  Imo: "South East",
  Jigawa: "North West",
  Kaduna: "North West",
  Kano: "North West",
  Katsina: "North West",
  Kebbi: "North West",
  Kogi: "North Central",
  Kwara: "North Central",
  Lagos: "South West",
  Nasarawa: "North Central",
  Niger: "North Central",
  Ogun: "South West",
  Ondo: "South West",
  Osun: "South West",
  Oyo: "South West",
  Plateau: "North Central",
  Rivers: "South South",
  Sokoto: "North West",
  Taraba: "North East",
  Yobe: "North East",
  Zamfara: "North West"
};

export function getRegionForState(state: string) {
  return STATE_TO_REGION[state as keyof typeof STATE_TO_REGION] ?? "";
}

export function getStatesForRegion(region: string) {
  return NIGERIA_STATES.filter((state) => STATE_TO_REGION[state] === region);
}

export function isCanonicalRegion(value: string): value is (typeof NIGERIA_REGIONS)[number] {
  return (NIGERIA_REGIONS as readonly string[]).includes(value);
}

export function isCanonicalState(value: string): value is (typeof NIGERIA_STATES)[number] {
  return (NIGERIA_STATES as readonly string[]).includes(value);
}

function orderedBy(reference: readonly string[], values: string[]) {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.sort((a, b) => {
    const indexA = reference.indexOf(a);
    const indexB = reference.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}

export function normalizeRegions(values: Array<string | null | undefined>) {
  return orderedBy(NIGERIA_REGIONS, values.map((value) => (value ?? "").trim()).filter(isCanonicalRegion));
}

export function normalizeStates(values: Array<string | null | undefined>) {
  return orderedBy(NIGERIA_STATES, values.map((value) => (value ?? "").trim()).filter(isCanonicalState));
}

// A project's region coverage is the union of explicitly stored regions and the canonical
// regions implied by its states, so multi-region projects read back completely.
export function deriveProjectRegions(input: { states?: Array<string | null | undefined> | null; storedRegions?: Array<string | null | undefined> | null }) {
  const fromStates = (input.states ?? []).map((state) => getRegionForState((state ?? "").trim()));
  return normalizeRegions([...(input.storedRegions ?? []), ...fromStates]);
}

export type ProjectGeographySelection = {
  regions: string[];
  states: string[];
};

export function addRegionToSelection(selection: ProjectGeographySelection, region: string): ProjectGeographySelection {
  if (!region || selection.regions.includes(region)) return selection;
  return { ...selection, regions: normalizeRegions([...selection.regions, region]) };
}

// Removing a Region drops only that Region's States; every other selection is preserved.
export function removeRegionFromSelection(selection: ProjectGeographySelection, region: string): ProjectGeographySelection {
  return {
    regions: selection.regions.filter((item) => item !== region),
    states: selection.states.filter((state) => getRegionForState(state) !== region),
  };
}

export function addStateToSelection(selection: ProjectGeographySelection, state: string): ProjectGeographySelection {
  if (!state || selection.states.includes(state)) return selection;
  return {
    regions: normalizeRegions([...selection.regions, getRegionForState(state)]),
    states: normalizeStates([...selection.states, state]),
  };
}

export function removeStateFromSelection(selection: ProjectGeographySelection, state: string): ProjectGeographySelection {
  return { ...selection, states: selection.states.filter((item) => item !== state) };
}

// Regions narrow the offered States, but an already selected State is never hidden.
export function visibleStatesFor(selection: ProjectGeographySelection) {
  if (selection.regions.length === 0) return [...NIGERIA_STATES];
  return NIGERIA_STATES.filter((state) => selection.regions.includes(getRegionForState(state)) || selection.states.includes(state));
}

export function selectionFromProject(project: {
  regions_covered?: string[] | null;
  project_regions?: string[] | null;
  primary_target_region?: string | null;
  primary_target_state?: string | null;
}): ProjectGeographySelection {
  const states = normalizeStates([...(project.regions_covered ?? []), project.primary_target_state ?? ""]);
  return {
    states,
    regions: deriveProjectRegions({ states, storedRegions: [...(project.project_regions ?? []), project.primary_target_region ?? ""] }),
  };
}
