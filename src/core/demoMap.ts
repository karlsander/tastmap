import { printableRect } from './geo/clip';
import { getPageDimensions, uniformMargins } from './geo/paper';
import type { PaperSize, PointMm, RectMm } from './geo/types';
import { clipTextureToPolygon } from './scene/fill';
import { icon, type IconKind } from './scene/icons';
import { beadedPath, ladderPath, parallelPair, segment } from './scene/lines';
import { createPage, type Page } from './scene/layout';
import { crossHatchFill, dotFill, hatchFill } from './scene/textures';
import type { PathPrimitive, Primitive, Scene } from './scene/types';

/**
 * A hand-composed but realistic-looking town map that exercises the whole
 * validated tactile vocabulary together on one page: every line type, every area
 * fill, the rail line, and a few point icons. No braille (by request) — an ink
 * key sits at the bottom (use ghost-text mode to drop it for fusing).
 *
 * Synthetic geometry (no network) so all feature types are guaranteed present.
 */

const MARGIN_MM = 10;
const at = (x: number, y: number): PointMm => ({ x, y });

function bbox(poly: PointMm[]): RectMm {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Deterministic irregular blob polygon for organic areas. */
function blob(cx: number, cy: number, rx: number, ry: number, phase = 0): PointMm[] {
  const ms = [1, 0.84, 1.1, 0.9, 1.07, 0.86, 1.05, 0.93];
  return ms.map((m, i) => {
    const a = phase + (i / ms.length) * 2 * Math.PI;
    return at(cx + rx * m * Math.cos(a), cy + ry * m * Math.sin(a));
  });
}

/** Per-vertex normal offset of a polyline (for a river band). */
function offsetPolyline(pts: PointMm[], dist: number): PointMm[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return at(p.x + (-dy / len) * dist, p.y + (dx / len) * dist);
  });
}

function path(points: PointMm[], widthMm: number, dashMm?: number[]): PathPrimitive {
  return { kind: 'path', closed: false, points, stroke: { widthMm, ...(dashMm ? { dashMm } : {}) } };
}

type AreaFillFn = (r: RectMm) => Primitive[];
const FILL = {
  water: (r: RectMm) => hatchFill(r, { spacingMm: 2.5, angleDeg: 0, widthMm: 0.4 }),
  park: (r: RectMm) => hatchFill(r, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 }),
  forest: (r: RectMm) => dotFill(r, { spacingMm: 2.5, radiusMm: 0.5 }),
  industrial: (r: RectMm) => hatchFill(r, { spacingMm: 2.5, angleDeg: 135, widthMm: 0.4 }),
  wetland: (r: RectMm) => hatchFill(r, { spacingMm: 2.5, angleDeg: 90, widthMm: 0.4 }),
  built: (r: RectMm) => crossHatchFill(r, { spacingMm: 2, angleDeg: 45, widthMm: 0.4 }),
} satisfies Record<string, AreaFillFn>;

