import type { PointMm, RectMm } from '../geo/types';
import type { DotPrimitive, PathPrimitive } from './types';

/**
 * Decorated line styles for tactile cartography. A flat black stroke reads as a
 * road; other classes (administrative borders, rivers, rail) need to *feel*
 * categorically different, so they get their own geometry — beads, waves,
 * cross-ties, parallel pairs — rather than just a different width.
 *
 * All inputs/outputs are page millimetres. These are the building blocks the
 * test sheets explore and that real symbology will later select from.
 */

function unit(a: PointMm, b: PointMm): { ux: number; uy: number; len: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { ux: 0, uy: 0, len: 0 } : { ux: dx / len, uy: dy / len, len };
}

/** A straight stroked segment. */
export function segment(a: PointMm, b: PointMm, widthMm: number, dashMm?: number[]): PathPrimitive {
  return { kind: 'path', closed: false, points: [a, b], stroke: { widthMm, ...(dashMm ? { dashMm } : {}) } };
}

/** Points along a circular arc (degrees), for smooth bends — curved roads,
 *  roundabouts, or rounded corners. */
export function arcPoints(cx: number, cy: number, r: number, a0Deg: number, a1Deg: number, n = 10): PointMm[] {
  const a0 = (a0Deg * Math.PI) / 180;
  const a1 = (a1Deg * Math.PI) / 180;
  const out: PointMm[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** A sinusoidal path from a to b — a candidate river / watercourse style. */
export function wavyPath(
  a: PointMm,
  b: PointMm,
  opts: { amplitudeMm: number; wavelengthMm: number; widthMm: number; samplesPerWave?: number },
): PathPrimitive {
  const { ux, uy, len } = unit(a, b);
  const nx = -uy;
  const ny = ux;
  const n = Math.max(2, Math.ceil((len / opts.wavelengthMm) * (opts.samplesPerWave ?? 12)));
  const points: PointMm[] = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * len;
    const off = Math.sin((s / opts.wavelengthMm) * 2 * Math.PI) * opts.amplitudeMm;
    points.push({ x: a.x + ux * s + nx * off, y: a.y + uy * s + ny * off });
  }
  return { kind: 'path', closed: false, points, stroke: { widthMm: opts.widthMm } };
}

/** Evenly spaced dots along a polyline — a candidate boundary "beaded" style. */
export function beadedPath(
  points: PointMm[],
  opts: { spacingMm: number; radiusMm: number },
): DotPrimitive[] {
  const out: DotPrimitive[] = [];
  if (points.length === 0) return out;
  if (points.length === 1) return [{ kind: 'dot', center: points[0], radiusMm: opts.radiusMm }];
  let target = 0;
  let pos = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const { ux, uy, len } = unit(a, b);
    if (len === 0) continue;
    while (target <= pos + len + 1e-9) {
      const local = target - pos;
      out.push({ kind: 'dot', center: { x: a.x + ux * local, y: a.y + uy * local }, radiusMm: opts.radiusMm });
      target += opts.spacingMm;
    }
    pos += len;
  }
  return out;
}

/** Two parallel strokes `gapMm` apart — a road "casing" / channel you can trace
 *  between two edges, or a double administrative border. */
export function parallelPair(
  a: PointMm,
  b: PointMm,
  opts: { gapMm: number; widthMm: number; dashMm?: number[] },
): PathPrimitive[] {
  const { ux, uy } = unit(a, b);
  const nx = -uy;
  const ny = ux;
  const h = opts.gapMm / 2;
  return [h, -h].map((s) =>
    segment({ x: a.x + nx * s, y: a.y + ny * s }, { x: b.x + nx * s, y: b.y + ny * s }, opts.widthMm, opts.dashMm),
  );
}

/** A "ladder": optional parallel rails plus perpendicular cross-ties. Models
 *  tram/rail tracks and, with `rails: false`, a zebra-crossing's stripes. */
