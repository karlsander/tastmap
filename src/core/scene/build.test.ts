import { describe, expect, it } from 'vitest';
import type { Projector } from '../geo/projection';
import type { LngLat, PointMm, RectMm } from '../geo/types';
import type { ClassifiedFeature } from '../style/classify';
import { buildScene } from './build';
import type { DotPrimitive, PathPrimitive } from './types';

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

describe('buildScene minLength (connectivity-aware)', () => {
  // A rule with a 5 mm minimum, so sub-5 mm parts are candidates for dropping.
  const RULE = { id: 'r', where: {}, z: 0, symbol: { type: 'line' as const, widthMm: 0.6, minLengthMm: 5 } };
  const seg = (id: string, coords: [number, number][]): ClassifiedFeature => ({
    feature: {
      id,
      tags: { highway: 'residential' },
      geometry: { type: 'LineString', coordinates: coords.map(([lng, lat]) => ({ lng, lat })) },
    },
    rule: RULE,
  });
  const out = (cs: ClassifiedFeature[]): PathPrimitive[] =>
    buildScene(cs, proj, CLIP).scene.primitives.filter((p): p is PathPrimitive => p.kind === 'path');

  // One street split into three OSM ways; the middle one is only 3 mm but sits
  // between two long pieces, sharing a junction node with each.
  const A = seg('a', [[50, 10], [50, 60]]);
  const BRIDGE = seg('b', [[50, 60], [50, 63]]); // 3 mm < 5 mm, interior
  const C = seg('c', [[50, 63], [50, 90]]);
  // A 3 mm fragment that touches nothing.
  const ISOLATED = seg('iso', [[10, 10], [13, 10]]);

  it('keeps a short fragment that bridges two pieces of the same street', () => {
    const ps = out([A, BRIDGE, C]);
    expect(ps).toHaveLength(3);
    expect(startsAt(ps, 50, 60)).toBe(true); // the 3 mm bridge survives → no gap
  });

  it('drops a short fragment that connects to nothing', () => {
    const ps = out([A, BRIDGE, C, ISOLATED]);
    expect(ps).toHaveLength(3);
    expect(startsAt(ps, 10, 10)).toBe(false); // the isolated sliver is gone
  });
});

describe('buildScene rail ties', () => {
  const railRule = {
    id: 'rail',
    where: {},
    z: 0,
    symbol: { type: 'line' as const, widthMm: 0.8, ties: { lengthMm: 3, spacingMm: 3, widthMm: 0.5 }, minLengthMm: 3 },
    labelable: false,
  };
  const rail = (coords: [number, number][]): ClassifiedFeature => ({
    feature: { id: 'rail', tags: { railway: 'rail' }, geometry: { type: 'LineString', coordinates: coords.map(([lng, lat]) => ({ lng, lat })) } },
    rule: railRule,
  });

  it('draws one centre stroke plus a field of cross-ties', () => {
    // mergeRail off so the centerline is the raw geometry (exact coords).
    const ps = buildScene([rail([[10, 50], [90, 50]])], proj, CLIP, { mergeRail: false }).scene.primitives.filter(
      (p): p is PathPrimitive => p.kind === 'path',
    );
    const centre = ps.filter((p) => p.stroke?.widthMm === 0.8);
    const ties = ps.filter((p) => p.stroke?.widthMm === 0.5);
    expect(centre).toHaveLength(1); // single traceable centre line
    expect(centre[0].points).toEqual([{ x: 10, y: 50 }, { x: 90, y: 50 }]);
    expect(ties.length).toBeGreaterThan(20); // 80 mm @ 3 mm spacing ≈ 27 ties
    expect(ties.every((t) => t.points.length === 2)).toBe(true);
  });

  it('surfaces the rail as a non-labelable drawn line (obstacle, never a label target)', () => {
    const { drawnLines } = buildScene([rail([[10, 50], [90, 50]])], proj, CLIP, { mergeRail: false });
    expect(drawnLines).toHaveLength(1);
    expect(drawnLines[0].labelable).toBe(false);
  });

  it('collapses two parallel tracks into a single rail corridor (centre + ties)', () => {
    const tracks = [rail([[10, 50], [90, 50]]), rail([[10, 52], [90, 52]])]; // 2 mm apart
    const { scene, drawnLines } = buildScene(tracks, proj, CLIP, {}); // mergeRail defaults on
    const centre = scene.primitives.filter((p): p is PathPrimitive => p.kind === 'path' && p.stroke?.widthMm === 0.8);
    expect(centre).toHaveLength(1); // two tracks → one centerline
    expect(drawnLines.every((l) => l.labelable === false)).toBe(true);
    const ys = centre[0].points.map((p) => p.y);
    expect(Math.min(...ys)).toBeGreaterThan(50); // sits between the two tracks (≈51)
    expect(Math.max(...ys)).toBeLessThan(52);
    expect(scene.primitives.some((p) => p.kind === 'path' && p.stroke?.widthMm === 0.5)).toBe(true); // ties drawn
  });
});