export function buildDemoMap(paper: PaperSize = 'A4'): Scene {
  const dim = getPageDimensions(paper, 'portrait');
  const p = createPage(printableRect(dim, uniformMargins(MARGIN_MM)), dim.widthMm, dim.heightMm);
  const A = p.area;

  const area = (poly: PointMm[], fill: AreaFillFn, outline = true): void => {
    p.add(...clipTextureToPolygon(fill(bbox(poly)), poly));
    if (outline) p.add({ kind: 'path', closed: true, points: poly, stroke: { widthMm: 0.4 } });
  };
  const railLine = (pts: PointMm[]): void => {
    p.add(path(pts, 0.8));
    for (let i = 1; i < pts.length; i++) p.add(...ladderPath(pts[i - 1], pts[i], { tieLengthMm: 3, tieSpacingMm: 4, widthMm: 0.5 }));
  };
  const doubleRoad = (pts: PointMm[]): void => {
    for (let i = 1; i < pts.length; i++) p.add(...parallelPair(pts[i - 1], pts[i], { gapMm: 1.5, widthMm: 0.5 }));
  };

  // --- Areas (drawn first, lines on top) ---
  // River: a banked band of water from top-left to bottom-right.
  const riverCentre = [at(A.minX, 48), at(60, 72), at(95, 108), at(128, 150), at(165, 200), at(A.maxX, 240)];
  const riverBand = [...offsetPolyline(riverCentre, 5), ...offsetPolyline(riverCentre, -5).reverse()];
  area(riverBand, FILL.water);

  area(blob(42, 38, 24, 18, 0.3), FILL.forest); // forest, top-left
  area(blob(58, 150, 22, 18, 0.6), FILL.park); // park, centre-left
  area(blob(44, 210, 22, 16, 0.2), FILL.industrial); // industrial, bottom-left
  area(blob(150, 60, 14, 11, 0.5), FILL.wetland); // wetland by the river

  // Built-up blocks (small footprints, cross-hatch).
  for (const [bx, by, bw, bh] of [
    [132, 96, 14, 10],
    [150, 100, 12, 12],
    [134, 112, 10, 9],
    [150, 118, 13, 8],
    [168, 104, 11, 11],
  ] as [number, number, number, number][]) {
    area(
      [at(bx, by), at(bx + bw, by), at(bx + bw, by + bh), at(bx, by + bh)],
      FILL.built,
    );
  }

  // --- Roads ---
  p.add(path([at(A.minX, 88), at(70, 84), at(120, 92), at(A.maxX, 86)], 2.0)); // motorway (thick)
  doubleRoad([at(100, A.minY), at(104, 90), at(112, 150), at(120, 248)]); // high street (double)
  // residential streets (normal 0.8)
  for (const r of [
    [at(40, 90), at(46, 248)],
    [at(150, 92), at(158, 248)],
    [at(A.minX, 130), at(200, 138)],
    [at(A.minX, 180), at(200, 188)],
    [at(70, 84), at(74, 130)],
  ] as PointMm[][]) {
    p.add(path(r, 0.8));
  }
  // service lanes (thin 0.3)
  p.add(path([at(40, 130), at(100, 134)], 0.3));
  p.add(path([at(158, 138), at(200, 160)], 0.3));
  // footpaths (dashed) through the park
  p.add(path([at(46, 150), at(58, 150), at(74, 156)], 0.6, [3, 1.5]));

  // --- Railway (rail line) ---
  railLine([at(A.minX, 28), at(80, 36), at(150, 34), at(A.maxX, 42)]);

  // --- Administrative border (dotted), along the bottom ---
  p.add(...beadedPath([at(A.minX, 232), at(60, 238), at(130, 234), at(A.maxX, 240)], { spacingMm: 3, radiusMm: 0.6 }));

  // --- Point icons ---
  const poi: [IconKind, number, number][] = [
    ['station', 78, 36],
    ['church', 116, 118],
    ['tree', 60, 150],
    ['home', 168, 118],
    ['shop', 134, 134],
  ];
  for (const [kind, x, y] of poi) p.add(...icon(kind, at(x, y), 9, 0.8));

  drawKey(p, A);
  return p.scene();
}

// Bottom ink key (no braille). Dropped in ghost-text mode.
function drawKey(p: Page, A: RectMm): void {
  const top = 252;
  p.add(segment(at(A.minX, top - 2), at(A.maxX, top - 2), 0.3));
  p.text('Demo map — line types, area fills, rail & icons (ink key only, no braille)', A.minX, top + 1.5, 2.8);

  const ll = 13;
  const lineKey: [string, (x: number, y: number) => void][] = [
    ['motorway', (x, y) => p.add(path([at(x, y), at(x + ll, y)], 2.0))],
    ['main (double)', (x, y) => p.add(...parallelPair(at(x, y), at(x + ll, y), { gapMm: 1.5, widthMm: 0.5 }))],
    ['street', (x, y) => p.add(path([at(x, y), at(x + ll, y)], 0.8))],
    ['service', (x, y) => p.add(path([at(x, y), at(x + ll, y)], 0.3))],
    ['path', (x, y) => p.add(path([at(x, y), at(x + ll, y)], 0.6, [3, 1.5]))],
    ['border', (x, y) => p.add(...beadedPath([at(x, y), at(x + ll, y)], { spacingMm: 3, radiusMm: 0.6 }))],
    ['railway', (x, y) => { p.add(path([at(x, y), at(x + ll, y)], 0.8)); p.add(...ladderPath(at(x, y), at(x + ll, y), { tieLengthMm: 3, tieSpacingMm: 3, widthMm: 0.5 })); }],
  ];
  lineKey.forEach(([label, draw], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = A.minX + col * 47;
    const y = top + 7 + row * 6;
    draw(x, y);
    p.text(label, x + ll + 2, y + 0.9, 2.3);
  });

  const areaKey: [string, AreaFillFn][] = [
    ['water', FILL.water],
    ['park', FILL.park],
    ['forest', FILL.forest],
    ['industr.', FILL.industrial],
    ['wetland', FILL.wetland],
    ['built-up', FILL.built],
  ];
  const sy = top + 21;
  areaKey.forEach(([label, fill], i) => {
    const x = A.minX + i * 31;
    const r: RectMm = { minX: x, minY: sy, maxX: x + 10, maxY: sy + 8 };
    p.add({ kind: 'path', closed: true, points: [at(r.minX, r.minY), at(r.maxX, r.minY), at(r.maxX, r.maxY), at(r.minX, r.maxY)], stroke: { widthMm: 0.3 } });
    p.add(...clipTextureToPolygon(fill(r), [at(r.minX, r.minY), at(r.maxX, r.minY), at(r.maxX, r.maxY), at(r.minX, r.maxY)]));
    p.text(label, x, sy + 8 + 2.4, 2.3);
  });
}
