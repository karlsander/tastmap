/**
 * A tag matcher. A rule matches a feature when every entry is satisfied:
 *   - `true`      → the key must be present (any value)
 *   - `"value"`   → the key must equal exactly this value
 *   - `[...]`     → the key's value must be one of these
 */
export type TagMatch = Record<string, true | string | string[]>;

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

/** Placeholder for upcoming area treatments — tactile areas need *textures*,
 *  never solid black fills (everything black would swell into one plateau). */
export interface AreaSymbology {
  type: 'area';
  texture: 'none' | 'hatch' | 'dots';
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
}
