import { clipPolylineToRect } from '../geo/clip';
import type { Projector } from '../geo/projection';
import type { PointMm, RectMm } from '../geo/types';
import type { ClassifiedFeature } from '../style/classify';
import type { PathPrimitive, Primitive, Scene } from './types';

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
 * minLengthMm is enforced per clipped part: a stroke that survives clipping only
 * as a sub-threshold sliver at the page edge is dropped, since it would not be
 * feel-able anyway.
 *
 * TODO (next slices):
 *   - generalize: simplify, enforce minimum feature separation, displace
 *   - area textures (hatch/dots) instead of solid fills
 *   - braille labels + keyed legend
 */
export function buildScene(
  classified: ClassifiedFeature[],
  proj: Projector,
  clip: RectMm,
): Scene {
  const primitives: Primitive[] = [];
  for (const { feature, rule } of classified) {
    if (rule.symbol.type !== 'line') continue; // areas: TODO
    const points = feature.geometry.coordinates.map((c) => proj.toPage(c));
    const isPolygon = feature.geometry.type === 'Polygon';
    const stroke = { widthMm: rule.symbol.widthMm, dashMm: rule.symbol.dashMm };
    for (const part of clipPolylineToRect(points, clip, isPolygon)) {
      if (rule.symbol.minLengthMm && pathLengthMm(part) < rule.symbol.minLengthMm) continue;
      const path: PathPrimitive = { kind: 'path', points: part, closed: false, stroke };
      primitives.push(path);
    }
  }
  return { widthMm: proj.page.widthMm, heightMm: proj.page.heightMm, primitives };
}
