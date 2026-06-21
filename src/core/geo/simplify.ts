import type { PointMm } from './types';

/**
 * Ramer–Douglas–Peucker polyline simplification in page millimetres. Tactile
 * resolution is coarse (~2–3 mm), so sub-millimetre wiggle is invisible to the
 * finger and only wastes fuser ink / blurs the line — drop it. Operates on
 * already-projected page geometry; keep the tolerance well under the tactile
 * limit (a few tenths of a mm) so shape is preserved, just de-noised.
 */

/** Perpendicular distance from p to the segment a→b (page mm). */
function perpDistance(p: PointMm, a: PointMm, b: PointMm): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Project p onto the infinite line, clamp to the segment, measure the gap.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Simplify a polyline, keeping every point that deviates more than `toleranceMm`. */
export function simplify(points: PointMm[], toleranceMm: number): PointMm[] {
  if (toleranceMm <= 0 || points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop() as [number, number];
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistance(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > toleranceMm && idx !== -1) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
