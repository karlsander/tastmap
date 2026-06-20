import { describe, expect, it } from 'vitest';
import type { RectMm } from '../geo/types';
import { crossHatchFill, dotFill, filledPolygon, filledRect, hatchFill, rectOutline } from './textures';

const RECT: RectMm = { minX: 0, minY: 0, maxX: 20, maxY: 10 };
const within = (rect: RectMm, x: number, y: number): boolean =>
  x >= rect.minX - 1e-6 && x <= rect.maxX + 1e-6 && y >= rect.minY - 1e-6 && y <= rect.maxY + 1e-6;

describe('hatchFill', () => {
  it('produces stroked lines all contained within the rect', () => {
    const lines = hatchFill(RECT, { spacingMm: 3, angleDeg: 45, widthMm: 0.4 });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.kind).toBe('path');
      expect(line.stroke?.widthMm).toBe(0.4);
      expect(line.points.length).toBeGreaterThanOrEqual(2);
      for (const p of line.points) expect(within(RECT, p.x, p.y)).toBe(true);
    }
  });

  it('draws horizontal lines at angle 0 (constant y per line)', () => {
    const lines = hatchFill(RECT, { spacingMm: 4, angleDeg: 0, widthMm: 0.3 });
    for (const line of lines) {
      const ys = line.points.map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);
    }
  });

  it('returns nothing for non-positive spacing', () => {
    expect(hatchFill(RECT, { spacingMm: 0, widthMm: 0.4 })).toEqual([]);
  });
});

describe('crossHatchFill', () => {
  it('produces strictly more lines than a single hatch direction', () => {
    const opts = { spacingMm: 4, angleDeg: 45, widthMm: 0.4 };
    expect(crossHatchFill(RECT, opts).length).toBeGreaterThan(hatchFill(RECT, opts).length);
  });
});

describe('dotFill', () => {
  it('lays a grid of dots inset by the radius', () => {
    const square: RectMm = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const dots = dotFill(square, { spacingMm: 2.5, radiusMm: 0.5 });
    expect(dots.length).toBe(16); // 4 x 4
    for (const d of dots) {
      expect(d.radiusMm).toBe(0.5);
      expect(d.center.x).toBeGreaterThanOrEqual(0.5 - 1e-6);
      expect(d.center.x).toBeLessThanOrEqual(9.5 + 1e-6);
      expect(d.center.y).toBeGreaterThanOrEqual(0.5 - 1e-6);
      expect(d.center.y).toBeLessThanOrEqual(9.5 + 1e-6);
    }
  });
});

describe('rectOutline', () => {
  it('is a closed 4-corner path at the given width', () => {
    const o = rectOutline(RECT, 0.3);
    expect(o.closed).toBe(true);
    expect(o.stroke?.widthMm).toBe(0.3);
    expect(o.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ]);
  });
});

describe('filledRect / filledPolygon', () => {
  it('filledRect is a closed, filled, unstroked 4-corner path', () => {
    const f = filledRect(RECT);
    expect(f.closed).toBe(true);
    expect(f.fill).toBe(true);
    expect(f.stroke).toBeUndefined();
    expect(f.points).toHaveLength(4);
  });

  it('filledPolygon keeps the given corners as a closed filled path', () => {
    const tri = filledPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ]);
    expect(tri.fill).toBe(true);
    expect(tri.closed).toBe(true);
    expect(tri.points).toHaveLength(3);
  });
});
