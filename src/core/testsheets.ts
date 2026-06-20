import { printableRect } from './geo/clip';
import { getPageDimensions, uniformMargins } from './geo/paper';
import type { PointMm, RectMm } from './geo/types';
import { createPage, type Page } from './scene/layout';
import {
  beadedPath,
  ladderPath,
  parallelPair,
  scatterFill,
  segment,
  wavyFill,
  wavyPath,
} from './scene/lines';
import { crossHatchFill, dotFill, hatchFill, rectOutline } from './scene/textures';
import type { Primitive, Scene } from './scene/types';

/**
 * A gallery of printable tactile test sheets. The whole project's tactile
 * dimensions (line widths, separations, area textures, and how to depict water,
 * parks, borders, crossings, sidewalks, tram stops) are *guesses* until they are
 * fused on real Schwellpapier and felt. These sheets put many candidates on
 * paper, each labelled, so a print run can decide what actually reads by touch.
 *
 * Pure: no network. Every page is A4 portrait at exact size.
 */

const MARGIN_MM = 10;
const LABEL = 2.8;
const at = (x: number, y: number): PointMm => ({ x, y });

function page(title: string): Page {
  const dim = getPageDimensions('A4', 'portrait');
  const p = createPage(printableRect(dim, uniformMargins(MARGIN_MM)), dim.widthMm, dim.heightMm);
  p.heading(title, 5, 1.5);
  p.add(segment(at(p.left, p.y), at(p.right, p.y), 0.3));
  p.advance(4);
  return p;
}

interface Swatch {
  label: string;
  fill: (r: RectMm) => Primitive[];
}

function swatchGrid(p: Page, swatches: Swatch[], swMm: number, shMm: number): void {
  const gapX = 7;
  const gapY = 7;
  const labelH = 3;
  let sx = p.left;
  let rowTop = p.y;
  for (const s of swatches) {
    if (sx + swMm > p.right + 1e-9) {
      sx = p.left;
      rowTop += shMm + labelH + gapY;
    }
    const rect: RectMm = { minX: sx, minY: rowTop, maxX: sx + swMm, maxY: rowTop + shMm };
    p.add(rectOutline(rect, 0.3));
    p.add(...s.fill(rect));
    p.text(s.label, sx, rowTop + shMm + labelH, 2.6);
    sx += swMm + gapX;
  }
  p.y = rowTop + shMm + labelH + gapY;
}

/** Fill one half (left/right) of a rect, for side-by-side texture contrast. */
function half(rect: RectMm, side: 'L' | 'R', fn: (r: RectMm) => Primitive[]): Primitive[] {
  const midX = (rect.minX + rect.maxX) / 2;
  return fn(side === 'L' ? { ...rect, maxX: midX } : { ...rect, minX: midX });
}

// ---------------------------------------------------------------------------
// 1. Line widths, dashes & discrimination
// ---------------------------------------------------------------------------
function lineWidthSheet(): Scene {
  const p = page('1. Line widths, dashes & discrimination');
  const lx = p.left + 60;

  p.heading('Width ladder — single strokes (mm)');
  for (const w of [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.2, 1.5, 2.0]) {
    const h = Math.max(5.5, w + 3.5);
    const mid = p.y + h / 2;
    p.add(segment(at(p.left, mid), at(p.left + 55, mid), w));
    p.text(w.toFixed(2), lx, mid + 1, LABEL);
    p.advance(h);
  }
  p.advance(4);

  p.heading('Adjacent-width steps — can you feel the difference?');
  for (const [a, b] of [[0.4, 0.6], [0.5, 0.7], [0.6, 0.8], [0.8, 1.0], [0.5, 0.6]] as [number, number][]) {
    const h = 8;
    const mid = p.y + h / 2;
    p.add(segment(at(p.left, mid - 1.4), at(p.left + 30, mid - 1.4), a));
    p.add(segment(at(p.left, mid + 1.4), at(p.left + 30, mid + 1.4), b));
    p.text(`${a.toFixed(2)}  vs  ${b.toFixed(2)} mm`, p.left + 36, mid + 1, LABEL);
    p.advance(h);
  }
  p.advance(4);

  p.heading('Dash & dot patterns (0.6 mm stroke)');
  for (const { d, l } of [
    { d: [1.5, 1.5], l: 'dash 1.5 / 1.5' },
    { d: [3, 1.5], l: 'dash 3.0 / 1.5' },
    { d: [1, 2], l: 'dot 1.0 / 2.0' },
    { d: [0.6, 1.2], l: 'fine dot 0.6 / 1.2' },
    { d: [3, 1.5, 0.6, 1.5], l: 'dash-dot' },
  ]) {
    const h = 6.5;
    const mid = p.y + h / 2;
    p.add(segment(at(p.left, mid), at(p.left + 55, mid), 0.6, d));
    p.text(l, lx, mid + 1, LABEL);
    p.advance(h);
  }
  return p.scene();
}

