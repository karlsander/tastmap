import { layoutCells } from './braille/dots';
import { basicTranslator } from './braille/translate';
import { printableRect } from './geo/clip';
import { getPageDimensions, uniformMargins } from './geo/paper';
import type { PointMm, RectMm } from './geo/types';
import { createPage, type Page } from './scene/layout';
import { beadedPath, ladderPath, parallelPair, scatterFill, segment, wavyFill, wavyPath } from './scene/lines';
import { crossHatchFill, dotFill, hatchFill, rectOutline } from './scene/textures';
import type { Primitive, Scene } from './scene/types';

/**
 * A compact, printable tactile test gallery. Swell paper is expensive, so every
 * candidate (line widths, separations, area textures, water/park/border/rail
 * styles, and intersection/crossing/tram/sidewalk detail) is packed onto just
 * three A4 pages with the *bare minimum* of ink text — only terse codes to
 * orient by touch (the labels swell too, so less ink = more usable surface).
 *
 * Print, fuse, feel; then feed the winners into core/style/defaultStyle.ts and
 * the symbology built from core/scene/{lines,textures}.
 *
 * Pure: no network. Always A4 portrait at exact size.
 */

const MARGIN_MM = 8;
const TINY = 2.3; // sample label
const SEC = 3.3; // section header
const at = (x: number, y: number): PointMm => ({ x, y });

function newPage(): Page {
  const dim = getPageDimensions('A4', 'portrait');
  return createPage(printableRect(dim, uniformMargins(MARGIN_MM)), dim.widthMm, dim.heightMm);
}

interface Swatch {
  label: string;
  fill: (r: RectMm) => Primitive[];
}

/** Lay swatches left-to-right, wrapping, with a terse label under each. */
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

function half(rect: RectMm, side: 'L' | 'R', fn: (r: RectMm) => Primitive[]): Primitive[] {
  const midX = (rect.minX + rect.maxX) / 2;
  return fn(side === 'L' ? { ...rect, maxX: midX } : { ...rect, minX: midX });
}

// ---------------------------------------------------------------------------
// Page 1 — LINES: widths, Δwidth, braille, dashes, separation, dot rows
// ---------------------------------------------------------------------------
function linesPage(): Scene {
  const p = newPage();
  const A = p.area;
  p.text('1 LINES   width · step · braille · dash · separation · dots', A.minX, A.minY + 3, 3);
  const colL = A.minX;
  const colR = A.minX + 100;
  const len = 44;

  // Left column.
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
    p.add(segment(at(colL, my - 1.1), at(colL + 24, my - 1.1), a), segment(at(colL, my + 1.1), at(colL + 24, my + 1.1), b));
    p.text(`${a}/${b}`, colL + 28, my + 0.8, TINY);
    yl += h;
  }
  yl += 2;
  p.text('braille (Marburg 2.5/6)', colL, yl, SEC);
  yl += 4;
  p.add(...layoutCells(basicTranslator.translate('marburg 12'), at(colL, yl)));

  // Right column.
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
  return p.scene();
}

// ---------------------------------------------------------------------------
// Page 2 — AREAS textures/water/park/contrast, LINEAR styles, hierarchy
// ---------------------------------------------------------------------------
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

