import { describe, expect, it } from 'vitest';
import { ICON_KINDS, icon } from './icons';

describe('icon', () => {
  it('draws every kind with primitives inside its size box', () => {
    const center = { x: 50, y: 50 };
    const size = 10;
    for (const kind of ICON_KINDS) {
      const prims = icon(kind, center, size, 0.8);
      expect(prims.length, kind).toBeGreaterThan(0);
      // Allow a little slack for stroke width / round caps.
      const lo = center.x - size;
      const hi = center.x + size;
      for (const p of prims) {
        const pts = p.kind === 'path' ? p.points : p.kind === 'dot' ? [p.center] : [p.origin];
        for (const pt of pts) {
          expect(pt.x).toBeGreaterThanOrEqual(lo);
          expect(pt.x).toBeLessThanOrEqual(hi);
          expect(pt.y).toBeGreaterThanOrEqual(center.y - size);
          expect(pt.y).toBeLessThanOrEqual(center.y + size);
        }
      }
    }
  });

  it('applies the requested stroke width to stroked parts', () => {
    const prims = icon('home', { x: 0, y: 0 }, 10, 1.4);
    const strokes = prims.filter((p) => p.kind === 'path' && p.stroke).map((p) => (p as { stroke: { widthMm: number } }).stroke.widthMm);
    expect(strokes.every((w) => w === 1.4)).toBe(true);
  });
});
