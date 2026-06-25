import type { BBox } from '../geo/types';

export const DEFAULT_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/**
 * Overpass instances (overpass-api.de) reject requests without a User-Agent
 * with 406. Browsers send their own UA and forbid scripts from setting this
 * header, so it is silently dropped there; in Node/headless contexts it is sent
 * and also identifies our client politely.
 */
const USER_AGENT = 'tastmap/0.1 (tactile map generator)';

export interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  /** Present when the query uses `out geom;`. */
  geometry?: { lat: number; lon: number }[];
}

export interface OverpassRelationMember {
  type: 'way' | 'node' | 'relation';
  ref: number;
  /** 'outer' / 'inner' for a multipolygon boundary. */
  role: string;
  /** Present for way members when the query uses `out geom;`. */
  geometry?: { lat: number; lon: number }[];
}

export interface OverpassRelation {
  type: 'relation';
  id: number;
  tags?: Record<string, string>;
  members: OverpassRelationMember[];
}

export interface OverpassNode {
  type: 'node';
  id: number;
  tags?: Record<string, string>;
  lat: number;
  lon: number;
}

export type OverpassElement =
  | OverpassWay
  | OverpassRelation
  | OverpassNode
  | { type: string; id: number };

export interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Build an Overpass QL query returning, for each tag key within the bbox, both
 * ways and multipolygon relations (with inline geometry), plus standalone
 * *nodes* for each key in `nodeKeys` (point POIs such as stations).
 *
 * Ways carry most features. Large areas — a river wrapping an island, a lake
 * group — are mapped as multipolygon *relations* whose boundary is split across
 * many member ways and which may have holes; we fetch those too. `out geom;`
 * inlines node coordinates onto each way and onto every relation member, so we
 * never resolve node references ourselves.
 */
export function buildQuery(
  bbox: BBox,
  keys: string[],
  opts: { timeoutS?: number; nodeKeys?: string[] } = {},
): string {
  const timeoutS = opts.timeoutS ?? 30;
  const b = `(${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng})`;
  const clauses = keys.flatMap((k) => [
    `  way["${k}"]${b};`,
    `  relation["${k}"]["type"="multipolygon"]${b};`,
  ]);
  const nodeClauses = (opts.nodeKeys ?? []).map((k) => `  node["${k}"]${b};`);
  const body = [...clauses, ...nodeClauses].join('\n');
  return `[out:json][timeout:${timeoutS}];\n(\n${body}\n);\nout geom;`;
}

export interface FetchOptions {
  endpoint?: string;
  signal?: AbortSignal;
  /** OSM keys to also fetch as point nodes (POIs). See {@link buildQuery}. */
  nodeKeys?: string[];
}

export async function fetchOverpass(
  bbox: BBox,
  keys: string[],
  opts: FetchOptions = {},
): Promise<OverpassResponse> {
  const endpoint = opts.endpoint ?? DEFAULT_OVERPASS_ENDPOINT;
  const query = buildQuery(bbox, keys, { nodeKeys: opts.nodeKeys });
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: 'data=' + encodeURIComponent(query),
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`Overpass request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as OverpassResponse;
}
