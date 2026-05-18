type NominatimAddress = {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state_district?: string;
  state?: string;
};

type NominatimResult = {
  display_name?: string;
  address?: NominatimAddress;
};

export type ResolvedLocation = {
  resolvedAddress: string | null;
  resolvedStreet: string | null;
  resolvedLga: string | null;
  resolvedCity: string | null;
  resolvedState: string | null;
};

export async function reverseGeocode(latitude: number | null, longitude: number | null): Promise<ResolvedLocation> {
  if (latitude === null || longitude === null) {
    return { resolvedAddress: null, resolvedStreet: null, resolvedLga: null, resolvedCity: null, resolvedState: null };
  }

  try {
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "18",
      layer: "address"
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        "User-Agent": "DeployIQ/1.0 (Impact Visibility Ltd)",
        "Accept-Language": "en"
      },
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Reverse geocoding failed.");
    const result = (await response.json()) as NominatimResult;
    const address = result.address ?? {};
    return {
      resolvedAddress: result.display_name ?? null,
      resolvedStreet: address.road ?? address.neighbourhood ?? address.suburb ?? null,
      resolvedLga: address.county ?? address.state_district ?? null,
      resolvedCity: address.city ?? address.town ?? address.village ?? null,
      resolvedState: address.state ?? null
    };
  } catch {
    return { resolvedAddress: null, resolvedStreet: null, resolvedLga: null, resolvedCity: null, resolvedState: null };
  }
}
