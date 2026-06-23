import { describe, expect, it } from 'vitest';
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

describe('collapseDualCarriageways', () => {
  it('folds an antiparallel oneway pair onto its midline and drops the twin', () => {
    // Two carriageways of "Ave": up the x=0 line, down the x=4 line.
    const a = way({ featureId: 'a', points: [{ x: 0, y: 0 }, { x: 0, y: 100 }] });
    const b = way({ featureId: 'b', points: [{ x: 4, y: 100 }, { x: 4, y: 0 }] });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });

    expect(out).toHaveLength(1);
    // Survivor runs down the median at x≈2.
    expect(out[0].points.every((p) => Math.abs(p.x - 2) < 1e-6)).toBe(true);
    expect(out[0].points[0].y).toBe(0);
    expect(out[0].points[out[0].points.length - 1].y).toBe(100);
  });

  it('also folds a pair digitised in the same direction (parallel, not antiparallel)', () => {
    const a = way({ featureId: 'a', points: [{ x: 0, y: 0 }, { x: 0, y: 100 }] });
    const b = way({ featureId: 'b', points: [{ x: 6, y: 0 }, { x: 6, y: 100 }] });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });

    expect(out).toHaveLength(1);
    expect(out[0].points.every((p) => Math.abs(p.x - 3) < 1e-6)).toBe(true);
  });

  it('leaves carriageways further apart than maxSeparationMm untouched', () => {
    const a = way({ featureId: 'a', points: [{ x: 0, y: 0 }, { x: 0, y: 100 }] });
    const b = way({ featureId: 'b', points: [{ x: 40, y: 100 }, { x: 40, y: 0 }] });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });

    expect(out).toHaveLength(2);
    expect(out.map((w) => w.featureId).sort()).toEqual(['a', 'b']);
  });

  it('passes through a lone oneway way (no twin of the same name)', () => {
    const a = way({ featureId: 'a', points: [{ x: 0, y: 0 }, { x: 0, y: 100 }] });
    const out = collapseDualCarriageways([a], { maxSeparationMm: 10 });
    expect(out).toEqual([a]);
  });

  it('never merges two-way streets, even when parallel and same-named', () => {
    const a = way({ featureId: 'a', oneway: false, points: [{ x: 0, y: 0 }, { x: 0, y: 100 }] });
    const b = way({ featureId: 'b', oneway: false, points: [{ x: 4, y: 100 }, { x: 4, y: 0 }] });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });
    expect(out).toHaveLength(2);
  });

  it('does not merge nearby parallel oneway ways with different names', () => {
    const a = way({ featureId: 'a', name: 'First Ave', points: [{ x: 0, y: 0 }, { x: 0, y: 100 }] });
    const b = way({ featureId: 'b', name: 'Second Ave', points: [{ x: 4, y: 100 }, { x: 4, y: 0 }] });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });
    expect(out).toHaveLength(2);
  });

  it('joins same-named survivors that meet end-to-end into one polyline', () => {
    // One carriageway split into two collinear OSM ways (no parallel twin):
    // they should be stitched back into a single continuous line.
    const a = way({ featureId: 'a', points: [{ x: 0, y: 0 }, { x: 0, y: 50 }] });
    const b = way({ featureId: 'b', points: [{ x: 0, y: 50 }, { x: 0, y: 100 }] });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });

    expect(out).toHaveLength(1);
    expect(out[0].points[0]).toEqual({ x: 0, y: 0 });
    expect(out[0].points[out[0].points.length - 1]).toEqual({ x: 0, y: 100 });
  });

  it('keeps an un-paired end stretch where the median splays apart', () => {
    // a: straight up x=0. b: parallel at x=4 for the lower half, then veers far
    // away (x=40) for the upper half — only the lower half should collapse.
    const a = way({ featureId: 'a', points: [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 100 }] });
    const b = way({
      featureId: 'b',
      points: [{ x: 4, y: 100 }, { x: 40, y: 75 }, { x: 4, y: 50 }, { x: 4, y: 0 }],
    });
    const out = collapseDualCarriageways([a, b], { maxSeparationMm: 10 });
    // Some geometry survives, and a midline stretch near x≈2 exists.
    const pts = out.flatMap((w) => w.points);
    expect(pts.some((p) => Math.abs(p.x - 2) < 1e-6)).toBe(true);
    // The far-flung detour (x=40) is preserved somewhere (not silently dropped).
    expect(pts.some((p) => Math.abs(p.x - 40) < 1e-6)).toBe(true);
  });
});
