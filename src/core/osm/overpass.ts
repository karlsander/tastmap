import type { BBox } from '../geo/types';

export const DEFAULT_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  /** Present when the query uses `out geom;`. */
  geometry?: { lat: number; lon: number }[];
}

export type OverpassElement = OverpassWay | { type: string; id: number };

export interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Build an Overpass QL query returning ways (with inline geometry) that carry
 * any of the given top-level tag keys within the bbox.
 *
 * `out geom;` inlines node coordinates onto each way, so we never resolve node
 * references ourselves. Relations (multipolygons) are out of scope for now.
 */
export function buildQuery(bbox: BBox, keys: string[], timeoutS = 30): string {
  const b = `(${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng})`;
  const clauses = keys.map((k) => `  way["${k}"]${b};`).join('\n');
  return `[out:json][timeout:${timeoutS}];\n(\n${clauses}\n);\nout geom;`;
}

export interface FetchOptions {
  endpoint?: string;
  signal?: AbortSignal;
}

export async function fetchOverpass(
  bbox: BBox,
  keys: string[],
  opts: FetchOptions = {},
): Promise<OverpassResponse> {
  const endpoint = opts.endpoint ?? DEFAULT_OVERPASS_ENDPOINT;
  const query = buildQuery(bbox, keys);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`Overpass request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as OverpassResponse;
}
