import { layoutCells } from './braille/dots';
import type { BrailleCell } from './braille/translate';
import type { PointMm, RectMm } from './geo/types';
import { segment } from './scene/lines';
import type { PathPrimitive, Primitive, TextPrimitive } from './scene/types';

/**
 * Map furniture for the bottom band of a map page: a title block, a scale bar,
 * and a north indicator — each in ink + braille. Drawn in page millimetres
 * within the given band rectangle; the map itself is clipped to sit above it.
 */

const NICE_M = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/** Largest "nice" ground distance whose scale-bar fits ~55 mm of paper. */
export function scaleBarDistance(scaleDenominator: number): { distM: number; lengthMm: number } {
  let distM = NICE_M[0];
  for (const d of NICE_M) if ((d * 1000) / scaleDenominator <= 55) distM = d;
  return { distM, lengthMm: (distM * 1000) / scaleDenominator };
}

export interface FurnitureOptions {
  scaleDenominator: number;
  /** Title text; falls back to "1:N" when empty. */
  title: string;
  translate: (s: string) => BrailleCell[];
}

const at = (x: number, y: number): PointMm => ({ x, y });
const text = (s: string, x: number, y: number, sizeMm: number): TextPrimitive => ({
  kind: 'text',
  origin: at(x, y),
  text: s,
  sizeMm,
});

/**
 * A simple four-point compass star for the furniture band: cardinal points
 * (N/E/S/W) drawn as a thin outline, with only the north point filled black so
 * it reads as "north" without much mass. Centred at (cx, cy); points reach `R`,
 * the valleys between them sit at radius `rV`.
 */
function compassRose(cx: number, cy: number, R: number, rV: number): Primitive[] {
  // Angle measured clockwise from up (north), so the geometry matches the map.
  const pt = (deg: number, rad: number): PointMm => {
    const a = (deg * Math.PI) / 180;
    return at(cx + rad * Math.sin(a), cy - rad * Math.cos(a));
  };

  // Outline: 8 vertices — each cardinal tip followed by the valley to the next.
  const ring: PointMm[] = [];
  for (let i = 0; i < 4; i++) {
    ring.push(pt(i * 90, R));
    ring.push(pt(i * 90 + 45, rV));
  }
  const star: PathPrimitive = { kind: 'path', points: ring, closed: true, stroke: { widthMm: 0.4 } };
  // Fill the north point only — the triangle between the valleys flanking N.
  const north: PathPrimitive = { kind: 'path', points: [pt(315, rV), pt(0, R), pt(45, rV)], closed: true, fill: true };
  return [star, north];
}

export function buildFurniture(area: RectMm, opts: FurnitureOptions): Primitive[] {
  const out: Primitive[] = [];
  out.push(segment(at(area.minX, area.minY), at(area.maxX, area.minY), 0.3)); // separator
  const top = area.minY + 4;

  // Title block (left) — ink + braille.
  const title = opts.title.trim() || `1:${opts.scaleDenominator}`;
  out.push(text(title, area.minX, top, 3.5));
  out.push(...layoutCells(opts.translate(title), at(area.minX, top + 2.5)));

  // Scale bar (centre-left), with end + mid ticks and a "<dist> m" label.
  const { distM, lengthMm } = scaleBarDistance(opts.scaleDenominator);
  const barX0 = area.minX + 72;
  const barY = top + 5;
  out.push(segment(at(barX0, barY), at(barX0 + lengthMm, barY), 0.5));
  for (const x of [barX0, barX0 + lengthMm / 2, barX0 + lengthMm]) {
    out.push(segment(at(x, barY - 1.6), at(x, barY + 1.6), 0.4));
  }
  const distLabel = `${distM} m`;
  out.push(text(distLabel, barX0, barY - 2.2, 3));
  out.push(...layoutCells(opts.translate(distLabel), at(barX0, barY + 2.5)));

  // North indicator (right) — a compass rose with an "N" above and braille beside.
  const R = 6;
  const cx = area.maxX - 13;
  const cy = area.minY + 11;
  out.push(...compassRose(cx, cy, R, 2.2));
  out.push(text('N', cx - 1, cy - R - 1.3, 3.2)); // centred above the north tip
  out.push(...layoutCells(opts.translate('n'), at(cx + R + 1.5, cy - 2.5)));

  return out;
}
