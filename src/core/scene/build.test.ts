import { describe, expect, it } from 'vitest';
import type { Projector } from '../geo/projection';
import type { LngLat, PointMm, RectMm } from '../geo/types';
import type { ClassifiedFeature } from '../style/classify';
import { buildScene } from './build';
import type { PathPrimitive } from './types';

// lng/lat are used directly as page mm. Page is 100×100, so the snippet length
// cap is 100/3 ≈ 33.3 mm and the edge band is 2 mm. At 1:1000, 1 page mm = 1 m.
const proj: Projector = {
  toPage: (p: LngLat): PointMm => ({ x: p.lng, y: p.lat }),
  page: { widthMm: 100, heightMm: 100 },
  scaleDenominator: 1000,
};
const CLIP: RectMm = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

function line(id: string, coords: [number, number][], name?: string): ClassifiedFeature {
  return {
    feature: {
      id,
      tags: name ? { highway: 'residential', name } : { highway: 'residential' },
      geometry: { type: 'LineString', coordinates: coords.map(([lng, lat]) => ({ lng, lat })) },
    },
    rule: { id: 'r', where: {}, z: 0, symbol: { type: 'line', widthMm: 0.6 } },
  };
}

const paths = (classified: ClassifiedFeature[], trim: boolean): PathPrimitive[] =>
  buildScene(classified, proj, CLIP, { trimEdgeSnippets: trim }).scene.primitives.filter(
    (p): p is PathPrimitive => p.kind === 'path',
  );
const startsAt = (ps: PathPrimitive[], x: number, y: number): boolean =>
  ps.some((p) => Math.abs(p.points[0].x - x) < 1e-6 && Math.abs(p.points[0].y - y) < 1e-6);

// A short snippet hugging the left edge, connected to nothing.
const SNIPPET = line('snippet', [[0, 50], [8, 50]], 'Stub Lane');
// A short edge stub, but it shares node (8,20) with a longer street.
const STUB = line('stub', [[0, 20], [8, 20]]);
const TRUNK = line('trunk', [[8, 20], [8, 80]]);
// Edge-touching but long (40 ≥ 33.3), so not a snippet.
const LONG = line('long', [[0, 90], [40, 90]]);
// Short and unconnected, but in the interior (far from any edge).
const INTERIOR = line('interior', [[50, 50], [55, 50]]);

const ALL = [SNIPPET, STUB, TRUNK, LONG, INTERIOR];

describe('buildScene trimEdgeSnippets', () => {
  it('keeps every street when trimming is off', () => {
    expect(paths(ALL, false)).toHaveLength(5);
  });

  it('drops a short, edge-hugging, unconnected snippet', () => {
    const out = paths(ALL, true);
    expect(out).toHaveLength(4);
    expect(startsAt(out, 0, 50)).toBe(false); // the snippet is gone
  });

  it('spares an edge stub that connects to another street', () => {
    expect(startsAt(paths(ALL, true), 0, 20)).toBe(true);
  });

  it('spares an edge street that is long enough', () => {
    expect(startsAt(paths(ALL, true), 0, 90)).toBe(true);
  });

  it('spares a short, unconnected street away from the edge', () => {
    expect(startsAt(paths(ALL, true), 50, 50)).toBe(true);
  });

  it('reports the trimmed streets with name and ground length', () => {
    const { trimmed } = buildScene(ALL, proj, CLIP, { trimEdgeSnippets: true });
    expect(trimmed).toEqual([{ name: 'Stub Lane', lengthM: 8 }]); // 8 page mm at 1:1000 = 8 m
  });

  it('reports nothing trimmed when the option is off', () => {
    expect(buildScene(ALL, proj, CLIP).trimmed).toEqual([]);
  });
});
