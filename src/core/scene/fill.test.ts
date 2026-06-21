import { describe, expect, it } from 'vitest';
import type { PointMm } from '../geo/types';
import { clearTextureAroundLine, clipTextureToPolygon, distPointToPolyline, pointInPolygon } from './fill';
import type { DotPrimitive, Primitive } from './types';

const sq = (s: number): PointMm[] => [
  { x: 0, y: 0 },
  { x: s, y: 0 },
  { x: s, y: s },
  { x: 0, y: s },
];

describe('pointInPolygon', () => {
  it('classifies inside/outside a square', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, sq(10))).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq(10))).toBe(false);
    expect(pointInPolygon({ x: -1, y: 5 }, sq(10))).toBe(false);
  });
});

describe('distPointToPolyline', () => {
  it('measures perpendicular distance to the nearest segment', () => {
    expect(distPointToPolyline({ x: 5, y: 3 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeCloseTo(3, 6);
  });
});

describe('clipTextureToPolygon', () => {
  it('keeps only dots inside the polygon', () => {
    const dots: DotPrimitive[] = [
      { kind: 'dot', center: { x: 5, y: 5 }, radiusMm: 0.5 },
      { kind: 'dot', center: { x: 50, y: 50 }, radiusMm: 0.5 },
    ];
    const kept = clipTextureToPolygon(dots, sq(10)) as DotPrimitive[];
    expect(kept).toHaveLength(1);
    expect(kept[0].center).toEqual({ x: 5, y: 5 });
  });

  it('trims a path to the part inside the polygon', () => {
    const line: Primitive = { kind: 'path', closed: false, points: [{ x: -5, y: 5 }, { x: 15, y: 5 }], stroke: { widthMm: 0.4 } };
    const kept = clipTextureToPolygon([line], sq(10));
    expect(kept.length).toBeGreaterThanOrEqual(1);
    for (const p of kept) {
      if (p.kind !== 'path') continue;
      for (const pt of p.points) {
        expect(pt.x).toBeGreaterThanOrEqual(-0.7); // ~within the square, allowing one sample step
        expect(pt.x).toBeLessThanOrEqual(10.7);
      }
    }
  });
});

describe('clearTextureAroundLine', () => {
  it('removes dots within the clear distance of the line', () => {
    const dots: DotPrimitive[] = [
      { kind: 'dot', center: { x: 5, y: 0.5 }, radiusMm: 0.5 }, // 0.5mm from line
      { kind: 'dot', center: { x: 5, y: 5 }, radiusMm: 0.5 }, // 5mm away
    ];
    const kept = clearTextureAroundLine(dots, [{ x: 0, y: 0 }, { x: 10, y: 0 }], 1) as DotPrimitive[];
    expect(kept).toHaveLength(1);
    expect(kept[0].center.y).toBe(5);
  });
});