// ---------------------------------------------------------------------------
// 2. Line separation — minimum feel-apart gap
// ---------------------------------------------------------------------------
function separationSheet(): Scene {
  const p = page('2. Line separation — smallest gap that still feels like two');
  const lx = p.left + 60;

  p.heading('Two parallel strokes (0.5 mm) — gap shrinking');
  for (const g of [6, 5, 4, 3, 2.5, 2, 1.5, 1.0]) {
    const h = Math.max(7, g + 3.5);
    const mid = p.y + h / 2;
    p.add(segment(at(p.left, mid - g / 2), at(p.left + 55, mid - g / 2), 0.5));
    p.add(segment(at(p.left, mid + g / 2), at(p.left + 55, mid + g / 2), 0.5));
    p.text(`${g.toFixed(1)} mm`, lx, mid + 1, LABEL);
    p.advance(h);
  }
  p.advance(4);

  p.heading('Three strokes (divided-road / casing feel)');
  for (const g of [4, 3, 2, 1.5]) {
    const h = Math.max(9, 2 * g + 4);
    const mid = p.y + h / 2;
    for (const off of [-g, 0, g]) p.add(segment(at(p.left, mid + off), at(p.left + 55, mid + off), 0.5));
    p.text(`gap ${g.toFixed(1)} mm`, lx, mid + 1, LABEL);
    p.advance(h);
  }
  p.advance(4);

  p.heading('Dot rows — spacing along a line');
  for (const s of [2, 2.5, 3, 4]) {
    const h = 7;
    const mid = p.y + h / 2;
    p.add(...beadedPath([at(p.left, mid), at(p.left + 55, mid)], { spacingMm: s, radiusMm: 0.6 }));
    p.text(`dots ${s.toFixed(1)} mm apart`, lx, mid + 1, LABEL);
    p.advance(h);
  }
  return p.scene();
}

