import { layoutCells } from './braille/dots';
import { basicTranslator } from './braille/translate';
import { printableRect } from './geo/clip';
import { getPageDimensions, uniformMargins } from './geo/paper';
import type { PointMm, RectMm } from './geo/types';
import { clearTextureAroundLine, clipTextureToPolygon } from './scene/fill';
import { ICON_KINDS, icon } from './scene/icons';
import { arcPoints, beadedPath, ladderPath, parallelPair, segment, wavyFill, wavyPath } from './scene/lines';
import { createPage, type Page } from './scene/layout';
import { crossHatchFill, dotFill, hatchFill, rectOutline } from './scene/textures';
import type { PathPrimitive, Primitive, Scene } from './scene/types';

/**
 * Printable tactile test gallery, three A4 pages, packed with minimal ink text.
 *
 *   Page 1 — LINES: widths, separation, braille, dashes, dot rows, rail line
 *            candidate, thick curves.
 *   Page 2 — MAP: linear styles, hierarchy, annotated junction, crossing /
 *            sidewalk / tram options, point icons.
 *   Page 3 — TEXTURES: kept pattern fills, textured "landmass" shapes (outline
 *            vs raw edge), lines through a texture (with / without clearing),
 *            and cross-hatch "solid" shapes.
 *
 * Print, fuse, feel; feed winners into core/style/vocabulary.ts + defaultStyle.
 * Pure: no network. Always A4 portrait at exact size.
 */

const MARGIN_MM = 8;
const TINY = 2.3;
const SEC = 3.3;
const at = (x: number, y: number): PointMm => ({ x, y });

function newPage(): Page {
  const dim = getPageDimensions('A4', 'portrait');
  return createPage(printableRect(dim, uniformMargins(MARGIN_MM)), dim.widthMm, dim.heightMm);
}

interface Swatch {
  label: string;
  fill: (r: RectMm) => Primitive[];
}

function swatchGrid(p: Page, items: Swatch[], x0: number, y0: number, xMax: number, sw: number, sh: number): number {
  const gapX = 5;
  const gapY = 3;
  const labelH = 2.6;
  let x = x0;
  let y = y0;
  for (const it of items) {
    if (x + sw > xMax + 1e-6) {
      x = x0;
      y += sh + labelH + gapY;
    }
    const r: RectMm = { minX: x, minY: y, maxX: x + sw, maxY: y + sh };
    p.add(rectOutline(r, 0.3));
    p.add(...it.fill(r));
    p.text(it.label, x, y + sh + labelH, TINY);
    x += sw + gapX;
  }
  return y + sh + labelH + gapY;
}

