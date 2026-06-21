import { describe, expect, it } from 'vitest';
import type { Projector } from './geo/projection';
import type { LngLat, PointMm, RectMm } from './geo/types';
import { roadLengths } from './roads';
import type { ClassifiedFeature } from './style/classify';

// lng/lat treated as page mm directly; at scale 1:1000, 1 page mm = 1 ground m.
const proj: Projector = {
  toPage: (p: LngLat): PointMm => ({ x: p.lng, y: p.lat }),
  page: { widthMm: 100, heightMm: 100 },
  scaleDenominator: 1,
};
const CLIP: RectMm = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
const SCALE = 1000;

function lineFeature(name: string | undefined, coords: [number, number][]): ClassifiedFeature {
  return {
    feature: {
      id: name ?? 'x',
      tags: name ? { name, highway: 'residential' } : { highway: 'service' },
      geometry: { type: 'LineString', coordinates: coords.map(([lng, lat]) => ({ lng, lat })) },
    },
    rule: { id: 'r', where: {}, z: 0, symbol: { type: 'line', widthMm: 0.6 } },
  };
}

describe('roadLengths', () => {
  it('sums each named road across segments, longest first, in ground metres', () => {
    const classified = [
      lineFeature('Main', [[0, 0], [0, 10]]), // 10mm
      lineFeature('Main', [[0, 20], [0, 30]]), // +10mm → 20mm total
      lineFeature('Side', [[0, 40], [0, 45]]), // 5mm
    ];
    expect(roadLengths(classified, proj, CLIP, SCALE)).toEqual([
      { name: 'Main', lengthM: 20 }, // 20mm × 1000/1000
      { name: 'Side', lengthM: 5 },
    ]);
  });

  it('counts only the portion inside the section', () => {
    const classified = [lineFeature('Edge', [[0, 90], [0, 110]])]; // 10mm visible (90→100)
    expect(roadLengths(classified, proj, CLIP, SCALE)).toEqual([{ name: 'Edge', lengthM: 10 }]);
  });

  it('ignores unnamed features and roads fully outside the section', () => {
    const classified = [lineFeature(undefined, [[0, 0], [0, 10]]), lineFeature('Far', [[200, 200], [200, 220]])];
    expect(roadLengths(classified, proj, CLIP, SCALE)).toEqual([]);
  });
});