export function ladderPath(
  a: PointMm,
  b: PointMm,
  opts: {
    tieLengthMm: number;
    tieSpacingMm: number;
    widthMm: number;
    rails?: boolean;
    railGapMm?: number;
    railWidthMm?: number;
  },
): (PathPrimitive)[] {
  const { ux, uy, len } = unit(a, b);
  if (len === 0) return [];
  const nx = -uy;
  const ny = ux;
  const out: PathPrimitive[] = [];
  if (opts.rails) {
    const h = (opts.railGapMm ?? opts.tieLengthMm) / 2;
    for (const s of [h, -h]) {
      out.push(
        segment({ x: a.x + nx * s, y: a.y + ny * s }, { x: b.x + nx * s, y: b.y + ny * s }, opts.railWidthMm ?? opts.widthMm),
      );
    }
  }
  const half = opts.tieLengthMm / 2;
  for (let d = opts.tieSpacingMm / 2; d <= len + 1e-9; d += opts.tieSpacingMm) {
    const cx = a.x + ux * d;
    const cy = a.y + uy * d;
    out.push(segment({ x: cx + nx * half, y: cy + ny * half }, { x: cx - nx * half, y: cy - ny * half }, opts.widthMm));
  }
  return out;
}

/** Cross-ties laid along a whole polyline at a constant arc-length spacing, each
 *  perpendicular to the local travel direction — the tie field of a rail line.
 *  Spacing runs continuously across vertices (no reset per segment), so bends in
 *  the track don't bunch or thin the ties. The centre stroke is drawn separately. */
export function ladderAlongPath(
  points: PointMm[],
  opts: { tieLengthMm: number; tieSpacingMm: number; widthMm: number },
): PathPrimitive[] {
  const out: PathPrimitive[] = [];
  if (points.length < 2 || opts.tieSpacingMm <= 0) return out;
  const half = opts.tieLengthMm / 2;
  let next = opts.tieSpacingMm / 2; // first tie half a step in
  let acc = 0; // arc length consumed up to the start of the current segment
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const { ux, uy, len } = unit(a, b);
    if (len === 0) continue;
    const nx = -uy;
    const ny = ux;
    while (next <= acc + len + 1e-9) {
      const d = next - acc; // distance along this segment to the tie centre
      const cx = a.x + ux * d;
      const cy = a.y + uy * d;
      out.push(segment({ x: cx + nx * half, y: cy + ny * half }, { x: cx - nx * half, y: cy - ny * half }, opts.widthMm));
      next += opts.tieSpacingMm;
    }
    acc += len;
  }
  return out;
}

/** Stacked wavy lines filling a rectangle — a candidate water-area fill. */
export function wavyFill(
  rect: RectMm,
  opts: { amplitudeMm: number; wavelengthMm: number; rowGapMm: number; widthMm: number },
): PathPrimitive[] {
  const out: PathPrimitive[] = [];
  for (let y = rect.minY + opts.amplitudeMm; y <= rect.maxY - opts.amplitudeMm + 1e-9; y += opts.rowGapMm) {
    out.push(
      wavyPath({ x: rect.minX, y }, { x: rect.maxX, y }, {
        amplitudeMm: opts.amplitudeMm,
        wavelengthMm: opts.wavelengthMm,
        widthMm: opts.widthMm,
      }),
    );
  }
  return out;
}

/** Deterministic jittered dot scatter in a rect — a candidate park / woodland
 *  fill. Deterministic (no RNG) so prints are reproducible. */
export function scatterFill(
  rect: RectMm,
  opts: { spacingMm: number; radiusMm: number; jitterMm: number },
): DotPrimitive[] {
  const out: DotPrimitive[] = [];
  let row = 0;
  for (let y = rect.minY + opts.spacingMm / 2; y <= rect.maxY - opts.radiusMm + 1e-9; y += opts.spacingMm) {
    let col = 0;
    for (let x = rect.minX + opts.spacingMm / 2; x <= rect.maxX - opts.radiusMm + 1e-9; x += opts.spacingMm) {
      // Cheap deterministic hash → [-1, 1] jitter, distinct per cell.
      const jx = Math.sin((col * 12.9898 + row * 78.233) * 43758.5453) % 1;
      const jy = Math.sin((col * 39.346 + row * 11.135) * 24634.6345) % 1;
      const cx = Math.min(rect.maxX - opts.radiusMm, Math.max(rect.minX + opts.radiusMm, x + jx * opts.jitterMm));
      const cy = Math.min(rect.maxY - opts.radiusMm, Math.max(rect.minY + opts.radiusMm, y + jy * opts.jitterMm));
      out.push({ kind: 'dot', center: { x: cx, y: cy }, radiusMm: opts.radiusMm });
      col++;
    }
    row++;
  }
  return out;
}