// The six pattern fills kept after print run 1 (others felt indistinct / too soft).
const PATTERNS: Swatch[] = [
  { label: 'x2', fill: (r) => crossHatchFill(r, { spacingMm: 2, angleDeg: 45, widthMm: 0.4 }) },
  { label: 'dots2.5', fill: (r) => dotFill(r, { spacingMm: 2.5, radiusMm: 0.5 }) },
  { label: 'h0/2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 0, widthMm: 0.4 }) },
  { label: 'h45/2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 }) },
  { label: 'h90/2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 90, widthMm: 0.4 }) },
  { label: 'h135/2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 135, widthMm: 0.4 }) },
];

// The validated line vocabulary, drawn through an arbitrary polyline (corner/curve ok).
const LINE_TYPES = ['thin', 'normal', 'thick', 'dashed', 'dotted', 'double'] as const;
function drawLineType(kind: (typeof LINE_TYPES)[number], pts: PointMm[]): Primitive[] {
  switch (kind) {
    case 'thin':
      return [{ kind: 'path', closed: false, points: pts, stroke: { widthMm: 0.3 } }];
    case 'normal':
      return [{ kind: 'path', closed: false, points: pts, stroke: { widthMm: 0.8 } }];
    case 'thick':
      return [{ kind: 'path', closed: false, points: pts, stroke: { widthMm: 2.0 } }];
    case 'dashed':
      return [{ kind: 'path', closed: false, points: pts, stroke: { widthMm: 0.6, dashMm: [3, 1.5] } }];
    case 'dotted':
      return beadedPath(pts, { spacingMm: 3, radiusMm: 0.6 });
    case 'double': {
      const out: Primitive[] = [];
      for (let i = 1; i < pts.length; i++) out.push(...parallelPair(pts[i - 1], pts[i], { gapMm: 1.5, widthMm: 0.5 }));
      return out;
    }
  }
}

function bbox(poly: PointMm[]): RectMm {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** A deterministic irregular blob polygon — a stand-in landmass. */
function blob(cx: number, cy: number, r: number): PointMm[] {
  const ms = [1, 0.82, 1.08, 0.86, 1.12, 0.84, 1.06, 0.92];
  return ms.map((m, i) => {
    const a = (i / ms.length) * 2 * Math.PI;
    return at(cx + r * m * Math.cos(a), cy + r * m * Math.sin(a));
  });
}

function circlePoly(cx: number, cy: number, r: number): PointMm[] {
  return arcPoints(cx, cy, r, 0, 360, 24);
}

// ---------------------------------------------------------------------------
// Page 1 — LINES
// ---------------------------------------------------------------------------
function curvedCornerSample(box: RectMm, widthMm: number): PathPrimitive {
  const bx = box.minX;
  const by = box.minY;
  const bottomY = by + 25;
  const r = 7;
  const a = at(bx + 3, bottomY);
  const arc = arcPoints(bx + 11, bottomY - r, r, 90, 0, 8);
  const c = arc[arc.length - 1];
  const d = at(c.x, by + 9);
  const e = at(bx + 27, by + 9);
  return { kind: 'path', closed: false, points: [a, ...arc, d, e], stroke: { widthMm } };
}

function linesPage(): Scene {
  const p = newPage();
  const A = p.area;
  p.text('1 LINES   width · step · braille · dash · separation · dots · curves', A.minX, A.minY + 3, 3);
  const colL = A.minX;
  const colR = A.minX + 100;
  const len = 80;

  let yl = A.minY + 8;
  p.text('width (mm)', colL, yl, SEC);
  yl += 3.5;
  for (const w of [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.2, 1.5, 2.0]) {
    const h = Math.max(4.5, w + 3);
    const my = yl + h / 2;
    p.add(segment(at(colL, my), at(colL + len, my), w));
    p.text(String(w), colL + len + 3, my + 0.8, TINY);
    yl += h;
  }
  yl += 2;
  p.text('width step', colL, yl, SEC);
  yl += 3.5;
  for (const [a, b] of [[0.4, 0.6], [0.5, 0.7], [0.6, 0.8], [0.8, 1.0]] as [number, number][]) {
    const h = 6;
    const my = yl + h / 2;
    p.add(segment(at(colL, my - 1.1), at(colL + 64, my - 1.1), a), segment(at(colL, my + 1.1), at(colL + 64, my + 1.1), b));
    p.text(`${a}/${b}`, colL + 68, my + 0.8, TINY);
    yl += h;
  }
  yl += 2;
  p.text('braille (Marburg 2.5/6)', colL, yl, SEC);
  yl += 4;
  p.add(...layoutCells(basicTranslator.translate('marburg 12'), at(colL, yl)));
  yl += 9;

  let yr = A.minY + 8;
  p.text('dash (0.6)', colR, yr, SEC);
  yr += 3.5;
  for (const { d, l } of [
    { d: [1.5, 1.5], l: '1.5/1.5' },
    { d: [3, 1.5], l: '3/1.5' },
    { d: [1, 2], l: '1/2' },
    { d: [0.6, 1.2], l: '.6/1.2' },
    { d: [3, 1.5, 0.6, 1.5], l: 'dash-dot' },
  ]) {
    const h = 5;
    const my = yr + h / 2;
    p.add(segment(at(colR, my), at(colR + len, my), 0.6, d));
    p.text(l, colR + len + 3, my + 0.8, TINY);
    yr += h;
  }
  yr += 2;
  p.text('separation 0.5 (gap)', colR, yr, SEC);
  yr += 3.5;
  for (const g of [6, 5, 4, 3, 2.5, 2, 1.5, 1]) {
    const h = Math.max(5, g + 2.5);
    const my = yr + h / 2;
    p.add(segment(at(colR, my - g / 2), at(colR + len, my - g / 2), 0.5), segment(at(colR, my + g / 2), at(colR + len, my + g / 2), 0.5));
    p.text(String(g), colR + len + 3, my + 0.8, TINY);
    yr += h;
  }
  yr += 2;
  p.text('3-line + dots', colR, yr, SEC);
  yr += 3.5;
  for (const g of [3, 2]) {
    const h = 2 * g + 3;
    const my = yr + h / 2;
    for (const o of [-g, 0, g]) p.add(segment(at(colR, my + o), at(colR + len, my + o), 0.5));
    p.text(`3×${g}`, colR + len + 3, my + 0.8, TINY);
    yr += h;
  }
  for (const s of [2, 3, 4]) {
    const h = 5;
    const my = yr + h / 2;
    p.add(...beadedPath([at(colR, my), at(colR + len, my)], { spacingMm: s, radiusMm: 0.6 }));
    p.text(`d${s}`, colR + len + 3, my + 0.8, TINY);
    yr += h;
  }

  // Thick curves.
  let y = Math.max(yl, yr) + 6;
  p.text('thick curves (mm) · curve + corner', A.minX, y, SEC);
  y += 4;
  let cx = A.minX;
  for (const w of [2, 3, 4, 5]) {
    p.add(curvedCornerSample({ minX: cx, minY: y, maxX: cx + 28, maxY: y + 30 }, w));
    p.text(String(w), cx, y + 30 + 2.6, TINY);
    cx += 40;
  }
  return p.scene();
}

// ---------------------------------------------------------------------------
// Page 2 — MAP
// ---------------------------------------------------------------------------

/** A snaking (sinusoidal) centreline from x0 to x1 about vertical centre yc. */
function snake(x0: number, yc: number, x1: number, amplitudeMm: number, waves: number): PointMm[] {
  const n = 24;
  const pts: PointMm[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(at(x0 + (x1 - x0) * t, yc + Math.sin(t * waves * 2 * Math.PI) * amplitudeMm));
  }
  return pts;
}

/** Offset a polyline by `dist` along its per-vertex normal. */
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

/** A ribbon (band) around a centreline: closed polygon for filling + the two edges. */
function ribbon(center: PointMm[], halfWidthMm: number): { poly: PointMm[]; left: PointMm[]; right: PointMm[] } {
  const left = offsetPolyline(center, halfWidthMm);
  const right = offsetPolyline(center, -halfWidthMm);
  return { poly: [...left, ...right.slice().reverse()], left, right };
}

const strokePath = (pts: PointMm[], widthMm: number): PathPrimitive => ({ kind: 'path', closed: false, points: pts, stroke: { widthMm } });

function drawNet(p: Page, ox: number, oy: number, w: number, h: number, casing: boolean): void {
  const major = (a: PointMm, b: PointMm): void => {
    if (casing) p.add(...parallelPair(a, b, { gapMm: 1.6, widthMm: 0.4 }));
    else p.add(segment(a, b, 1.0));
  };
  const minor = (a: PointMm, b: PointMm): void => p.add(segment(a, b, 0.6));
  const path = (a: PointMm, b: PointMm): void => p.add(segment(a, b, 0.4, [1.5, 1.5]));
  major(at(ox, oy + h * 0.5), at(ox + w, oy + h * 0.5));
  major(at(ox + w * 0.5, oy), at(ox + w * 0.5, oy + h));
  minor(at(ox, oy + h * 0.25), at(ox + w, oy + h * 0.25));
  minor(at(ox, oy + h * 0.78), at(ox + w, oy + h * 0.78));
  minor(at(ox + w * 0.25, oy), at(ox + w * 0.25, oy + h));
  minor(at(ox + w * 0.78, oy), at(ox + w * 0.78, oy + h));
  path(at(ox, oy), at(ox + w, oy + h));
}

function drawJunction(p: Page, ox: number, oy: number): void {
  const cx = ox + 40;
  const cy = oy + 48;
  const B = 3;
  const rightEnd = ox + 106;
  const topEnd = oy + 6;
  const botEnd = oy + 80;

  p.add(segment(at(ox, cy - B), at(cx - B, cy - B), 0.5), segment(at(ox, cy + B), at(cx - B, cy + B), 0.5));
  p.add(segment(at(cx + B, cy - B), at(rightEnd, cy - B), 0.5), segment(at(cx + B, cy + B), at(rightEnd, cy + B), 0.5));
  p.add(segment(at(cx - B, topEnd), at(cx - B, cy - B), 0.5), segment(at(cx + B, topEnd), at(cx + B, cy - B), 0.5));
  p.add(segment(at(cx - B, cy + B), at(cx - B, botEnd), 0.5), segment(at(cx + B, cy + B), at(cx + B, botEnd), 0.5));

  const so = B + 2.2;
  for (const s of [-so, so]) {
    p.add(segment(at(ox, cy + s), at(cx - B - 4, cy + s), 0.35));
    p.add(segment(at(cx - B - 4, cy + s - 1), at(cx - B - 4, cy + s + 1), 0.35));
    p.add(segment(at(cx + B + 4, cy + s), at(rightEnd, cy + s), 0.35));
    p.add(segment(at(cx + B + 4, cy + s - 1), at(cx + B + 4, cy + s + 1), 0.35));
  }

  p.add(...ladderPath(at(cx + 22, cy), at(cx + 28, cy), { tieLengthMm: 2 * B, tieSpacingMm: 1.3, widthMm: 0.5 }));
  p.add(...ladderPath(at(cx, cy + B + 3), at(cx, botEnd - 3), { tieLengthMm: 4, tieSpacingMm: 5, widthMm: 0.35, rails: true, railGapMm: 3, railWidthMm: 0.4 }));

  const plat: RectMm = { minX: cx + B + 5, minY: cy + 10, maxX: cx + B + 13, maxY: cy + 30 };
  p.add(rectOutline(plat, 0.5), ...dotFill(plat, { spacingMm: 3, radiusMm: 0.55 }));
  const ay = (plat.minY + plat.maxY) / 2;
  p.add(segment(at(plat.minX - 4, ay - 2), at(plat.minX, ay), 0.5), segment(at(plat.minX - 4, ay + 2), at(plat.minX, ay), 0.5));

  const key = (n: number, x: number, ky: number): void => p.text(String(n), x, ky, 2.4);
  key(1, ox + 14, cy - 4.5);
  key(2, cx - 8, cy - 5);
  key(3, cx + 23, cy - 4.5);
  key(4, ox + 22, cy + so + 3.5);
  key(5, cx + B + 5, cy - so - 0.5);
  key(6, cx + 5, cy + 10);
  key(7, plat.maxX + 1.5, cy + 9);
  key(8, plat.minX - 6, ay - 2.5);
  p.text('1 casing 2 junction 3 crossing 4 walk 5 curb 6 tram 7 stop 8 board', ox, botEnd + 5, 2.1);
}

interface Variation {
  l: string;
  draw: (c: RectMm) => void;
}

function detailRow(p: Page, A: RectMm, y: number, label: string, cellH: number, vars: Variation[]): number {
  p.text(label, A.minX, y, SEC);
  const top = y + 2;
  const gap = 6;
  const cw = (A.maxX - A.minX - gap * (vars.length - 1)) / vars.length;
  vars.forEach((v, i) => {
    const x = A.minX + i * (cw + gap);
    v.draw({ minX: x, minY: top, maxX: x + cw, maxY: top + cellH });
    p.text(v.l, x, top + cellH + 2.6, TINY);
  });
  return top + cellH + 2.6 + 5;
}

function mapPage(): Scene {
  const p = newPage();
  const A = p.area;
  p.text('2 MAP   linear · hierarchy · junction · crossing/sidewalk/tram · patterned paths · rivers', A.minX, A.minY + 3, 3);

  drawJunction(p, A.minX, A.minY + 8);
  const lx = A.minX + 116;
  const ll = 36;
  p.text('linear', lx, A.minY + 8, SEC);
  let ly = A.minY + 12;
  const linRows: { l: string; draw: (x: number, m: number) => void }[] = [
    { l: 'major 2.0', draw: (x, m) => p.add(segment(at(x, m), at(x + ll, m), 2.0)) },
    { l: 'minor 0.8', draw: (x, m) => p.add(segment(at(x, m), at(x + ll, m), 0.8)) },
    { l: 'path dash', draw: (x, m) => p.add(segment(at(x, m), at(x + ll, m), 0.6, [3, 1.5])) },
    { l: 'double road', draw: (x, m) => p.add(...parallelPair(at(x, m), at(x + ll, m), { gapMm: 1.5, widthMm: 0.5 })) },
    { l: 'border dot', draw: (x, m) => p.add(...beadedPath([at(x, m), at(x + ll, m)], { spacingMm: 3, radiusMm: 0.6 })) },
    { l: 'water wavy', draw: (x, m) => p.add(wavyPath(at(x, m), at(x + ll, m), { amplitudeMm: 1, wavelengthMm: 7, widthMm: 0.6 })) },
    { l: 'rail', draw: (x, m) => p.add(segment(at(x, m), at(x + ll, m), 0.8), ...ladderPath(at(x, m), at(x + ll, m), { tieLengthMm: 3, tieSpacingMm: 3, widthMm: 0.5 })) },
  ];
  for (const r of linRows) {
    const m = ly + 3;
    r.draw(lx, m);
    p.text(r.l, lx + ll + 3, m + 0.8, TINY);
    ly += 6.5;
  }

  let y = A.minY + 100;
  p.text('hierarchy   single | casing', A.minX, y, SEC);
  y += 4;
  drawNet(p, A.minX, y, 66, 34, false);
  drawNet(p, A.minX + 92, y, 66, 34, true);
  y += 38;

  const B = 3;
  const roadAcross = (c: RectMm, my: number): void => {
    p.add(segment(at(c.minX, my - B), at(c.maxX, my - B), 0.5), segment(at(c.minX, my + B), at(c.maxX, my + B), 0.5));
  };
  y = detailRow(p, A, y, 'crossing', 14, [
    {
      l: 'zebra',
      draw: (c) => {
        const my = c.minY + 8;
        roadAcross(c, my);
        const mx = (c.minX + c.maxX) / 2;
        p.add(...ladderPath(at(mx - 3, my), at(mx + 3, my), { tieLengthMm: 2 * B, tieSpacingMm: 1.2, widthMm: 0.45 }));
      },
    },
    {
      l: 'dotted',
      draw: (c) => {
        const my = c.minY + 8;
        roadAcross(c, my);
        const mx = (c.minX + c.maxX) / 2;
        for (const dx of [-2, 2]) p.add(...beadedPath([at(mx + dx, my - B), at(mx + dx, my + B)], { spacingMm: 1.6, radiusMm: 0.4 }));
      },
    },
    {
      l: 'double',
      draw: (c) => {
        const my = c.minY + 8;
        roadAcross(c, my);
        const mx = (c.minX + c.maxX) / 2;
        for (const dx of [-1.5, 1.5]) p.add(segment(at(mx + dx, my - B), at(mx + dx, my + B), 0.3));
      },
    },
  ]);

  y = detailRow(p, A, y, 'sidewalk start', 14, [
    {
      l: 'tick',
      draw: (c) => {
        const my = c.minY + 8;
        roadAcross(c, my);
        const sy = my - B - 2.2;
        const sx = (c.minX + c.maxX) / 2;
        p.add(segment(at(sx, sy), at(c.maxX, sy), 0.35), segment(at(sx, sy - 1.2), at(sx, sy + 1.2), 0.35));
      },
    },
    {
      l: 'dot',
      draw: (c) => {
        const my = c.minY + 8;
        roadAcross(c, my);
        const sy = my - B - 2.2;
        const sx = (c.minX + c.maxX) / 2;
        p.add(segment(at(sx, sy), at(c.maxX, sy), 0.35), { kind: 'dot', center: at(sx, sy), radiusMm: 0.8 });
      },
    },
    {
      l: 'gap+tick',
      draw: (c) => {
        const my = c.minY + 8;
        roadAcross(c, my);
        const sy = my - B - 2.2;
        const sx = (c.minX + c.maxX) / 2 + 3;
        p.add(segment(at(sx, sy), at(c.maxX, sy), 0.35), segment(at(sx, sy - 1.2), at(sx, sy + 1.2), 0.35));
      },
    },
  ]);

  const tram = (c: RectMm, entry: (plat: RectMm) => void): void => {
    const tx = c.minX + 9;
    p.add(...ladderPath(at(tx, c.minY + 2), at(tx, c.maxY - 2), { tieLengthMm: 3, tieSpacingMm: 4, widthMm: 0.35, rails: true, railGapMm: 2.5, railWidthMm: 0.35 }));
    const plat: RectMm = { minX: tx + 5, minY: c.minY + 3, maxX: tx + 13, maxY: c.maxY - 3 };
    p.add(...dotFill(plat, { spacingMm: 2.8, radiusMm: 0.55 }));
    entry(plat);
  };
  const tramVariants: Variation[] = [
    {
      l: 'arrow',
      draw: (c) =>
        tram(c, (plat) => {
          p.add(rectOutline(plat, 0.45));
          const ay = (plat.minY + plat.maxY) / 2;
          p.add(segment(at(plat.minX - 4, ay - 2), at(plat.minX, ay), 0.45), segment(at(plat.minX - 4, ay + 2), at(plat.minX, ay), 0.45));
        }),
    },
    {
      l: 'notch',
      draw: (c) =>
        tram(c, (plat) => {
          const ay = (plat.minY + plat.maxY) / 2;
          p.add(segment(at(plat.minX, plat.minY), at(plat.maxX, plat.minY), 0.45));
          p.add(segment(at(plat.minX, plat.maxY), at(plat.maxX, plat.maxY), 0.45));
          p.add(segment(at(plat.maxX, plat.minY), at(plat.maxX, plat.maxY), 0.45));
          p.add(segment(at(plat.minX, plat.minY), at(plat.minX, ay - 2), 0.45), segment(at(plat.minX, ay + 2), at(plat.minX, plat.maxY), 0.45));
        }),
    },
    {
      l: 'dot row',
      draw: (c) =>
        tram(c, (plat) => {
          p.add(rectOutline(plat, 0.45));
          p.add(...beadedPath([at(plat.minX, plat.minY + 2), at(plat.minX, plat.maxY - 2)], { spacingMm: 2, radiusMm: 0.7 }));
        }),
    },
  ];
  y = detailRow(p, A, y, 'tram boarding', 22, tramVariants);
  y += 2;

  // Patterned paths (snaking) — a textured ribbon, with edges and raw.
  p.text('patterned paths (snaking) — edge | raw', A.minX, y, SEC);
  y += 4;
  {
    const bandH = 16;
    const halfW = 3;
    const cellW = 45;
    const cyc = y + bandH / 2;
    const pathVars: { l: string; fill: (r: RectMm) => Primitive[]; edge: boolean }[] = [
      { l: 'dots edge', fill: (r) => dotFill(r, { spacingMm: 2.5, radiusMm: 0.5 }), edge: true },
      { l: 'dots raw', fill: (r) => dotFill(r, { spacingMm: 2.5, radiusMm: 0.5 }), edge: false },
      { l: 'h45 edge', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 }), edge: true },
      { l: 'x2 edge', fill: (r) => crossHatchFill(r, { spacingMm: 2, angleDeg: 45, widthMm: 0.4 }), edge: true },
    ];
    let cx = A.minX;
    for (const v of pathVars) {
      const { poly, left, right } = ribbon(snake(cx + 3, cyc, cx + cellW - 3, 2.2, 1.5), halfW);
      p.add(...texturedPolygon(poly, v.fill));
      if (v.edge) p.add(strokePath(left, 0.4), strokePath(right, 0.4));
      p.text(v.l, cx, y + bandH + 2.6, TINY);
      cx += cellW + 1;
    }
    y += bandH + 2.6 + 4;
  }

  // Rivers as an area (not just a line): different water fills + banks, + a bridge.
  p.text('rivers as area — fill + banks · bridge', A.minX, y, SEC);
  y += 4;
  {
    const bandH = 16;
    const halfW = 4;
    const cellW = 45;
    const cyc = y + bandH / 2;
    const river = (label: string, fill: ((r: RectMm) => Primitive[]) | null, banks: boolean, bridge = false): void => {
      const { poly, left, right } = ribbon(snake(cx + 3, cyc, cx + cellW - 3, 2, bridge ? 1 : 1.2), halfW);
      let body = fill ? texturedPolygon(poly, fill) : [];
      if (bridge) body = clearTextureAroundLine(body, [at(cx + cellW / 2, y), at(cx + cellW / 2, y + bandH)], 1.5);
      p.add(...body);
      if (banks) p.add(strokePath(left, 0.5), strokePath(right, 0.5));
      if (bridge) p.add(segment(at(cx + cellW / 2, y), at(cx + cellW / 2, y + bandH), 0.8));
      p.text(label, cx, y + bandH + 2.6, TINY);
      cx += cellW + 1;
    };
    let cx = A.minX;
    river('h0 + banks', (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 0, widthMm: 0.4 }), true);
    river('dots + banks', (r) => dotFill(r, { spacingMm: 2.5, radiusMm: 0.5 }), true);
    river('wavy + banks', (r) => wavyFill(r, { amplitudeMm: 0.7, wavelengthMm: 6, rowGapMm: 2.5, widthMm: 0.4 }), true);
    river('bridge (road over)', (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 0, widthMm: 0.4 }), true, true);
  }
  return p.scene();
}

// ---------------------------------------------------------------------------
// Page 3 — TEXTURES
// ---------------------------------------------------------------------------
function texturedPolygon(poly: PointMm[], fill: (r: RectMm) => Primitive[]): Primitive[] {
  return clipTextureToPolygon(fill(bbox(poly)), poly);
}

function texturesPage(): Scene {
  const p = newPage();
  const A = p.area;
  p.text('3 TEXTURES   fills · landmass · lines through · solids + icons · rail · braille', A.minX, A.minY + 3, 3);
  let y = A.minY + 9;

  // 1. Kept pattern fills (reference swatches).
  p.text('pattern fills (kept)', A.minX, y, SEC);
  y += 4;
  y = swatchGrid(p, PATTERNS, A.minX, y, A.maxX, 26, 13);
  y += 1;

  // 2. Landmass shapes — outline vs raw edge.
  p.text('landmass — outline | raw edge', A.minX, y, SEC);
  y += 4;
  {
    const r = 11;
    const cy = y + r;
    let cx = A.minX + r;
    for (const t of [PATTERNS[0], PATTERNS[1], PATTERNS[3]]) {
      const outlined = blob(cx, cy, r);
      p.add(...texturedPolygon(outlined, t.fill));
      p.add({ kind: 'path', closed: true, points: outlined, stroke: { widthMm: 0.5 } });
      p.text(`${t.label} +out`, cx - r, cy + r + 3, TINY);
      cx += 2 * r + 6;
      const raw = blob(cx, cy, r);
      p.add(...texturedPolygon(raw, t.fill));
      p.text(`${t.label} raw`, cx - r, cy + r + 3, TINY);
      cx += 2 * r + 8;
    }
    y = cy + r + 6;
  }

  // 3. Lines through textures — 2 mm clearing — over h45, x2 and dots2.5.
  const CLEAR = 2;
  const throughTex: { l: string; fn: (r: RectMm) => Primitive[] }[] = [
    { l: 'h45', fn: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 }) },
    { l: 'x2', fn: (r) => crossHatchFill(r, { spacingMm: 2, angleDeg: 45, widthMm: 0.4 }) },
    { l: 'dots2.5', fn: (r) => dotFill(r, { spacingMm: 2.5, radiusMm: 0.5 }) },
  ];
  p.text(`lines through texture — ${CLEAR} mm clearing`, A.minX, y, SEC);
  y += 4;
  const gut = 14;
  const cw = 30;
  const ch = 20;
  LINE_TYPES.forEach((lt, li) => p.text(lt, A.minX + gut + li * cw, y, TINY - 0.3));
  y += 3;
  throughTex.forEach((tx) => {
    p.text(tx.l, A.minX, y + ch / 2, TINY);
    LINE_TYPES.forEach((lt, li) => {
      const cx = A.minX + gut + li * cw;
      const cell: RectMm = { minX: cx, minY: y, maxX: cx + cw - 2, maxY: y + ch };
      const linePts = [at(cx + cw * 0.45, y), at(cx + cw * 0.45, y + ch * 0.55), at(cx + cw * 0.8, y + ch)];
      p.add(...clearTextureAroundLine(tx.fn(cell), linePts, CLEAR));
      p.add(...drawLineType(lt, linePts));
    });
    y += ch + 2;
  });
  y += 3;

  // 4. Cross-hatch "solids" (2×2, left) next to the icon set (3 strengths, right).
  p.text('"solid" via cross-hatch (x1 / x0.5)        icons · 3 strengths (0.4 / 0.8 / 1.4)', A.minX, y, SEC);
  y += 4;
  {
    const r = 10;
    const xhatch = (sp: number) => (rr: RectMm): Primitive[] => crossHatchFill(rr, { spacingMm: sp, angleDeg: 45, widthMm: 0.4 });
    const triPoly = (cx: number, cy: number): PointMm[] => [at(cx, cy - r), at(cx + r * 0.9, cy + r * 0.6), at(cx - r * 0.9, cy + r * 0.6)];
    const solids: { label: string; build: (cx: number, cy: number) => Primitive[] }[] = [
      { label: 'circ x1', build: (cx, cy) => withOutline(circlePoly(cx, cy, r), xhatch(1)) },
      { label: 'circ x0.5', build: (cx, cy) => withOutline(circlePoly(cx, cy, r), xhatch(0.5)) },
      { label: 'tri x1', build: (cx, cy) => withOutline(triPoly(cx, cy), xhatch(1)) },
      { label: 'tri x0.5', build: (cx, cy) => withOutline(triPoly(cx, cy), xhatch(0.5)) },
    ];
    const col0 = A.minX + r;
    const col1 = A.minX + 3 * r + 8;
    const positions = [[col0, y + r], [col1, y + r], [col0, y + 3 * r + 10], [col1, y + 3 * r + 10]];
    solids.forEach((s, i) => {
      const [cx, cy] = positions[i];
      p.add(...s.build(cx, cy));
      p.text(s.label, cx - r, cy + r + 2.6, TINY);
    });

    const gx0 = A.minX + 62;
    const colW = (A.maxX - gx0) / ICON_KINDS.length;
    const iconSize = 10;
    const gTop = y;
    ICON_KINDS.forEach((kind, ci) => {
      const colCx = gx0 + ci * colW + colW / 2;
      p.text(kind.slice(0, 6), gx0 + ci * colW, gTop, TINY - 0.4);
      [0.4, 0.8, 1.4].forEach((sMm, ri) => {
        p.add(...icon(kind, at(colCx, gTop + 4 + ri * 10.5 + iconSize / 2), iconSize, sMm));
      });
    });
    y += 4 * r + 17;
  }

  // 5. Rail line candidate (moved from page 1), at the bottom.
  p.text('rail line (candidate 6th type)', A.minX, y, SEC);
  y += 4;
  const railLen = 80;
  const rail = (l: string, draw: (m: number) => void): void => {
    const h = 8;
    const my = y + h / 2;
    draw(my);
    p.text(l, A.minX + railLen + 4, my + 0.8, TINY);
    y += h;
  };
  rail('centre 0.8 + ties 0.4 @2', (m) => {
    p.add(segment(at(A.minX, m), at(A.minX + railLen, m), 0.8));
    p.add(...ladderPath(at(A.minX, m), at(A.minX + railLen, m), { tieLengthMm: 3, tieSpacingMm: 2, widthMm: 0.4 }));
  });
  rail('centre 0.8 + ties 1.0 @5', (m) => {
    p.add(segment(at(A.minX, m), at(A.minX + railLen, m), 0.8));
    p.add(...ladderPath(at(A.minX, m), at(A.minX + railLen, m), { tieLengthMm: 4, tieSpacingMm: 5, widthMm: 1.0 }));
  });
  rail('ties only 0.8, 3mm @3', (m) => {
    p.add(...ladderPath(at(A.minX, m), at(A.minX + railLen, m), { tieLengthMm: 3, tieSpacingMm: 3, widthMm: 0.8 }));
  });

  // Braille dot size — Marburg spacing kept; smaller dots may swell pointier.
  y += 5;
  p.text('braille dot size (Marburg 2.5 / 6 spacing kept)', A.minX, y, SEC);
  y += 4;
  for (const [dia, lbl] of [[1.5, '1.5 std'], [1.3, '1.3'], [1.1, '1.1']] as [number, string][]) {
    p.add(...layoutCells(basicTranslator.translate('marburg 123'), at(A.minX, y), dia));
    p.text(lbl, A.minX + 82, y + 2.5, TINY);
    y += 9;
  }
  return p.scene();
}

function withOutline(poly: PointMm[], fill: (r: RectMm) => Primitive[]): Primitive[] {
  return [...clipTextureToPolygon(fill(bbox(poly)), poly), { kind: 'path', closed: true, points: poly, stroke: { widthMm: 0.4 } }];
}

/** The 3-page tactile test gallery, in print order. */
export function buildTestSheets(): Scene[] {
  return [linesPage(), mapPage(), texturesPage()];
}
