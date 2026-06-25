import type { AreaFill } from './vocabulary';

/** Negation: satisfied when the key is absent, or present with a value that is
 *  not in the excluded set. Lets a rule say "footways, but not sidewalks". */
export interface TagNot {
  not: string | string[];
}

export type TagCondition = true | string | string[] | TagNot;

/**
 * A tag matcher. A rule matches a feature when every entry is satisfied:
 *   - `true`         → the key must be present (any value)
 *   - `"value"`      → the key must equal exactly this value
 *   - `[...]`        → the key's value must be one of these
 *   - `{ not: ... }` → the key must be absent, or hold a value outside the set
 */
export type TagMatch = Record<string, TagCondition>;

export interface LineSymbology {
  type: 'line';
  /** Stroke width on paper, millimetres. Keep distinct bands well separated so
   *  they read as different surfaces under the fingertip. */
  widthMm: number;
  /** Optional dash pattern in millimetres: [on, off, ...]. */
  dashMm?: number[];
  /** Drop features whose on-paper length is below this (tactile minimum). */
  minLengthMm?: number;
  /** Perpendicular cross-ties laid along the centre stroke (the rail / tram
   *  look). The centre stroke uses {@link widthMm}; the ties are drawn on top. */
  ties?: { lengthMm: number; spacingMm: number; widthMm: number };
}

/** Area fill for a polygon feature (park, water…). Tactile areas need *textures*,
 *  never solid black fills (everything black would swell into one plateau), so
 *  the surface is conveyed by a dot grid or hatching from the vocabulary. */
export interface AreaSymbology {
  type: 'area';
  /** Tactile fill pattern (dots / cross-hatch / hatch — see {@link AreaFill}). */
  fill: AreaFill;
  /** Outline stroke width (mm) for the polygon boundary; omit for no outline
   *  (e.g. parks read fine from texture alone; water wants a bank line). */
  outlineMm?: number;
}

/** A point feature (a node, or the representative point of an area) drawn as a
 *  POI badge: a labelled marker rather than a traced line or shaded area. The
 *  badge's braille content is decided by the pipeline (the label style), so the
 *  symbology only declares that this feature is a POI. */
export interface PoiSymbology {
  type: 'poi';
}

export type Symbology = LineSymbology | AreaSymbology | PoiSymbology;

export interface Rule {
  id: string;
  where: TagMatch;
  /** Higher z draws on top. */
  z: number;
  symbol: Symbology;
  /** Whether this rule's features are nameable "roads" — surfaced in the road
   *  list and given on-map street labels. Defaults to `true`; set `false` for
   *  line features that carry a name but must not be labelled as streets (rail
   *  lines, for instance). */
  labelable?: boolean;
}

export interface StyleSpec {
  id: string;
  name: string;
  /** OSM tag keys this style needs fetched from Overpass (ways + multipolygon
   *  relations). */
  sourceKeys: string[];
  /** OSM tag keys to additionally fetch as *nodes* (point POIs), e.g. `railway`
   *  for stations. Kept separate from {@link sourceKeys} so we don't pull the
   *  flood of untagged-purpose nodes a line key like `highway` would bring;
   *  fetched broadly by key and narrowed to the wanted values by the rules. */
  nodeKeys?: string[];
  /** Evaluated in order; the first matching rule wins. */
  rules: Rule[];
  /** Collapse divided roads (two parallel oneway carriageways of the same name)
   *  to a single centerline, then join same-named survivors end-to-end, so each
   *  street reads as one stroke. Omitted/`true` keeps this on; set `false` to
   *  draw each carriageway as its own line (a divided road as two fat lanes). */
  collapseDualCarriageways?: boolean;
}