// ---------------------------------------------------------------------------
// 3. Area textures — catalog
// ---------------------------------------------------------------------------
function textureCatalogSheet(): Scene {
  const p = page('3. Area textures — catalog');

  p.heading('Hatch — spacing & angle');
  swatchGrid(
    p,
    [
      { label: 'hatch 45 / 1.5', fill: (r) => hatchFill(r, { spacingMm: 1.5, angleDeg: 45, widthMm: 0.4 }) },
      { label: 'hatch 45 / 2.0', fill: (r) => hatchFill(r, { spacingMm: 2.0, angleDeg: 45, widthMm: 0.4 }) },
      { label: 'hatch 45 / 2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 }) },
      { label: 'hatch 45 / 3.0', fill: (r) => hatchFill(r, { spacingMm: 3.0, angleDeg: 45, widthMm: 0.4 }) },
      { label: 'hatch 0 / 2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 0, widthMm: 0.4 }) },
      { label: 'hatch 90 / 2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 90, widthMm: 0.4 }) },
    ],
    40,
    16,
  );
  p.advance(2);

  p.heading('Cross-hatch & dot grids');
  swatchGrid(
    p,
    [
      { label: 'cross 2.0', fill: (r) => crossHatchFill(r, { spacingMm: 2.0, angleDeg: 45, widthMm: 0.4 }) },
      { label: 'cross 3.0', fill: (r) => crossHatchFill(r, { spacingMm: 3.0, angleDeg: 45, widthMm: 0.4 }) },
      { label: 'dots 2.5 / r0.5', fill: (r) => dotFill(r, { spacingMm: 2.5, radiusMm: 0.5 }) },
      { label: 'dots 3.0 / r0.6', fill: (r) => dotFill(r, { spacingMm: 3.0, radiusMm: 0.6 }) },
      { label: 'dots 4.0 / r0.8', fill: (r) => dotFill(r, { spacingMm: 4.0, radiusMm: 0.8 }) },
      { label: 'dots 3.0 / r0.4', fill: (r) => dotFill(r, { spacingMm: 3.0, radiusMm: 0.4 }) },
    ],
    40,
    16,
  );
  return p.scene();
}

// ---------------------------------------------------------------------------
// 4. Surface ideas — water, parks & contrast
// ---------------------------------------------------------------------------
function thematicFillSheet(): Scene {
  const p = page('4. Surface ideas — water, parks & contrast');

  p.heading('Water-area fills');
  swatchGrid(
    p,
    [
      { label: 'wavy lines', fill: (r) => wavyFill(r, { amplitudeMm: 0.8, wavelengthMm: 6, rowGapMm: 3, widthMm: 0.4 }) },
      { label: 'sparse dots', fill: (r) => dotFill(r, { spacingMm: 4, radiusMm: 0.5 }) },
      { label: 'fine horizontal', fill: (r) => hatchFill(r, { spacingMm: 2, angleDeg: 0, widthMm: 0.3 }) },
      { label: 'wide waves', fill: (r) => wavyFill(r, { amplitudeMm: 0.6, wavelengthMm: 9, rowGapMm: 4, widthMm: 0.45 }) },
    ],
    42,
    18,
  );
  p.advance(2);

  p.heading('Park / green-area fills');
  swatchGrid(
    p,
    [
      { label: 'scatter (trees)', fill: (r) => scatterFill(r, { spacingMm: 4, radiusMm: 0.6, jitterMm: 1.0 }) },
      { label: 'coarse hatch 60', fill: (r) => hatchFill(r, { spacingMm: 3.5, angleDeg: 60, widthMm: 0.4 }) },
      { label: 'sparse grid', fill: (r) => dotFill(r, { spacingMm: 5, radiusMm: 0.6 }) },
      { label: 'outline + scatter', fill: (r) => [rectOutline(r, 0.5), ...scatterFill(r, { spacingMm: 5, radiusMm: 0.5, jitterMm: 1.2 })] },
    ],
    42,
    18,
  );
  p.advance(2);

  p.heading('Texture contrast — two surfaces meeting (no divider line)');
  swatchGrid(
    p,
    [
      {
        label: 'hatch | dots',
        fill: (r) => [
          ...half(r, 'L', (rr) => hatchFill(rr, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 })),
          ...half(r, 'R', (rr) => dotFill(rr, { spacingMm: 3, radiusMm: 0.6 })),
        ],
      },
      {
        label: 'fine | coarse',
        fill: (r) => [
          ...half(r, 'L', (rr) => hatchFill(rr, { spacingMm: 1.5, angleDeg: 45, widthMm: 0.4 })),
          ...half(r, 'R', (rr) => hatchFill(rr, { spacingMm: 3.5, angleDeg: 45, widthMm: 0.4 })),
        ],
      },
      {
        label: 'hatch | cross',
        fill: (r) => [
          ...half(r, 'L', (rr) => hatchFill(rr, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 })),
          ...half(r, 'R', (rr) => crossHatchFill(rr, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 })),
        ],
      },
      {
        label: 'blank | dots',
        fill: (r) => half(r, 'R', (rr) => dotFill(rr, { spacingMm: 3, radiusMm: 0.6 })),
      },
    ],
    42,
    18,
  );
  return p.scene();
}

