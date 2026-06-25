import { describe, expect, it } from 'vitest';
import type { PointMm } from '../geo/types';
import { collapseDualCarriageways, type Way } from './dualCarriageway';

const way = (over: Partial<Way>): Way => ({
  featureId: 'way/1',
  name: 'Ave',
  oneway: true,
  points: [],
  isPolygon: false,
  stroke: { widthMm: 2 },
  ...over,
});

/** Vertical line at x, from y0 to y1, sampled every `step` mm. */
const vline = (x: number, y0: number, y1: number, step = 5): PointMm[] => {
  const pts: PointMm[] = [];
  const dir = y1 >= y0 ? step : -step;
  for (let y = y0; dir > 0 ? y <= y1 : y >= y1; y += dir) pts.push({ x, y });
  return pts;
};
const meanX = (pts: PointMm[]): number => pts.reduce((s, p) => s + p.x, 0) / pts.length;
const ySpan = (pts: PointMm[]): number => Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));

describe('collapseDualCarriageways (graph-based)', () => {
  it('pairs an antiparallel oneway pair into one centerline down the median', () => {
    const a = way({ featureId: 'a', points: vline(0, 0, 100) });
    const b = way({ featureId: 'b', points: vline(4, 100, 0) });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });

    expect(out).toHaveLength(1);
    expect(meanX(out[0].points)).toBeGreaterThan(1);
    expect(meanX(out[0].points)).toBeLessThan(3); // median at x≈2
    expect(ySpan(out[0].points)).toBeGreaterThan(90);
  });

  it('pairs a same-direction pair too (parallel, not antiparallel)', () => {
    const a = way({ featureId: 'a', points: vline(0, 0, 100) });
    const b = way({ featureId: 'b', points: vline(6, 0, 100) });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });

    expect(out).toHaveLength(1);
    expect(meanX(out[0].points)).toBeGreaterThan(2);
    expect(meanX(out[0].points)).toBeLessThan(4); // median at x≈3
  });

  it('keeps the widest stroke and the name when it merges', () => {
    const a = way({ featureId: 'a', points: vline(0, 0, 100), stroke: { widthMm: 2 } });
    const b = way({ featureId: 'b', points: vline(4, 100, 0), stroke: { widthMm: 0.8 } });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });
    expect(out).toHaveLength(1);
    expect(out[0].stroke.widthMm).toBe(2);
    expect(out[0].name).toBe('Ave');
    expect(out[0].oneway).toBe(false);
  });

  it('leaves carriageways farther apart than maxSeparationMm as two lines', () => {
    const a = way({ featureId: 'a', points: vline(0, 0, 100) });
    const b = way({ featureId: 'b', points: vline(40, 100, 0) });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });

    expect(out).toHaveLength(2);
    const xs = out.map((w) => meanX(w.points)).sort((p, q) => p - q);
    expect(xs[0]).toBeLessThan(1);
    expect(xs[1]).toBeGreaterThan(39);
  });

  it('passes a lone oneway way through with its geometry intact', () => {
    const a = way({ featureId: 'a', points: vline(0, 0, 100) });
    const out = collapseDualCarriageways([a], { maxSeparationMm: 10 });
    expect(out).toHaveLength(1);
    expect(out[0].points).toEqual(a.points);
  });

  it('never merges two-way streets, even when parallel and same-named', () => {
    const a = way({ featureId: 'a', oneway: false, points: vline(0, 0, 100) });
    const b = way({ featureId: 'b', oneway: false, points: vline(4, 100, 0) });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });
    expect(out).toHaveLength(2);
    expect(out.map((w) => w.featureId).sort()).toEqual(['a', 'b']);
  });

  it('does not merge nearby parallel oneway ways with different names', () => {
    const a = way({ featureId: 'a', name: 'First Ave', points: vline(0, 0, 100) });
    const b = way({ featureId: 'b', name: 'Second Ave', points: vline(4, 100, 0) });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });
    expect(out).toHaveLength(2);
  });

  it('chains collinear same-named pieces into one continuous line', () => {
    // A carriageway split at a cross-street node (0,50): degree-2 within the
    // name group, so the two pieces stitch back into one line, no twin to pair.
    const a = way({ featureId: 'a', points: vline(0, 0, 50) });
    const b = way({ featureId: 'b', points: vline(0, 50, 100) });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });

    expect(out).toHaveLength(1);
    expect(meanX(out[0].points)).toBeCloseTo(0, 5);
    expect(ySpan(out[0].points)).toBeCloseTo(100, 5);
  });

  it('collapses 3+ same-named carriageways into one centered line', () => {
    // A wide road / interchange with three parallel oneway carriageways at
    // x=0,4,8. Greedy pairing seeds one pair; the third is absorbed and the
    // midline recentres on the true middle (x≈4), not a lopsided x≈5.
    const a = way({ featureId: 'a', points: vline(0, 0, 100) });
    const b = way({ featureId: 'b', points: vline(4, 100, 0) });
    const c = way({ featureId: 'c', points: vline(8, 0, 100) });
    const out = collapseDualCarriageways([a, b, c], { maxSeparationMm: 10 });

    expect(out).toHaveLength(1);
    expect(meanX(out[0].points)).toBeGreaterThan(3.3);
    expect(meanX(out[0].points)).toBeLessThan(4.7);
  });

  it('heals a cross-street onto the new midline (clean junction)', () => {
    // Divided "Ave" (x=0 and x=4 → median at x≈2) crossed by a two-way street
    // that ends on the carriageway node (0,50). Its endpoint should snap to the
    // centerline (x≈2), not stop a lane-width short at the old carriageway.
    const a = way({ featureId: 'a', points: vline(0, 0, 100) }); // has a vertex at (0,50)
    const b = way({ featureId: 'b', points: vline(4, 100, 0) });
    const cross = way({ featureId: 'x', name: 'Cross', oneway: false, points: [{ x: -20, y: 50 }, { x: 0, y: 50 }] });
    const out = collapseDualCarriageways([a, b, cross], { maxSeparationMm: 10 });

    const healed = out.find((w) => w.featureId === 'x');
    expect(healed).toBeDefined();
    const end = healed!.points[healed!.points.length - 1];
    expect(end.x).toBeGreaterThan(1.5);
    expect(end.x).toBeLessThan(2.5);
    expect(end.y).toBeCloseTo(50, 5);
  });
});
