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

  // North indicator (right) — arrow up + "N".
  const nx = area.maxX - 14;
  const nTop = top;
  const nBot = top + 9;
  out.push(segment(at(nx, nBot), at(nx, nTop), 0.5));
  out.push(segment(at(nx, nTop), at(nx - 1.8, nTop + 3), 0.5), segment(at(nx, nTop), at(nx + 1.8, nTop + 3), 0.5));
  out.push(text('N', nx + 3, nTop + 5, 4));
  out.push(...layoutCells(opts.translate('n'), at(nx + 3, nTop + 6.5)));

  return out;
}
