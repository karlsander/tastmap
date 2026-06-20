import type { PointMm, RectMm } from './types';

/**
 * Clip page-space geometry to the printable rectangle.
 *
 * Tactile maps must not run ink into the printer's unprintable border, and a
 * line that leaves the page and comes back must read as two separate strokes
 * under the finger — so clipping a polyline can yield several polylines.
 */

const EPS = 1e-9;

interface Visible {
  c0: PointMm;
  c1: PointMm;
  /** Parameters along the segment a→b where the visible portion starts/ends. */
  t0: number;
  t1: number;
}

/**
 * Liang–Barsky: clip the segment a→b to `rect`, returning the visible sub-segment
 * (with its endpoints and parameters) or null if the segment misses the rect.
 */
function clipSegment(a: PointMm, b: PointMm, rect: RectMm): Visible | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // For each edge: p is the segment's component against the edge's inward normal,
  // q is the signed distance from a to that edge.
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - rect.minX, rect.maxX - a.x, a.y - rect.minY, rect.maxY - a.y];

  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      // Parallel to this edge: rejected only if it starts outside the slab.
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return {
    t0,
    t1,
    c0: { x: a.x + t0 * dx, y: a.y + t0 * dy },
    c1: { x: a.x + t1 * dx, y: a.y + t1 * dy },
  };
}

/**
 * Clip a polyline to `rect`, returning zero or more polylines (each with ≥2
 * points). A closed input is clipped as a ring (its closing edge included); the
 * returned parts are always open — a fully-contained ring comes back as one
 * polyline whose last point repeats the first.
 */
export function clipPolylineToRect(
  points: PointMm[],
  rect: RectMm,
  closed = false,
): PointMm[][] {
  const ring = closed && points.length > 1 ? [...points, points[0]] : points;
  if (ring.length < 2) return [];

  const parts: PointMm[][] = [];
  let current: PointMm[] = [];
  const flush = (): void => {
    if (current.length >= 2) parts.push(current);
    current = [];
  };

  for (let i = 1; i < ring.length; i++) {
    const vis = clipSegment(ring[i - 1], ring[i], rect);
    if (!vis) {
      flush();
      continue;
    }
    // A start parameter > 0 means the line (re)enters the rect here, so it cannot
    // connect to whatever came before — begin a fresh part.
    if (current.length === 0 || vis.t0 > EPS) {
      flush();
      current.push(vis.c0);
    }
    current.push(vis.c1);
    // An end parameter < 1 means the line exits the rect here.
    if (vis.t1 < 1 - EPS) flush();
  }
  flush();
  return parts;
}

/** The printable rectangle in page mm: the page inset by its margins. */
export function printableRect(
  page: { widthMm: number; heightMm: number },
  margins: { top: number; right: number; bottom: number; left: number },
): RectMm {
  return {
    minX: margins.left,
    minY: margins.top,
    maxX: page.widthMm - margins.right,
    maxY: page.heightMm - margins.bottom,
  };
}