// ---------------------------------------------------------------------------
// 5. Linear features — distinct styles for distinct meanings
// ---------------------------------------------------------------------------
function linearFeatureSheet(): Scene {
  const p = page('5. Linear features — distinct styles for distinct meanings');
  const x0 = p.left;
  const x1 = p.left + 55;
  const lx = p.left + 60;
  const row = (label: string, draw: (mid: number) => void, h = 8): void => {
    const mid = p.y + h / 2;
    draw(mid);
    p.text(label, lx, mid + 1, LABEL);
    p.advance(h);
  };

  p.heading('Streets');
  row('major road — solid 1.0', (m) => p.add(segment(at(x0, m), at(x1, m), 1.0)));
  row('minor road — solid 0.6', (m) => p.add(segment(at(x0, m), at(x1, m), 0.6)));
  row('path — dashed 0.4', (m) => p.add(segment(at(x0, m), at(x1, m), 0.4, [1.5, 1.5])));
  row('road as casing — trace the channel', (m) => p.add(...parallelPair(at(x0, m), at(x1, m), { gapMm: 2, widthMm: 0.4 })), 9);
  p.advance(3);

  p.heading('Administrative / city borders');
  row('dash-dot', (m) => p.add(segment(at(x0, m), at(x1, m), 0.6, [3, 1.5, 0.6, 1.5])));
  row('beaded (dots)', (m) => p.add(...beadedPath([at(x0, m), at(x1, m)], { spacingMm: 3, radiusMm: 0.7 })));
  row('double dashed thin', (m) => p.add(...parallelPair(at(x0, m), at(x1, m), { gapMm: 1.6, widthMm: 0.35, dashMm: [2, 1.5] })), 9);
  p.advance(3);

  p.heading('Water');
  row('thick solid 1.2', (m) => p.add(segment(at(x0, m), at(x1, m), 1.2)));
  row('wavy line', (m) => p.add(wavyPath(at(x0, m), at(x1, m), { amplitudeMm: 1.0, wavelengthMm: 7, widthMm: 0.6 })), 9);
  row('double bank lines', (m) => p.add(...parallelPair(at(x0, m), at(x1, m), { gapMm: 2.5, widthMm: 0.4 })), 9);
  p.advance(3);

  p.heading('Rail / tram');
  row('cross-ties only', (m) => p.add(...ladderPath(at(x0, m), at(x1, m), { tieLengthMm: 3, tieSpacingMm: 3, widthMm: 0.4 })), 9);
  row('rails + ties', (m) => p.add(...ladderPath(at(x0, m), at(x1, m), { tieLengthMm: 4, tieSpacingMm: 5, widthMm: 0.35, rails: true, railGapMm: 3, railWidthMm: 0.4 })), 9);
  return p.scene();
}

// ---------------------------------------------------------------------------
// 6. Street hierarchy — single line vs casing
// ---------------------------------------------------------------------------
function hierarchySheet(): Scene {
  const p = page('6. Street hierarchy — single line vs casing');
  p.heading('Same network, two encodings — which is easier to trace?');

  const drawNet = (ox: number, oy: number, w: number, h: number, casing: boolean): void => {
    const major = (a: PointMm, b: PointMm): void => {
      if (casing) p.add(...parallelPair(a, b, { gapMm: 1.8, widthMm: 0.4 }));
      else p.add(segment(a, b, 1.0));
    };
    const minor = (a: PointMm, b: PointMm): void => p.add(segment(a, b, 0.6));
    const path = (a: PointMm, b: PointMm): void => p.add(segment(a, b, 0.4, [1.5, 1.5]));
    major(at(ox, oy + h * 0.5), at(ox + w, oy + h * 0.5));
    major(at(ox + w * 0.5, oy), at(ox + w * 0.5, oy + h));
    minor(at(ox, oy + h * 0.22), at(ox + w, oy + h * 0.22));
    minor(at(ox, oy + h * 0.8), at(ox + w, oy + h * 0.8));
    minor(at(ox + w * 0.22, oy), at(ox + w * 0.22, oy + h));
    minor(at(ox + w * 0.8, oy), at(ox + w * 0.8, oy + h));
    path(at(ox, oy), at(ox + w, oy + h));
  };

  const top = p.y;
  const netW = 82;
  const netH = 92;
  const gap = 14;
  drawNet(p.left, top, netW, netH, false);
  drawNet(p.left + netW + gap, top, netW, netH, true);
  p.text('single line (major 1.0)', p.left, top + netH + 5, 3.0);
  p.text('casing (major = pair)', p.left + netW + gap, top + netH + 5, 3.0);
  p.y = top + netH + 12;

  p.heading('In both: minor = 0.6 solid, path = 0.4 dashed (diagonal)');
  return p.scene();
}

