import { describe, expect, it } from 'vitest';
import type { PointMm } from '../geo/types';
import { mergeRailCorridors } from './railMerge';

const hline = (y: number, x0: number, x1: number, step = 2): PointMm[] => {
  const pts: PointMm[] = [];
  for (let x = x0; x <= x1; x += step) pts.push({ x, y });
  return pts;
};
const yRange = (line: PointMm[]): [number, number] => [Math.min(...line.map((p) => p.y)), Math.max(...line.map((p) => p.y))];
const xRange = (line: PointMm[]): [number, number] => [Math.min(...line.map((p) => p.x)), Math.max(...line.map((p) => p.x))];

const OPTS = { corridorMm: 4, pxMm: 0.5, spurMm: 2 };

describe('mergeRailCorridors', () => {
  it('returns nothing for no input', () => {
    expect(mergeRailCorridors([], OPTS)).toEqual([]);
  });

  it('passes a single isolated track through as one line', () => {
    const out = mergeRailCorridors([hline(30, 10, 60)], OPTS);
    expect(out).toHaveLength(1);
    const [lo, hi] = yRange(out[0]);
    expect(lo).toBeGreaterThan(28); // stayed at y≈30
    expect(hi).toBeLessThan(32);
    const [x0, x1] = xRange(out[0]);
    expect(x0).toBeLessThan(15); // spans roughly the original extent
    expect(x1).toBeGreaterThan(55);
  });

  it('fuses two close parallel tracks into one centerline between them', () => {
    const out = mergeRailCorridors([hline(30, 10, 60), hline(32, 10, 60)], OPTS);
    expect(out).toHaveLength(1); // two tracks → one corridor
    const [lo, hi] = yRange(out[0]);
    expect(lo).toBeGreaterThan(30); // centerline sits between the two (≈31)
    expect(hi).toBeLessThan(32);
  });

  it('keeps genuinely separate corridors apart', () => {
    const out = mergeRailCorridors([hline(20, 10, 60), hline(40, 10, 60)], OPTS); // 20 mm apart ≫ 4 mm
    expect(out).toHaveLength(2);
  });

  it('fuses a four-track bundle into a single line', () => {
    const out = mergeRailCorridors([hline(30, 10, 60), hline(31.5, 10, 60), hline(33, 10, 60), hline(34.5, 10, 60)], OPTS);
    expect(out).toHaveLength(1);
    const [lo, hi] = yRange(out[0]);
    expect(lo).toBeGreaterThan(31); // centerline near the bundle's middle (≈32.25)
    expect(hi).toBeLessThan(33.5);
  });

  it('keeps a real track terminus when a branch joins near the line end (not a barb)', () => {
    // A branch diverges ~4 mm from the left terminus of the main line. The short
    // terminal arm is real track, not a thinning artefact — it must survive.
    const main = hline(30, 10, 70);
    const branch: PointMm[] = [{ x: 14, y: 30 }, { x: 19, y: 37 }, { x: 25, y: 45 }];
    const out = mergeRailCorridors([main, branch], { corridorMm: 4, pxMm: 0.5, spurMm: 5 });
    const minX = Math.min(...out.flatMap((e) => e.map((p) => p.x)));
    expect(minX).toBeLessThan(11.5); // terminus (~x10) kept, not clipped to the junction (~x14)
  });
});
