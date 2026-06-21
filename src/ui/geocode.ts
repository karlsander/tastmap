import type { LngLat } from '../core';

export interface GeocodeResult {
  center: LngLat;
  displayName: string;
}

/**
 * Geocode a free-text address with OpenStreetMap Nominatim. Returns null when
 * nothing matches. Public Nominatim is rate-limited (≤ 1 req/s) and asks for a
 * real identifier — fine for occasional interactive use; a production build
 * should self-host or use a keyed provider.
 */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (data.length === 0) return null;
  return {
    center: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) },
    displayName: data[0].display_name,
  };
}
