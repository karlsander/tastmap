import { clipPolylineToRect } from '../geo/clip';
import type { PointMm, RectMm } from '../geo/types';
import type { DotPrimitive, PathPrimitive } from './types';

/**
 * Tactile area fills. Areas must never be solid black (everything would swell
 * into one indistinguishable plateau), so surfaces are conveyed by texture:
 * parallel hatching or a grid of dots. These fill an axis-aligned rectangle;
 * future area features will clip the same patterns to arbitrary polygons.
 */

export interface HatchOptions {
  /** Perpendicular distance between adjacent lines, millimetres. */
  spacingMm: number;
  /** Line orientation in degrees (0 = horizontal, 90 = vertical). */
  angleDeg?: number;
  /** Stroke width of each hatch line, millimetres. */
  widthMm: number;
}

/** Parallel hatch lines filling `rect`, each clipped to the rectangle. */
export function hatchFill(rect: RectMm, opts: HatchOptions): PathPrimitive[] {
  const { spacingMm, widthMm } = opts;
  if (spacingMm <= 0) return [];
  const angle = ((opts.angleDeg ?? 0) * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy; // unit normal to the line direction
  const ny = dx;
  const cx = (rect.minX + rect.maxX) / 2;
  const cy = (rect.minY + rect.maxY) / 2;
  const diag = Math.hypot(rect.maxX - rect.minX, rect.maxY - rect.minY);
  const half = diag / 2;

  const out: PathPrimitive[] = [];
  // Step along the normal across the whole rectangle; each step is one line,
  // drawn long enough (±diag along the direction) to span the rect before clip.
  for (let o = -half; o <= half + 1e-9; o += spacingMm) {
    const bx = cx + nx * o;
    const by = cy + ny * o;
    const a: PointMm = { x: bx - dx * diag, y: by - dy * diag };
    const b: PointMm = { x: bx + dx * diag, y: by + dy * diag };
    for (const part of clipPolylineToRect([a, b], rect)) {
      out.push({ kind: 'path', points: part, closed: false, stroke: { widthMm } });
    }
  }
  return out;
}

/** Cross-hatch: hatching at `angleDeg` and its perpendicular. */
export function crossHatchFill(
  rect: RectMm,
  opts: HatchOptions,
): PathPrimitive[] {
  const base = opts.angleDeg ?? 0;
  return [
    ...hatchFill(rect, opts),
    ...hatchFill(rect, { ...opts, angleDeg: base + 90 }),
  ];
}

export interface DotGridOptions {
  /** Centre-to-centre dot spacing, millimetres (both axes). */
  spacingMm: number;
  /** Dot radius, millimetres. */
  radiusMm: number;
}

/** A regular grid of dots inside `rect`, inset so no dot pokes past the edge. */
export function dotFill(rect: RectMm, opts: DotGridOptions): DotPrimitive[] {
  const { spacingMm, radiusMm } = opts;
  if (spacingMm <= 0) return [];
  const out: DotPrimitive[] = [];
  for (let y = rect.minY + radiusMm; y <= rect.maxY - radiusMm + 1e-9; y += spacingMm) {
    for (let x = rect.minX + radiusMm; x <= rect.maxX - radiusMm + 1e-9; x += spacingMm) {
      out.push({ kind: 'dot', center: { x, y }, radiusMm });
    }
  }
  return out;
}

/** A rectangle outline as a closed stroked path (no fill). */
export function rectOutline(rect: RectMm, widthMm: number): PathPrimitive {
  return {
    kind: 'path',
    closed: true,
    stroke: { widthMm },
    points: [
      { x: rect.minX, y: rect.minY },
      { x: rect.maxX, y: rect.minY },
      { x: rect.maxX, y: rect.maxY },
      { x: rect.minX, y: rect.maxY },
    ],
  };
}

/** A solid black rectangle. (Tactile areas normally need texture, not solid —
 *  use this for testing how large black regions behave on the fuser.) */
export function filledRect(rect: RectMm): PathPrimitive {
  return {
    kind: 'path',
    closed: true,
    fill: true,
    points: [
      { x: rect.minX, y: rect.minY },
      { x: rect.maxX, y: rect.minY },
      { x: rect.maxX, y: rect.maxY },
      { x: rect.minX, y: rect.maxY },
    ],
  };
}

/** A solid black polygon (e.g. a triangle) from its corner points. */
export function filledPolygon(points: PointMm[]): PathPrimitive {
  return { kind: 'path', closed: true, fill: true, points };
}
