import { describe, expect, it } from 'vitest';
import type { PointMm } from '../geo/types';
import { beadedPath, ladderAlongPath, ladderPath, parallelPair, scatterFill, segment, wavyFill, wavyPath } from './lines';

const at = (x: number, y: number): PointMm => ({ x, y });

describe('segment', () => {
  it('is a two-point open stroke', () => {
    const s = segment(at(0, 0), at(10, 0), 0.5, [2, 1]);
    expect(s.points).toEqual([at(0, 0), at(10, 0)]);
    expect(s.closed).toBe(false);
    expect(s.stroke).toEqual({ widthMm: 0.5, dashMm: [2, 1] });
  });
});

describe('wavyPath', () => {
  it('starts exactly at a and samples along the way', () => {
    const w = wavyPath(at(0, 50), at(60, 50), { amplitudeMm: 1, wavelengthMm: 6, widthMm: 0.5 });
    expect(w.points[0]).toEqual(at(0, 50));
    expect(w.points.length).toBeGreaterThan(10);
    for (const p of w.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe('beadedPath', () => {
  it('places dots every spacing along the polyline, endpoints included', () => {
    const dots = beadedPath([at(0, 0), at(10, 0)], { spacingMm: 2, radiusMm: 0.6 });
    expect(dots.map((d) => d.center.x)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(dots.every((d) => d.radiusMm === 0.6 && d.center.y === 0)).toBe(true);
  });
});

describe('parallelPair', () => {
  it('returns two strokes offset either side of the centre line', () => {
    const pair = parallelPair(at(0, 5), at(10, 5), { gapMm: 2, widthMm: 0.4 });
    expect(pair).toHaveLength(2);
    expect(pair[0].points[0].y).toBeCloseTo(6, 6);
    expect(pair[1].points[0].y).toBeCloseTo(4, 6);
  });
});

describe('ladderPath', () => {
  it('draws only cross-ties when rails are off', () => {
    const ties = ladderPath(at(0, 0), at(10, 0), { tieLengthMm: 4, tieSpacingMm: 2, widthMm: 0.4 });
    expect(ties).toHaveLength(5); // ties at d = 1,3,5,7,9
  });

  it('adds two rails when rails are on', () => {
    const both = ladderPath(at(0, 0), at(10, 0), { tieLengthMm: 4, tieSpacingMm: 2, widthMm: 0.4, rails: true, railGapMm: 3 });
    expect(both).toHaveLength(7); // 2 rails + 5 ties
  });
});

describe('ladderAlongPath', () => {
  it('places ties every spacing along a straight polyline, perpendicular to it', () => {
    const ties = ladderAlongPath([at(0, 0), at(10, 0)], { tieLengthMm: 4, tieSpacingMm: 2, widthMm: 0.5 });
    expect(ties).toHaveLength(5); // ties centred at x = 1,3,5,7,9
    // First tie spans the full tie length, perpendicular (vertical) to a horizontal track.
    expect(ties[0].points[0]).toEqual(at(1, 2));
    expect(ties[0].points[1]).toEqual(at(1, -2));
    expect(ties.every((t) => t.stroke?.widthMm === 0.5)).toBe(true);
  });

  it('keeps spacing continuous across a bend (no reset at the vertex)', () => {
    // An L of two 6 mm legs (total 12 mm); ties every 3 mm → centres at arc 1.5,
    // 4.5, 7.5, 10.5 → two on each leg, none bunched at the corner.
    const ties = ladderAlongPath([at(0, 0), at(6, 0), at(6, 6)], { tieLengthMm: 2, tieSpacingMm: 3, widthMm: 0.4 });
    expect(ties).toHaveLength(4);
    // The third tie (arc 7.5) is 1.5 mm up the vertical leg.
    const mid = (t: (typeof ties)[number]) => ({ x: (t.points[0].x + t.points[1].x) / 2, y: (t.points[0].y + t.points[1].y) / 2 });
    expect(mid(ties[2]).x).toBeCloseTo(6, 6);
    expect(mid(ties[2]).y).toBeCloseTo(1.5, 6);
  });

  it('returns nothing for a degenerate path or non-positive spacing', () => {
    expect(ladderAlongPath([at(0, 0)], { tieLengthMm: 2, tieSpacingMm: 2, widthMm: 0.4 })).toEqual([]);
    expect(ladderAlongPath([at(0, 0), at(10, 0)], { tieLengthMm: 2, tieSpacingMm: 0, widthMm: 0.4 })).toEqual([]);
  });
});

describe('wavyFill', () => {
  it('stacks wavy rows within the rect', () => {
    const rows = wavyFill({ minX: 0, minY: 0, maxX: 40, maxY: 20 }, { amplitudeMm: 0.8, wavelengthMm: 6, rowGapMm: 4, widthMm: 0.4 });
    expect(rows.length).toBeGreaterThan(2);
  });
});

describe('scatterFill', () => {
  it('is deterministic and stays within the rect', () => {
    const rect = { minX: 0, minY: 0, maxX: 30, maxY: 20 };
    const a = scatterFill(rect, { spacingMm: 4, radiusMm: 0.6, jitterMm: 1 });
    const b = scatterFill(rect, { spacingMm: 4, radiusMm: 0.6, jitterMm: 1 });
    expect(a).toEqual(b); // deterministic
    for (const d of a) {
      expect(d.center.x).toBeGreaterThanOrEqual(rect.minX + d.radiusMm - 1e-6);
      expect(d.center.x).toBeLessThanOrEqual(rect.maxX - d.radiusMm + 1e-6);
      expect(d.center.y).toBeGreaterThanOrEqual(rect.minY + d.radiusMm - 1e-6);
      expect(d.center.y).toBeLessThanOrEqual(rect.maxY - d.radiusMm + 1e-6);
    }
  });
});