// ---------------------------------------------------------------------------
// 7. Annotated junction — the elements combined at large scale
// ---------------------------------------------------------------------------
function junctionSheet(): Scene {
  const p = page('7. Annotated junction (synthetic, large scale)');
  p.advance(2);

  const cx = 68;
  const cy = 118;
  const B = 3.5; // half road width

  // Road casings, junction left open.
  p.add(segment(at(16, cy - B), at(cx - B, cy - B), 0.5), segment(at(16, cy + B), at(cx - B, cy + B), 0.5)); // left arm
  p.add(segment(at(cx + B, cy - B), at(148, cy - B), 0.5), segment(at(cx + B, cy + B), at(148, cy + B), 0.5)); // right arm
  p.add(segment(at(cx - B, 46), at(cx - B, cy - B), 0.5), segment(at(cx + B, 46), at(cx + B, cy - B), 0.5)); // top arm
  p.add(segment(at(cx - B, cy + B), at(cx - B, 208), 0.5), segment(at(cx + B, cy + B), at(cx + B, 208), 0.5)); // bottom arm

  // Sidewalks on the horizontal arms (thin, set back), ending in a curb tick.
  const so = B + 2.5;
  for (const s of [-so, so]) {
    p.add(segment(at(16, cy + s), at(cx - B - 5, cy + s), 0.35)); // left
    p.add(segment(at(cx - B - 5, cy + s - 1), at(cx - B - 5, cy + s + 1), 0.35)); // curb tick
    p.add(segment(at(cx + B + 5, cy + s), at(148, cy + s), 0.35)); // right
    p.add(segment(at(cx + B + 5, cy + s - 1), at(cx + B + 5, cy + s + 1), 0.35)); // curb tick
  }

  // Marked crossing (zebra) on the right arm.
  p.add(...ladderPath(at(92, cy), at(99, cy), { tieLengthMm: 2 * B, tieSpacingMm: 1.3, widthMm: 0.5 }));

  // Tram tracks down the bottom arm.
  p.add(...ladderPath(at(cx, cy + B + 3), at(cx, 200), { tieLengthMm: 4, tieSpacingMm: 5, widthMm: 0.35, rails: true, railGapMm: 3, railWidthMm: 0.4 }));

  // Tram stop platform beside the track, with a boarding arrow.
  const plat: RectMm = { minX: 80, minY: 150, maxX: 90, maxY: 188 };
  p.add(rectOutline(plat, 0.5), ...dotFill(plat, { spacingMm: 3, radiusMm: 0.6 }));
  p.add(segment(at(75, 163), at(80, 166), 0.5), segment(at(75, 169), at(80, 166), 0.5)); // arrow ">" into platform

  // Numbered keys near each element.
  const key = (n: number, x: number, y: number): void => p.text(String(n), x, y, 3.2);
  key(1, 30, cy - 5);
  key(2, 60, cy - 6);
  key(3, 94, cy - 5);
  key(4, 40, cy + so + 4);
  key(5, cx + B + 6, cy - so - 1);
  key(6, cx + 6, 145);
  key(7, 91, 150);
  key(8, 72, 160);

  // Legend.
  p.y = 216;
  p.heading('Key', 4, 3);
  for (const l of [
    '1  road casing — trace the channel between two edges',
    '2  open junction — arms meet at a gap',
    '3  marked crossing (zebra stripes)',
    '4  sidewalk — thin line set back from the road',
    '5  curb — where the sidewalk ends at the corner',
    '6  tram tracks — rails with cross-ties',
    '7  tram stop platform — dotted area beside the track',
    '8  board here — arrow to the boarding point',
  ]) {
    p.y += 4.6;
    p.text(l, p.left, p.y, 3.0);
  }
  return p.scene();
}

