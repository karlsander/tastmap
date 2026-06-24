import { clipPolylineToRect } from './geo/clip';
import { groundMeters, type Projector } from './geo/projection';
import type { PointMm, RectMm } from './geo/types';
import type { ClassifiedFeature } from './style/classify';

export interface RoadLength {
  name: string;
  /** Total ground length within the rendered section, metres. */
  lengthM: number;
}

function polylineLengthMm(pts: PointMm[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/**
 * Total ground length (metres) of each *named* feature visible within `clip`,
 * summed across all its segments and clipped to the section, longest first.
 * Lengths are derived from the on-page geometry × scale, so they reflect exactly
 * what the rendered section covers.
 */
export function roadLengths(
  classified: ClassifiedFeature[],
  proj: Projector,
  clip: RectMm,
  scaleDenominator: number,
): RoadLength[] {
  const mmByName = new Map<string, number>();
  for (const { feature, rule } of classified) {
    if (rule.symbol.type !== 'line') continue; // areas (parks, water) aren't roads
    const name = feature.tags.name;
    if (!name) continue;
    const projected = feature.geometry.coordinates.map((c) => proj.toPage(c));
    let mm = 0;
    for (const part of clipPolylineToRect(projected, clip, feature.geometry.type === 'Polygon')) {
      mm += polylineLengthMm(part);
    }
    if (mm > 0) mmByName.set(name, (mmByName.get(name) ?? 0) + mm);
  }
  return [...mmByName.entries()]
    .map(([name, mm]) => ({ name, lengthM: groundMeters(mm, scaleDenominator) }))
    .sort((a, b) => b.lengthM - a.lengthM);
}
