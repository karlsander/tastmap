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

export type Symbology = LineSymbology | AreaSymbology;

export interface Rule {
  id: string;
  where: TagMatch;
  /** Higher z draws on top. */
  z: number;
  symbol: Symbology;
}

export interface StyleSpec {
  id: string;
  name: string;
  /** OSM tag keys this style needs fetched from Overpass. */
  sourceKeys: string[];
  /** Evaluated in order; the first matching rule wins. */
  rules: Rule[];
  /** Collapse divided roads (two parallel oneway carriageways of the same name)
   *  to a single centerline, then join same-named survivors end-to-end, so each
   *  street reads as one stroke. Omitted/`true` keeps this on; set `false` to
   *  draw each carriageway as its own line (a divided road as two fat lanes). */
  collapseDualCarriageways?: boolean;
}
