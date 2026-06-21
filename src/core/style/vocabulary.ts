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
  | { kind: 'double'; widthMm: number; gapMm: number };

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
} as const satisfies Record<string, TactileLine>;

export type TactileLineName = keyof typeof TACTILE_LINES;
