type NominatimAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  municipality?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state_district?: string;
  state?: string;
  country?: string;
};

type NominatimResult = {
  display_name?: string;
  address?: NominatimAddress;
};

export type ResolvedLocation = {
  resolvedAddress: string | null;
  resolvedStreet: string | null;
  resolvedNeighbourhood: string | null;
  resolvedLga: string | null;
  resolvedCity: string | null;
  resolvedState: string | null;
  resolvedCountry: string | null;
};

const emptyResolvedLocation: ResolvedLocation = {
  resolvedAddress: null,
  resolvedStreet: null,
  resolvedNeighbourhood: null,
  resolvedLga: null,
  resolvedCity: null,
  resolvedState: null,
  resolvedCountry: null
};

const DEFAULT_REVERSE_GEOCODE_TIMEOUT_MS = 3500;

function compactAddress(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index)
    .join(", ");
}

export async function reverseGeocode(
  latitude: number | null,
  longitude: number | null,
  timeoutMs = DEFAULT_REVERSE_GEOCODE_TIMEOUT_MS
): Promise<ResolvedLocation> {
  if (latitude === null || longitude === null) {
    return emptyResolvedLocation;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "18"
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        "User-Agent": "DeployIQ/1.0 (Impact Visibility Ltd)",
        "Accept-Language": "en"
      },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Reverse geocoding failed.");
    const result = (await response.json()) as NominatimResult;
    const address = result.address ?? {};
    const road = address.road ?? address.pedestrian ?? address.footway ?? null;
    const street = compactAddress([address.house_number, road]) || null;
    const neighbourhood = address.neighbourhood ?? address.suburb ?? address.city_district ?? null;
    const lga = address.county ?? address.state_district ?? address.municipality ?? null;
    const city = address.city ?? address.town ?? address.village ?? null;
    const state = address.state ?? null;
    const country = address.country ?? null;
    const fallbackAddress = compactAddress([street, neighbourhood, city, lga, state, country]) || null;
    return {
      resolvedAddress: result.display_name ?? fallbackAddress,
      resolvedStreet: street ?? road,
      resolvedNeighbourhood: neighbourhood,
      resolvedLga: lga,
      resolvedCity: city,
      resolvedState: state,
      resolvedCountry: country
    };
  } catch {
    return emptyResolvedLocation;
  } finally {
    clearTimeout(timeout);
  }
}