describe('buildScene POIs', () => {
  const poi = (id: string, geometry: ClassifiedFeature['feature']['geometry'], name?: string): ClassifiedFeature => ({
    feature: { id, tags: name ? { railway: 'station', name } : { railway: 'station' }, geometry },
    rule: { id: 'stations', where: {}, z: 9, symbol: { type: 'poi' } },
  });
  const point = (lng: number, lat: number): ClassifiedFeature['feature']['geometry'] => ({ type: 'Point', coordinates: { lng, lat } });

  it('collects an in-page station node as a POI anchor, drawing nothing itself', () => {
    const res = buildScene([poi('s', point(40, 60), 'Hbf')], proj, CLIP, {});
    expect(res.pois).toEqual([{ name: 'Hbf', point: { x: 40, y: 60 } }]);
    expect(res.scene.primitives).toHaveLength(0); // the badge is composited later, by the pipeline
    expect(res.drawnLines).toHaveLength(0);
  });

  it('drops a station node off the page', () => {
    expect(buildScene([poi('s', point(120, 60))], proj, CLIP, {}).pois).toEqual([]);
  });

  it('uses the centroid of a station mapped as an area', () => {
    const square: [number, number][] = [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]];
    const geom = { type: 'Polygon' as const, coordinates: square.map(([lng, lat]) => ({ lng, lat })) };
    const { pois } = buildScene([poi('area', geom, 'Yard')], proj, CLIP, {});
    expect(pois).toHaveLength(1);
    // Mean of the 5 ring vertices — the closing (20,20) is counted twice: 140/5.
    expect(pois[0].point.x).toBeCloseTo(28, 6);
    expect(pois[0].point.y).toBeCloseTo(28, 6);
  });
});

describe('buildScene area shading', () => {
  // A 40×40 square well inside the 100×100 page.
  const square: [number, number][] = [[20, 20], [60, 20], [60, 60], [20, 60], [20, 20]];
  const areaFeature = (id: string, symbol: any): ClassifiedFeature => ({
    feature: {
      id,
      tags: {},
      geometry: { type: 'Polygon', coordinates: square.map(([lng, lat]) => ({ lng, lat })) },
    },
    rule: { id: 'a', where: {}, z: 1, symbol },
  });
  const scene = (symbol: any) => buildScene([areaFeature('area', symbol)], proj, CLIP, {}).scene;

  it('shades an area with a dot grid clipped to the polygon, no outline', () => {
    const prims = scene({ type: 'area', fill: { kind: 'dots', spacingMm: 2.5, radiusMm: 0.5 } }).primitives;
    const dots = prims.filter((p): p is DotPrimitive => p.kind === 'dot');
    expect(dots.length).toBeGreaterThan(0);
    expect(prims.some((p) => p.kind === 'path')).toBe(false); // no outline, no stray lines
    expect(dots.every((d) => d.center.x >= 20 && d.center.x <= 60 && d.center.y >= 20 && d.center.y <= 60)).toBe(true);
  });

  it('shades water with cross-hatch plus a bank outline', () => {
    const prims = scene({ type: 'area', fill: { kind: 'crosshatch', spacingMm: 2, angleDeg: 45, widthMm: 0.4 }, outlineMm: 0.5 }).primitives;
    const paths = prims.filter((p): p is PathPrimitive => p.kind === 'path');
    expect(paths.some((p) => p.stroke?.widthMm === 0.4)).toBe(true); // hatch lines
    expect(paths.some((p) => p.stroke?.widthMm === 0.5)).toBe(true); // the outline
  });

  it('drops an area below minAreaM2 by real-world footprint, keeps one above', () => {
    // proj is 1:1000 with lng/lat used as page mm, so the 40×40 square is 1600 m².
    const fill = { kind: 'crosshatch' as const, spacingMm: 2, angleDeg: 45, widthMm: 0.4 };
    const kept = scene({ type: 'area', fill, outlineMm: 0.5, minAreaM2: 1000 }); // 1600 ≥ 1000
    expect(kept.primitives.length).toBeGreaterThan(0);
    const dropped = scene({ type: 'area', fill, outlineMm: 0.5, minAreaM2: 10000 }); // 1600 < 10000
    expect(dropped.primitives.length).toBe(0);
  });

  it('clips the fill to the outer ring minus its holes, and outlines both shores', () => {
    const outer: [number, number][] = [[10, 10], [90, 10], [90, 90], [10, 90], [10, 10]];
    const hole: [number, number][] = [[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]];
    const feat: ClassifiedFeature = {
      feature: {
        id: 'mp',
        tags: {},
        geometry: {
          type: 'Polygon',
          coordinates: outer.map(([lng, lat]) => ({ lng, lat })),
          holes: [hole.map(([lng, lat]) => ({ lng, lat }))],
        },
      },
      rule: { id: 'a', where: {}, z: 1, symbol: { type: 'area', fill: { kind: 'dots', spacingMm: 2.5, radiusMm: 0.5 }, outlineMm: 0.5 } },
    };
    const prims = buildScene([feat], proj, CLIP, {}).scene.primitives;
    const dots = prims.filter((p): p is DotPrimitive => p.kind === 'dot');
    expect(dots.length).toBeGreaterThan(0);
    expect(dots.some((d) => d.center.x > 10 && d.center.x < 40)).toBe(true); // fill in the ring
    expect(dots.every((d) => !(d.center.x > 40 && d.center.x < 60 && d.center.y > 40 && d.center.y < 60))).toBe(true); // island stays flat
    const outlines = prims.filter((p): p is PathPrimitive => p.kind === 'path' && p.stroke?.widthMm === 0.5);
    expect(outlines.length).toBeGreaterThanOrEqual(2); // outer shore + island shore
  });

  it('draws area shading beneath the road network', () => {
    const road: ClassifiedFeature = line('road', [[10, 40], [90, 40]]);
    const prims = buildScene([areaFeature('park', { type: 'area', fill: { kind: 'dots', spacingMm: 2.5, radiusMm: 0.5 } }), road], proj, CLIP, {}).scene.primitives;
    const lastDot = prims.map((p) => p.kind).lastIndexOf('dot');
    const roadPath = prims.findIndex((p) => p.kind === 'path');
    expect(lastDot).toBeLessThan(roadPath); // every dot precedes (renders under) the road
  });
});