function areasPage(): Scene {
  const p = newPage();
  const A = p.area;
  p.text('2 AREAS   texture · water · park · contrast    LINEAR styles    hierarchy', A.minX, A.minY + 3, 3);
  let y = A.minY + 8;

  const tex: Swatch[] = [
    { label: 'h45/1.5', fill: (r) => hatchFill(r, { spacingMm: 1.5, angleDeg: 45, widthMm: 0.4 }) },
    { label: 'h45/2', fill: (r) => hatchFill(r, { spacingMm: 2, angleDeg: 45, widthMm: 0.4 }) },
    { label: 'h45/2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 }) },
    { label: 'h45/3', fill: (r) => hatchFill(r, { spacingMm: 3, angleDeg: 45, widthMm: 0.4 }) },
    { label: 'h0/2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 0, widthMm: 0.4 }) },
    { label: 'h90/2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 90, widthMm: 0.4 }) },
    { label: 'x2', fill: (r) => crossHatchFill(r, { spacingMm: 2, angleDeg: 45, widthMm: 0.4 }) },
    { label: 'x3', fill: (r) => crossHatchFill(r, { spacingMm: 3, angleDeg: 45, widthMm: 0.4 }) },
    { label: 'd2.5/.5', fill: (r) => dotFill(r, { spacingMm: 2.5, radiusMm: 0.5 }) },
    { label: 'd3/.6', fill: (r) => dotFill(r, { spacingMm: 3, radiusMm: 0.6 }) },
    { label: 'd4/.8', fill: (r) => dotFill(r, { spacingMm: 4, radiusMm: 0.8 }) },
    { label: 'd3/.4', fill: (r) => dotFill(r, { spacingMm: 3, radiusMm: 0.4 }) },
    { label: '~water', fill: (r) => wavyFill(r, { amplitudeMm: 0.8, wavelengthMm: 6, rowGapMm: 3, widthMm: 0.4 }) },
    { label: '~wide', fill: (r) => wavyFill(r, { amplitudeMm: 0.6, wavelengthMm: 9, rowGapMm: 4, widthMm: 0.45 }) },
    { label: 'park.', fill: (r) => scatterFill(r, { spacingMm: 4, radiusMm: 0.6, jitterMm: 1 }) },
    { label: 'park#', fill: (r) => hatchFill(r, { spacingMm: 3.5, angleDeg: 60, widthMm: 0.4 }) },
    {
      label: 'h|d',
      fill: (r) => [
        ...half(r, 'L', (rr) => hatchFill(rr, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 })),
        ...half(r, 'R', (rr) => dotFill(rr, { spacingMm: 3, radiusMm: 0.6 })),
      ],
    },
    {
      label: 'fine|coarse',
      fill: (r) => [
        ...half(r, 'L', (rr) => hatchFill(rr, { spacingMm: 1.5, angleDeg: 45, widthMm: 0.4 })),
        ...half(r, 'R', (rr) => hatchFill(rr, { spacingMm: 3.5, angleDeg: 45, widthMm: 0.4 })),
      ],
    },
  ];
  y = swatchGrid(p, tex, A.minX, y, A.maxX, 30, 13);
  y += 2;

  // Linear styles in two columns.
  p.text('linear', A.minX, y, SEC);
  y += 4;
  const ll = 40;
  const linRows: { l: string; draw: (x: number, m: number) => void }[] = [
    { l: 'major 1.0', draw: (x, m) => p.add(segment(at(x, m), at(x + ll, m), 1.0)) },
    { l: 'minor 0.6', draw: (x, m) => p.add(segment(at(x, m), at(x + ll, m), 0.6)) },
    { l: 'path d.4', draw: (x, m) => p.add(segment(at(x, m), at(x + ll, m), 0.4, [1.5, 1.5])) },
    { l: 'casing', draw: (x, m) => p.add(...parallelPair(at(x, m), at(x + ll, m), { gapMm: 2, widthMm: 0.4 })) },
    { l: 'border .-', draw: (x, m) => p.add(segment(at(x, m), at(x + ll, m), 0.6, [3, 1.5, 0.6, 1.5])) },
    { l: 'border bead', draw: (x, m) => p.add(...beadedPath([at(x, m), at(x + ll, m)], { spacingMm: 3, radiusMm: 0.7 })) },
    { l: 'water 1.2', draw: (x, m) => p.add(segment(at(x, m), at(x + ll, m), 1.2)) },
    { l: 'water wavy', draw: (x, m) => p.add(wavyPath(at(x, m), at(x + ll, m), { amplitudeMm: 1, wavelengthMm: 7, widthMm: 0.6 })) },
    { l: 'water banks', draw: (x, m) => p.add(...parallelPair(at(x, m), at(x + ll, m), { gapMm: 2.5, widthMm: 0.4 })) },
    { l: 'rail ties', draw: (x, m) => p.add(...ladderPath(at(x, m), at(x + ll, m), { tieLengthMm: 3, tieSpacingMm: 3, widthMm: 0.4 })) },
    { l: 'rail+ties', draw: (x, m) => p.add(...ladderPath(at(x, m), at(x + ll, m), { tieLengthMm: 4, tieSpacingMm: 5, widthMm: 0.35, rails: true, railGapMm: 3, railWidthMm: 0.4 })) },
  ];
  const colB = A.minX + 100;
  const rowsPerCol = Math.ceil(linRows.length / 2);
  const linTop = y;
  linRows.forEach((r, i) => {
    const col = i < rowsPerCol ? A.minX : colB;
    const idx = i < rowsPerCol ? i : i - rowsPerCol;
    const m = linTop + idx * 7.5 + 3.5;
    r.draw(col, m);
    p.text(r.l, col + ll + 3, m + 0.8, TINY);
  });
  y = linTop + rowsPerCol * 7.5 + 3;

  // Hierarchy: single line vs casing, side by side.
  p.text('hierarchy   single | casing', A.minX, y, SEC);
  y += 4;
  drawNet(p, A.minX, y, 70, 52, false);
  drawNet(p, A.minX + 95, y, 70, 52, true);
  return p.scene();
}

// ---------------------------------------------------------------------------
// Page 3 — DETAIL: annotated junction + crossing/sidewalk/tram options
// ---------------------------------------------------------------------------
function drawJunction(p: Page, A: RectMm): void {
  const cx = A.minX + 44;
  const cy = A.minY + 62;
  const B = 3;
  const rightEnd = A.minX + 112;
  const topEnd = A.minY + 14;
  const botEnd = cy + 70;

  // Casings, junction left open.
  p.add(segment(at(A.minX, cy - B), at(cx - B, cy - B), 0.5), segment(at(A.minX, cy + B), at(cx - B, cy + B), 0.5));
  p.add(segment(at(cx + B, cy - B), at(rightEnd, cy - B), 0.5), segment(at(cx + B, cy + B), at(rightEnd, cy + B), 0.5));
  p.add(segment(at(cx - B, topEnd), at(cx - B, cy - B), 0.5), segment(at(cx + B, topEnd), at(cx + B, cy - B), 0.5));
  p.add(segment(at(cx - B, cy + B), at(cx - B, botEnd), 0.5), segment(at(cx + B, cy + B), at(cx + B, botEnd), 0.5));

  // Sidewalks on horizontal arms with curb ticks.
  const so = B + 2.2;
  for (const s of [-so, so]) {
    p.add(segment(at(A.minX, cy + s), at(cx - B - 4, cy + s), 0.35));
    p.add(segment(at(cx - B - 4, cy + s - 1), at(cx - B - 4, cy + s + 1), 0.35));
    p.add(segment(at(cx + B + 4, cy + s), at(rightEnd, cy + s), 0.35));
    p.add(segment(at(cx + B + 4, cy + s - 1), at(cx + B + 4, cy + s + 1), 0.35));
  }

  // Zebra crossing on the right arm.
  p.add(...ladderPath(at(cx + 24, cy), at(cx + 30, cy), { tieLengthMm: 2 * B, tieSpacingMm: 1.3, widthMm: 0.5 }));

  // Tram tracks down the bottom arm.
  p.add(...ladderPath(at(cx, cy + B + 3), at(cx, botEnd - 4), { tieLengthMm: 4, tieSpacingMm: 5, widthMm: 0.35, rails: true, railGapMm: 3, railWidthMm: 0.4 }));

  // Tram stop platform with boarding arrow.
  const plat: RectMm = { minX: cx + B + 5, minY: cy + 25, maxX: cx + B + 13, maxY: cy + 55 };
  p.add(rectOutline(plat, 0.5), ...dotFill(plat, { spacingMm: 3, radiusMm: 0.55 }));
  const ay = (plat.minY + plat.maxY) / 2;
  p.add(segment(at(plat.minX - 4, ay - 2), at(plat.minX, ay), 0.5), segment(at(plat.minX - 4, ay + 2), at(plat.minX, ay), 0.5));

  // Tiny numbered keys + one terse legend line.
  const key = (n: number, x: number, y: number): void => p.text(String(n), x, y, 2.6);
  key(1, A.minX + 16, cy - 4.5);
  key(2, cx - 8, cy - 5);
  key(3, cx + 25, cy - 4.5);
  key(4, A.minX + 24, cy + so + 3.5);
  key(5, cx + B + 5, cy - so - 0.5);
  key(6, cx + 5, cy + 22);
  key(7, plat.maxX + 1.5, cy + 24);
  key(8, plat.minX - 6, ay - 2.5);
  p.text('1 casing  2 junction  3 crossing  4 walk  5 curb  6 tram  7 stop  8 board', A.minX, botEnd + 6, TINY);
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

function detailPage(): Scene {
  const p = newPage();
  const A = p.area;
  p.text('3 DETAIL   annotated junction · crossing / sidewalk / tram options', A.minX, A.minY + 3, 3);

  drawJunction(p, A);
  let y = A.minY + 150;
  const B = 3;
  const roadAcross = (c: RectMm, my: number): void => {
    p.add(segment(at(c.minX, my - B), at(c.maxX, my - B), 0.5), segment(at(c.minX, my + B), at(c.maxX, my + B), 0.5));
  };

  y = detailRow(p, A, y, 'crossing', 18, [
    {
      l: 'zebra',
      draw: (c) => {
        const my = c.minY + 9;
        roadAcross(c, my);
        const mx = (c.minX + c.maxX) / 2;
        p.add(...ladderPath(at(mx - 3, my), at(mx + 3, my), { tieLengthMm: 2 * B, tieSpacingMm: 1.2, widthMm: 0.45 }));
      },
    },
    {
      l: 'dotted',
      draw: (c) => {
        const my = c.minY + 9;
        roadAcross(c, my);
        const mx = (c.minX + c.maxX) / 2;
        for (const dx of [-2, 2]) p.add(...beadedPath([at(mx + dx, my - B), at(mx + dx, my + B)], { spacingMm: 1.6, radiusMm: 0.4 }));
      },
    },
    {
      l: 'double',
      draw: (c) => {
        const my = c.minY + 9;
        roadAcross(c, my);
        const mx = (c.minX + c.maxX) / 2;
        for (const dx of [-1.5, 1.5]) p.add(segment(at(mx + dx, my - B), at(mx + dx, my + B), 0.3));
      },
    },
  ]);

  y = detailRow(p, A, y, 'sidewalk start', 18, [
    {
      l: 'tick',
      draw: (c) => {
        const my = c.minY + 9;
        roadAcross(c, my);
        const sy = my - B - 2.2;
        const sx = (c.minX + c.maxX) / 2;
        p.add(segment(at(sx, sy), at(c.maxX, sy), 0.35), segment(at(sx, sy - 1.2), at(sx, sy + 1.2), 0.35));
      },
    },
    {
      l: 'dot',
      draw: (c) => {
        const my = c.minY + 9;
        roadAcross(c, my);
        const sy = my - B - 2.2;
        const sx = (c.minX + c.maxX) / 2;
        p.add(segment(at(sx, sy), at(c.maxX, sy), 0.35), { kind: 'dot', center: at(sx, sy), radiusMm: 0.8 });
      },
    },
    {
      l: 'gap+tick',
      draw: (c) => {
        const my = c.minY + 9;
        roadAcross(c, my);
        const sy = my - B - 2.2;
        const sx = (c.minX + c.maxX) / 2 + 3;
        p.add(segment(at(sx, sy), at(c.maxX, sy), 0.35), segment(at(sx, sy - 1.2), at(sx, sy + 1.2), 0.35));
      },
    },
  ]);

  const tram = (c: RectMm, entry: (plat: RectMm, tx: number) => void): void => {
    const tx = c.minX + 9;
    p.add(...ladderPath(at(tx, c.minY + 2), at(tx, c.maxY - 2), { tieLengthMm: 3, tieSpacingMm: 4, widthMm: 0.35, rails: true, railGapMm: 2.5, railWidthMm: 0.35 }));
    const plat: RectMm = { minX: tx + 5, minY: c.minY + 3, maxX: tx + 13, maxY: c.maxY - 3 };
    p.add(...dotFill(plat, { spacingMm: 2.8, radiusMm: 0.55 }));
    entry(plat, tx);
  };
  detailRow(p, A, y, 'tram boarding', 26, [
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
  ]);
  return p.scene();
}

/** The condensed 3-page tactile test gallery, in print order. */
export function buildTestSheets(): Scene[] {
  return [linesPage(), areasPage(), detailPage()];
}
