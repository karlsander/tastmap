import { layoutCells } from './braille/dots';
import type { BrailleCell } from './braille/translate';
import type { PointMm, RectMm } from './geo/types';
import { segment } from './scene/lines';
import type { Primitive, TextPrimitive } from './scene/types';

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
 * A classic two-tone four-point compass star for the furniture band: the whole
 * star drawn as a thin outline, with the counter-clockwise half of every point
 * filled black — the recognisable "pinwheel" of a map compass rose. North is
 * marked only by the "N" label above (drawn by the caller); the other points
 * are unlabelled. Centred at (cx, cy); points reach `R`, valleys sit at `rV`.
 */
function compassRose(cx: number, cy: number, R: number, rV: number): Primitive[] {
  // Angle measured clockwise from up (north), so the geometry matches the map.
  const pt = (deg: number, rad: number): PointMm => {
    const a = (deg * Math.PI) / 180;
    return at(cx + rad * Math.sin(a), cy - rad * Math.cos(a));
  };
  const o = at(cx, cy);

  // Outline: 8 vertices — each cardinal tip followed by the valley to the next.
  const ring: PointMm[] = [];
  for (let i = 0; i < 4; i++) {
    ring.push(pt(i * 90, R));
    ring.push(pt(i * 90 + 45, rV));
  }
  const out: Primitive[] = [{ kind: 'path', points: ring, closed: true, stroke: { widthMm: 0.4 } }];

  // Fill the counter-clockwise half of each point (tip → CCW valley → centre).
  for (let i = 0; i < 4; i++) {
    out.push({ kind: 'path', points: [pt(i * 90, R), pt(i * 90 - 45, rV), o], closed: true, fill: true });
  }
  return out;
}

export function buildFurniture(area: RectMm, opts: FurnitureOptions): Primitive[] {
  const out: Primitive[] = [];
  const top = area.minY + 4;
  // Shared top for every braille block, so title / scale / north read as one line.
  const brailleY = top + 3;

  // North indicator (far right) — a compass rose with an "N" above and braille beside.
  const R = 6;
  const cx = area.maxX - 13;
  const cy = area.minY + 11;
  out.push(...compassRose(cx, cy, R, 1.9));
  out.push(text('N', cx - 1, cy - R - 1.3, 3.2)); // centred above the north tip
  out.push(...layoutCells(opts.translate('n'), at(cx + R + 1.5, brailleY)));

  // Scale bar — tucked just left of the compass so the title gets the rest of
  // the band. Right-aligned to the compass; end + mid ticks; "<dist> m" label.
  // Raised so its braille lands on the shared braille line.
  const { distM, lengthMm } = scaleBarDistance(opts.scaleDenominator);
  const barX1 = cx - R - 6; // right end, a small gap from the compass
  const barX0 = barX1 - lengthMm; // left end
  const barY = brailleY - 2.5;
  out.push(segment(at(barX0, barY), at(barX1, barY), 0.5));
  for (const x of [barX0, (barX0 + barX1) / 2, barX1]) {
    out.push(segment(at(x, barY - 1.6), at(x, barY + 1.6), 0.4));
  }
  const distLabel = `${distM} m`;
  out.push(text(distLabel, barX0, barY - 2.2, 3));
  out.push(...layoutCells(opts.translate(distLabel), at(barX0, brailleY)));

  // Title block (left) — ink + braille — fills the remaining width.
  const title = opts.title.trim() || `1:${opts.scaleDenominator}`;
  out.push(text(title, area.minX, top, 3.5));
  out.push(...layoutCells(opts.translate(title), at(area.minX, brailleY)));

  return out;
}
