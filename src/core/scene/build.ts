import { clipPolylineToRect } from '../geo/clip';
import type { Projector } from '../geo/projection';
import { simplify } from '../geo/simplify';
import type { PointMm, RectMm } from '../geo/types';
import type { ClassifiedFeature } from '../style/classify';
import type { PathPrimitive, Primitive, Scene } from './types';

/** Default Douglas–Peucker tolerance (page mm) — well under tactile resolution,
 *  so it only de-noises sub-millimetre wiggle. */
export const DEFAULT_SIMPLIFY_MM = 0.3;

export interface BuildOptions {
  /** Polyline simplification tolerance in page mm. 0 disables. */
  simplifyToleranceMm?: number;
}

function pathLengthMm(points: PointMm[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/**
 * Turn classified features into scene primitives in page millimetres, clipped to
 * the printable rectangle `clip` (the page inset by its margins).
 *
 * Generalization: each clipped part is Douglas–Peucker simplified (drops
 * sub-tactile wiggle); minLengthMm is then enforced per part, so a stroke that
 * survives clipping only as a sub-threshold sliver is dropped (it would not be
 * feel-able anyway).
 *
 * TODO (next slices):
 *   - enforce minimum feature *separation* (displace crowded parallels)
 *   - area textures (hatch/dots) instead of solid fills
 */
export function buildScene(
  classified: ClassifiedFeature[],
  proj: Projector,
  clip: RectMm,
  opts: BuildOptions = {},
): Scene {
  const tol = opts.simplifyToleranceMm ?? DEFAULT_SIMPLIFY_MM;
  const primitives: Primitive[] = [];
  for (const { feature, rule } of classified) {
    if (rule.symbol.type !== 'line') continue; // areas: TODO
    const points = feature.geometry.coordinates.map((c) => proj.toPage(c));
    const isPolygon = feature.geometry.type === 'Polygon';
    const stroke = { widthMm: rule.symbol.widthMm, dashMm: rule.symbol.dashMm };
    for (const part of clipPolylineToRect(points, clip, isPolygon)) {
      const simplified = simplify(part, tol);
      if (rule.symbol.minLengthMm && pathLengthMm(simplified) < rule.symbol.minLengthMm) continue;
      const path: PathPrimitive = { kind: 'path', points: simplified, closed: false, stroke };
      primitives.push(path);
    }
  }
  return { widthMm: proj.page.widthMm, heightMm: proj.page.heightMm, primitives };
}