// ---------------------------------------------------------------------------
// 8. Detail symbol options — crossings / sidewalk start / tram boarding
// ---------------------------------------------------------------------------
interface Variation {
  label: string;
  draw: (cell: RectMm) => void;
}

function variationRow(p: Page, variations: Variation[], cellH: number): void {
  const gap = 8;
  const n = variations.length;
  const cw = (p.right - p.left - gap * (n - 1)) / n;
  const top = p.y;
  variations.forEach((v, i) => {
    const x = p.left + i * (cw + gap);
    v.draw({ minX: x, minY: top, maxX: x + cw, maxY: top + cellH });
    p.text(v.label, x, top + cellH + 3, LABEL);
  });
  p.y = top + cellH + 3 + 7;
}

function detailSheet(): Scene {
  const p = page('8. Detail symbol options — pick what reads best by touch');
  const B = 3; // half road width in these cells

  const roadAcross = (c: RectMm, my: number): void => {
    p.add(segment(at(c.minX, my - B), at(c.maxX, my - B), 0.5), segment(at(c.minX, my + B), at(c.maxX, my + B), 0.5));
  };

  p.heading('Marked crossing across a road');
  variationRow(
    p,
    [
      {
        label: 'zebra (ties)',
        draw: (c) => {
          const my = c.minY + 13;
          roadAcross(c, my);
          const mx = (c.minX + c.maxX) / 2;
          p.add(...ladderPath(at(mx - 3, my), at(mx + 3, my), { tieLengthMm: 2 * B, tieSpacingMm: 1.2, widthMm: 0.45 }));
        },
      },
      {
        label: 'two dotted lines',
        draw: (c) => {
          const my = c.minY + 13;
          roadAcross(c, my);
          const mx = (c.minX + c.maxX) / 2;
          for (const dx of [-2, 2]) p.add(...beadedPath([at(mx + dx, my - B), at(mx + dx, my + B)], { spacingMm: 1.6, radiusMm: 0.4 }));
        },
      },
      {
        label: 'double thin lines',
        draw: (c) => {
          const my = c.minY + 13;
          roadAcross(c, my);
          const mx = (c.minX + c.maxX) / 2;
          for (const dx of [-1.5, 1.5]) p.add(segment(at(mx + dx, my - B), at(mx + dx, my + B), 0.3));
        },
      },
    ],
    22,
  );

  p.heading('Where the sidewalk starts (curb)');
  variationRow(
    p,
    [
      {
        label: 'end tick',
        draw: (c) => {
          const my = c.minY + 13;
          roadAcross(c, my);
          const sy = my - B - 2.5;
          const sx = (c.minX + c.maxX) / 2;
          p.add(segment(at(sx, sy), at(c.maxX, sy), 0.35), segment(at(sx, sy - 1.3), at(sx, sy + 1.3), 0.35));
        },
      },
      {
        label: 'end dot',
        draw: (c) => {
          const my = c.minY + 13;
          roadAcross(c, my);
          const sy = my - B - 2.5;
          const sx = (c.minX + c.maxX) / 2;
          p.add(segment(at(sx, sy), at(c.maxX, sy), 0.35), { kind: 'dot', center: at(sx, sy), radiusMm: 0.8 });
        },
      },
      {
        label: 'gap + tick',
        draw: (c) => {
          const my = c.minY + 13;
          roadAcross(c, my);
          const sy = my - B - 2.5;
          const sx = (c.minX + c.maxX) / 2 + 3;
          p.add(segment(at(sx, sy), at(c.maxX, sy), 0.35), segment(at(sx, sy - 1.3), at(sx, sy + 1.3), 0.35));
        },
      },
    ],
    22,
  );

  p.heading('Tram stop & boarding point');
  variationRow(
    p,
    [
      {
        label: 'arrow into platform',
        draw: (c) => {
          const tx = c.minX + 10;
          p.add(...ladderPath(at(tx, c.minY + 2), at(tx, c.maxY - 2), { tieLengthMm: 3, tieSpacingMm: 4, widthMm: 0.35, rails: true, railGapMm: 2.5, railWidthMm: 0.35 }));
          const plat: RectMm = { minX: tx + 5, minY: c.minY + 4, maxX: tx + 13, maxY: c.maxY - 4 };
          p.add(rectOutline(plat, 0.45), ...dotFill(plat, { spacingMm: 2.8, radiusMm: 0.55 }));
          const ay = (plat.minY + plat.maxY) / 2;
          p.add(segment(at(tx + 1.5, ay - 2), at(plat.minX, ay), 0.45), segment(at(tx + 1.5, ay + 2), at(plat.minX, ay), 0.45));
        },
      },
      {
        label: 'notch in edge',
        draw: (c) => {
          const tx = c.minX + 10;
          p.add(...ladderPath(at(tx, c.minY + 2), at(tx, c.maxY - 2), { tieLengthMm: 3, tieSpacingMm: 4, widthMm: 0.35, rails: true, railGapMm: 2.5, railWidthMm: 0.35 }));
          const plat: RectMm = { minX: tx + 5, minY: c.minY + 4, maxX: tx + 13, maxY: c.maxY - 4 };
          const ay = (plat.minY + plat.maxY) / 2;
          // outline with a gap (notch) in the road-facing edge near the middle
          p.add(...dotFill(plat, { spacingMm: 2.8, radiusMm: 0.55 }));
          p.add(segment(at(plat.minX, plat.minY), at(plat.maxX, plat.minY), 0.45)); // top
          p.add(segment(at(plat.minX, plat.maxY), at(plat.maxX, plat.maxY), 0.45)); // bottom
          p.add(segment(at(plat.maxX, plat.minY), at(plat.maxX, plat.maxY), 0.45)); // far edge
          p.add(segment(at(plat.minX, plat.minY), at(plat.minX, ay - 2), 0.45), segment(at(plat.minX, ay + 2), at(plat.minX, plat.maxY), 0.45)); // near edge w/ notch
        },
      },
      {
        label: 'dot row at edge',
        draw: (c) => {
          const tx = c.minX + 10;
          p.add(...ladderPath(at(tx, c.minY + 2), at(tx, c.maxY - 2), { tieLengthMm: 3, tieSpacingMm: 4, widthMm: 0.35, rails: true, railGapMm: 2.5, railWidthMm: 0.35 }));
          const plat: RectMm = { minX: tx + 5, minY: c.minY + 4, maxX: tx + 13, maxY: c.maxY - 4 };
          p.add(rectOutline(plat, 0.45), ...dotFill(plat, { spacingMm: 2.8, radiusMm: 0.55 }));
          p.add(...beadedPath([at(plat.minX, plat.minY + 2), at(plat.minX, plat.maxY - 2)], { spacingMm: 2, radiusMm: 0.7 }));
        },
      },
    ],
    30,
  );
  return p.scene();
}

/** All test-sheet scenes, in print order. */
export function buildTestSheets(): Scene[] {
  return [
    lineWidthSheet(),
    separationSheet(),
    textureCatalogSheet(),
    thematicFillSheet(),
    linearFeatureSheet(),
    hierarchySheet(),
    junctionSheet(),
    detailSheet(),
  ];
}
