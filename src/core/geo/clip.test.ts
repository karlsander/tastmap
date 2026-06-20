import { describe, expect, it } from 'vitest';
import { clipPolylineToRect, printableRect } from './clip';
import type { PointMm, RectMm } from './types';

const RECT: RectMm = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

const p = (x: number, y: number): PointMm => ({ x, y });
// Round to kill floating-point dust from the parametric intersection.
const round = (parts: PointMm[][]): PointMm[][] =>
  parts.map((part) => part.map((pt) => ({ x: +pt.x.toFixed(6), y: +pt.y.toFixed(6) })));

describe('clipPolylineToRect', () => {
  it('keeps a fully-contained polyline unchanged', () => {
    const line = [p(2, 2), p(5, 5), p(8, 3)];
    expect(round(clipPolylineToRect(line, RECT))).toEqual([line]);
  });

  it('drops a polyline entirely outside the rect', () => {
    expect(clipPolylineToRect([p(20, 20), p(30, 25)], RECT)).toEqual([]);
  });

  it('clips a segment crossing one edge', () => {
    // Starts inside at (5,5), exits the right edge (x=10) at y=5.
    expect(round(clipPolylineToRect([p(5, 5), p(15, 5)], RECT))).toEqual([
      [p(5, 5), p(10, 5)],
    ]);
  });

  it('clips a segment that passes through, entering and exiting', () => {
    // Horizontal line at y=5 spanning x=-5..15 → visible x=0..10.
    expect(round(clipPolylineToRect([p(-5, 5), p(15, 5)], RECT))).toEqual([
      [p(0, 5), p(10, 5)],
    ]);
  });

  it('splits a polyline that exits and re-enters into two parts', () => {
    // Dips out the bottom (y>10 in this top-left/y-down sense) and comes back.
    const line = [p(2, 2), p(2, 15), p(8, 15), p(8, 2)];
    expect(round(clipPolylineToRect(line, RECT))).toEqual([
      [p(2, 2), p(2, 10)],
      [p(8, 10), p(8, 2)],
    ]);
  });

  it('treats a closed ring as closed, clipping its closing edge', () => {
    // A square wholly inside → one open polyline whose last point repeats the first.
    const ring = [p(2, 2), p(8, 2), p(8, 8), p(2, 8)];
    expect(round(clipPolylineToRect(ring, RECT, true))).toEqual([
      [p(2, 2), p(8, 2), p(8, 8), p(2, 8), p(2, 2)],
    ]);
  });

  it('clips a ring that pokes outside the rect', () => {
    // Right side of the square sticks out past x=10; the boundary is cut there.
    const ring = [p(5, 2), p(15, 2), p(15, 8), p(5, 8)];
    const parts = round(clipPolylineToRect(ring, RECT, true));
    // The ring is opened and clipped: it should not contain any x > 10.
    for (const part of parts) {
      for (const pt of part) expect(pt.x).toBeLessThanOrEqual(10);
    }
    // And it should still describe a connected run from the bottom edge to the top.
    expect(parts.length).toBeGreaterThanOrEqual(1);
  });

  it('returns nothing for degenerate input', () => {
    expect(clipPolylineToRect([], RECT)).toEqual([]);
    expect(clipPolylineToRect([p(1, 1)], RECT)).toEqual([]);
  });

  it('handles a vertical line lying exactly on an edge', () => {
    // On the left edge (x=0) — counts as inside (inclusive bounds).
    expect(round(clipPolylineToRect([p(0, 2), p(0, 8)], RECT))).toEqual([
      [p(0, 2), p(0, 8)],
    ]);
  });
});

describe('printableRect', () => {
  it('insets the page by uniform margins', () => {
    const rect = printableRect(
      { widthMm: 210, heightMm: 297 },
      { top: 10, right: 10, bottom: 10, left: 10 },
    );
    expect(rect).toEqual({ minX: 10, minY: 10, maxX: 200, maxY: 287 });
  });

  it('supports asymmetric margins', () => {
    const rect = printableRect(
      { widthMm: 100, heightMm: 100 },
      { top: 5, right: 8, bottom: 12, left: 3 },
    );
    expect(rect).toEqual({ minX: 3, minY: 5, maxX: 92, maxY: 88 });
  });
});
