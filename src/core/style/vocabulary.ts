/**
 * Tactile line vocabulary — values empirically validated on Schwellpapier.
 * See AGENTS.md ("Print run 1") for the findings behind each one. These are the
 * canonical line types the symbology should pick from for roads / paths /
 * borders / water etc.
 *
 * Minimum usable width is 0.3 mm: 0.2 mm swells but is hard to follow by finger.
 */

export type LinePattern =
  | { kind: 'solid'; widthMm: number }
  | { kind: 'dashed'; widthMm: number; dashMm: readonly number[] }
  | { kind: 'dotted'; spacingMm: number; radiusMm: number }
  | { kind: 'double'; widthMm: number; gapMm: number }
  /** Centre stroke with perpendicular cross-ties at a fixed spacing — the rail /
   *  tram look (a railway track under the fingertip). */
  | { kind: 'rail'; widthMm: number; tieLengthMm: number; tieSpacingMm: number; tieWidthMm: number };

export interface TactileLine {
  readonly label: string;
  readonly pattern: LinePattern;
}

/** Smallest stroke width that reliably reads under the fingertip (mm). */
export const MIN_LINE_WIDTH_MM = 0.3;

export const TACTILE_LINES = {
  /** Solid 0.3 mm — the thinnest still-followable line. */
  thin: { label: 'thin line', pattern: { kind: 'solid', widthMm: 0.3 } },
  /** Solid 0.8 mm — the default road/feature line. */
  normal: { label: 'normal line', pattern: { kind: 'solid', widthMm: 0.8 } },
  /** Solid 2.0 mm — strong emphasis. */
  thick: { label: 'thick line', pattern: { kind: 'solid', widthMm: 2.0 } },
  /** Two 0.5 mm lines 1.5 mm apart — reads clearly as a single (traceable) road. */
  double: { label: 'double line road', pattern: { kind: 'double', widthMm: 0.5, gapMm: 1.5 } },
  /** Round dots 3 mm apart (r 0.6) — the clearest dotted line. */
  dotted: { label: 'dotted line', pattern: { kind: 'dotted', spacingMm: 3, radiusMm: 0.6 } },
  /** 3 mm dash / 1.5 mm gap — distinct from both dotted and a solid line. */
  dashed: { label: 'dashed line', pattern: { kind: 'dashed', widthMm: 0.6, dashMm: [3, 1.5] } },
  /** 0.8 mm centre stroke + 3 mm cross-ties every 3 mm (0.5 mm) — the "rail"
   *  candidate from test-sheet page 2; reads unmistakably as a railway track. */
  rail: { label: 'rail line', pattern: { kind: 'rail', widthMm: 0.8, tieLengthMm: 3, tieSpacingMm: 3, tieWidthMm: 0.5 } },
} as const satisfies Record<string, TactileLine>;

export type TactileLineName = keyof typeof TACTILE_LINES;

/**
 * Area fill patterns validated on print run 1 — distinct under the fingertip and
 * usable even in small areas. The four directional hatches read as *directions*
 * (the finger follows the grooves). Solids print but feel unpleasant (raise too
 * much / too soft), so prefer a dense cross-hatch (x1 / x0.5) for "solid" areas.
 */
export type AreaFill =
  | { kind: 'crosshatch'; spacingMm: number; angleDeg: number; widthMm: number }
  | { kind: 'dots'; spacingMm: number; radiusMm: number }
  | { kind: 'hatch'; spacingMm: number; angleDeg: number; widthMm: number };

export interface TactileArea {
  readonly label: string;
  readonly fill: AreaFill;
}

export const TACTILE_AREAS = {
  crosshatch: { label: 'cross-hatch', fill: { kind: 'crosshatch', spacingMm: 2, angleDeg: 45, widthMm: 0.4 } },
  dots: { label: 'dot grid', fill: { kind: 'dots', spacingMm: 2.5, radiusMm: 0.5 } },
  hatchH: { label: 'directional —', fill: { kind: 'hatch', spacingMm: 2.5, angleDeg: 0, widthMm: 0.4 } },
  hatchF: { label: 'directional /', fill: { kind: 'hatch', spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 } },
  hatchV: { label: 'directional |', fill: { kind: 'hatch', spacingMm: 2.5, angleDeg: 90, widthMm: 0.4 } },
  hatchB: { label: 'directional \\', fill: { kind: 'hatch', spacingMm: 2.5, angleDeg: 135, widthMm: 0.4 } },
} as const satisfies Record<string, TactileArea>;

export type TactileAreaName = keyof typeof TACTILE_AREAS;
