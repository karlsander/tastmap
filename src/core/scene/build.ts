import type { Projector } from '../geo/projection';
import type { PointMm } from '../geo/types';
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
 * Turn classified features into scene primitives in page millimetres.
 *
 * TODO (next slices):
 *   - clip geometry to the printable area
 *   - generalize: simplify, enforce minimum feature separation, displace
 *   - area textures (hatch/dots) instead of solid fills
 *   - braille labels + keyed legend
 */
export function buildScene(classified: ClassifiedFeature[], proj: Projector): Scene {
  const primitives: Primitive[] = [];
  for (const { feature, rule } of classified) {
    if (rule.symbol.type !== 'line') continue; // areas: TODO
    const points = feature.geometry.coordinates.map((c) => proj.toPage(c));
    if (rule.symbol.minLengthMm && pathLengthMm(points) < rule.symbol.minLengthMm) continue;
    const path: PathPrimitive = {
      kind: 'path',
      points,
      closed: feature.geometry.type === 'Polygon',
      stroke: { widthMm: rule.symbol.widthMm, dashMm: rule.symbol.dashMm },
    };
    primitives.push(path);
  }
  return { widthMm: proj.page.widthMm, heightMm: proj.page.heightMm, primitives };
}
