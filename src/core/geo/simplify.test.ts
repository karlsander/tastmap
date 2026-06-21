import { describe, expect, it } from 'vitest';
import { simplify } from './simplify';
import type { PointMm } from './types';

const p = (x: number, y: number): PointMm => ({ x, y });

describe('simplify', () => {
  it('drops near-collinear points within tolerance', () => {
    // A nearly straight line with a 0.1mm bump in the middle.
    const line = [p(0, 0), p(5, 0.1), p(10, 0)];
    expect(simplify(line, 0.3)).toEqual([p(0, 0), p(10, 0)]);
  });

  it('keeps points that deviate more than the tolerance', () => {
    const line = [p(0, 0), p(5, 2), p(10, 0)]; // 2mm peak
    expect(simplify(line, 0.3)).toEqual(line);
  });

  it('preserves endpoints and overall shape of a zigzag', () => {
    const zig = [p(0, 0), p(2, 3), p(4, 0), p(6, 3), p(8, 0)];
    const out = simplify(zig, 0.3);
    expect(out[0]).toEqual(p(0, 0));
    expect(out[out.length - 1]).toEqual(p(8, 0));
    expect(out.length).toBe(5); // all peaks exceed tolerance
  });

  it('is a no-op for <=2 points or non-positive tolerance', () => {
    expect(simplify([p(0, 0), p(1, 1)], 0.3)).toEqual([p(0, 0), p(1, 1)]);
    const line = [p(0, 0), p(5, 0.1), p(10, 0)];
    expect(simplify(line, 0)).toEqual(line);
  });
});
