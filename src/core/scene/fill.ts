import type { PointMm } from '../geo/types';
import type { Primitive } from './types';

/**
 * Clip texture primitives to an arbitrary polygon, and clear texture away from a
 * line. This is what makes a texture read as a *shaped area* (a landmass) rather
 * than a rectangle, and lets a road cross a textured area cleanly. Also the core
 * of real area-feature rendering later.
 *
 * Hatch/dot generators fill a bounding rectangle; here we keep only the parts
 * that fall inside the polygon (or far enough from a line). Paths are resampled
 * so curved/segmented strokes clip smoothly.
 */

/** Ray-casting point-in-polygon (works for concave simple polygons). */
export function pointInPolygon(p: PointMm, poly: PointMm[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y;
    const yj = poly[j].y;
    if (yi > p.y !== yj > p.y) {
      const xCross = ((poly[j].x - poly[i].x) * (p.y - yi)) / (yj - yi) + poly[i].x;
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
}

function distToSegment(p: PointMm, a: PointMm, b: PointMm): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Shortest distance from a point to a polyline (page mm). */
export function distPointToPolyline(p: PointMm, pts: PointMm[]): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) min = Math.min(min, distToSegment(p, pts[i - 1], pts[i]));
  return min;
}

/** Resample a polyline at ~stepMm and keep the runs whose midpoints pass `keep`. */
function keepRuns(points: PointMm[], keep: (p: PointMm) => boolean, stepMm = 0.6): PointMm[][] {
  const samples: PointMm[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / stepMm));
    for (let k = 0; k < n; k++) samples.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  if (points.length > 0) samples.push(points[points.length - 1]);

  const runs: PointMm[][] = [];
  let cur: PointMm[] = [];
  for (let i = 1; i < samples.length; i++) {
    const mid = { x: (samples[i - 1].x + samples[i].x) / 2, y: (samples[i - 1].y + samples[i].y) / 2 };
    if (keep(mid)) {
      if (cur.length === 0) cur.push(samples[i - 1]);
      cur.push(samples[i]);
    } else {
      if (cur.length >= 2) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) runs.push(cur);
  return runs;
}

/** Keep only the parts of `texture` (dots + paths) that fall inside `poly`. */
export function clipTextureToPolygon(texture: Primitive[], poly: PointMm[]): Primitive[] {
  return filterTexture(texture, (p) => pointInPolygon(p, poly));
}

/** Remove the parts of `texture` within `clearMm` of `line` (a clear corridor). */
export function clearTextureAroundLine(texture: Primitive[], line: PointMm[], clearMm: number): Primitive[] {
  return filterTexture(texture, (p) => distPointToPolyline(p, line) > clearMm);
}

function filterTexture(texture: Primitive[], keep: (p: PointMm) => boolean): Primitive[] {
  const out: Primitive[] = [];
  for (const prim of texture) {
    if (prim.kind === 'dot') {
      if (keep(prim.center)) out.push(prim);
    } else if (prim.kind === 'path') {
      for (const run of keepRuns(prim.points, keep)) out.push({ kind: 'path', closed: false, points: run, stroke: prim.stroke });
    } else {
      out.push(prim);
    }
  }
  return out;
}
