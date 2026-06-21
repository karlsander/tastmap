import type { PointMm } from '../geo/types';
import type { DotPrimitive } from '../scene/types';
import { MARBURG_MEDIUM } from './spec';
import type { BrailleCell } from './translate';

/**
 * Local offset (mm) of a braille dot number within its cell, relative to the
 * cell's top-left dot position. Dot layout:
 *    1 4
 *    2 5
 *    3 6
 */
export function dotOffset(dot: number, pitch = MARBURG_MEDIUM.dotPitchMm): PointMm {
  const col = dot >= 4 ? 1 : 0;
  const row = (dot - 1) % 3;
  return { x: col * pitch, y: row * pitch };
}

/**
 * Lay out a run of cells, `origin` being the top-left dot of the first cell.
 * Spacing is always Marburg standard; `dotDiameterMm` overrides only the dot
 * size (smaller dots may swell into pointier, more distinct bumps).
 */
export function layoutCells(cells: BrailleCell[], origin: PointMm, dotDiameterMm: number = MARBURG_MEDIUM.dotDiameterMm): DotPrimitive[] {
  const dots: DotPrimitive[] = [];
  const radius = dotDiameterMm / 2;
  cells.forEach((cell, i) => {
    const cellX = origin.x + i * MARBURG_MEDIUM.cellPitchMm;
    for (const d of cell) {
      const off = dotOffset(d);
      dots.push({ kind: 'dot', center: { x: cellX + off.x, y: origin.y + off.y }, radiusMm: radius });
    }
  });
  return dots;
}

/** On-paper width (mm) occupied by a run of `count` cells. */
export function cellsWidthMm(count: number): number {
  if (count <= 0) return 0;
  return (count - 1) * MARBURG_MEDIUM.cellPitchMm + MARBURG_MEDIUM.dotPitchMm + MARBURG_MEDIUM.dotDiameterMm;
}
