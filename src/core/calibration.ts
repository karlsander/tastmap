import { cellsWidthMm, layoutCells } from './braille/dots';
import { MARBURG_MEDIUM } from './braille/spec';
import { basicTranslator } from './braille/translate';
import { printableRect } from './geo/clip';
import { DEFAULT_MARGIN_MM, getPageDimensions, uniformMargins } from './geo/paper';
import type { PaperSize, RectMm } from './geo/types';
import { crossHatchFill, dotFill, hatchFill, rectOutline } from './scene/textures';
import type { Primitive, Scene, TextPrimitive } from './scene/types';

/**
 * The calibration sheet: a one-page reference of line widths, dash patterns,
 * area textures, and a braille sample at exact Marburg spec. Print it on
 * Schwellpapier, run it through the fuser, then *feel* which widths and textures
 * actually swell and read apart — and tune core/style/defaultStyle.ts to match.
 * Those widths are unvalidated guesses until this sheet says otherwise.
 *
 * Always laid out portrait (it is a utility sheet, not a map); orientation is
 * therefore not a parameter.
 */
export interface CalibrationParams {
  paper: PaperSize;
  marginMm?: number;
}

/** Candidate stroke widths to feel apart, millimetres. */
const LINE_WIDTHS_MM = [0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5];

const DASH_PATTERNS: { dashMm: number[]; label: string }[] = [
  { dashMm: [1.5, 1.5], label: 'dash 1.5 / 1.5' },
  { dashMm: [3, 1.5], label: 'dash 3.0 / 1.5' },
  { dashMm: [1, 2], label: 'dash 1.0 / 2.0' },
  { dashMm: [0.6, 1.2], label: 'dot 0.6 / 1.2' },
];

const TITLE_MM = 5;
const HEAD_MM = 4;
const LABEL_MM = 3.2;
const SAMPLE_LEN_MM = 60;
const DASH_WIDTH_MM = 0.6;

const TEXTURES: { label: string; fill: (r: RectMm) => Primitive[] }[] = [
  { label: 'hatch 45 / 2.0', fill: (r) => hatchFill(r, { spacingMm: 2.0, angleDeg: 45, widthMm: 0.4 }) },
  { label: 'hatch 45 / 3.0', fill: (r) => hatchFill(r, { spacingMm: 3.0, angleDeg: 45, widthMm: 0.4 }) },
  { label: 'cross 2.5', fill: (r) => crossHatchFill(r, { spacingMm: 2.5, angleDeg: 45, widthMm: 0.4 }) },
  { label: 'vertical 2.5', fill: (r) => hatchFill(r, { spacingMm: 2.5, angleDeg: 90, widthMm: 0.4 }) },
  { label: 'dots 3.0 / r0.6', fill: (r) => dotFill(r, { spacingMm: 3.0, radiusMm: 0.6 }) },
  { label: 'dots 4.0 / r0.8', fill: (r) => dotFill(r, { spacingMm: 4.0, radiusMm: 0.8 }) },
];

export function buildCalibrationScene(params: CalibrationParams): Scene {
  const dim = getPageDimensions(params.paper, 'portrait');
  const area = printableRect(dim, uniformMargins(params.marginMm ?? DEFAULT_MARGIN_MM));
  const left = area.minX;
  const right = area.maxX;

  const prims: Primitive[] = [];
  let y = area.minY;

  const text = (s: string, x: number, baselineY: number, sizeMm = LABEL_MM): void => {
    const t: TextPrimitive = { kind: 'text', origin: { x, y: baselineY }, text: s, sizeMm };
    prims.push(t);
  };
  /** Place a left-aligned text line whose top sits at the cursor, then advance. */
  const line = (s: string, sizeMm: number, gapMm = sizeMm * 0.5): void => {
    y += sizeMm;
    text(s, left, y, sizeMm);
    y += gapMm;
  };

  line('Tastmap calibration sheet', TITLE_MM);
  line('Print on Schwellpapier, fuse, then feel each row. Tune core/style/defaultStyle.ts.', LABEL_MM, 6);

  // --- Line widths ---
  line('Line widths (mm)', HEAD_MM, 3);
  for (const w of LINE_WIDTHS_MM) {
    const rowH = Math.max(6.5, w + 4);
    const midY = y + rowH / 2;
    prims.push({
      kind: 'path',
      closed: false,
      stroke: { widthMm: w },
      points: [{ x: left, y: midY }, { x: left + SAMPLE_LEN_MM, y: midY }],
    });
    text(`${w.toFixed(2)} mm`, left + SAMPLE_LEN_MM + 5, midY + LABEL_MM * 0.35);
    y += rowH;
  }
  y += 6;

  // --- Dash patterns ---
  line(`Dash patterns (${DASH_WIDTH_MM.toFixed(1)} mm stroke)`, HEAD_MM, 3);
  for (const { dashMm, label } of DASH_PATTERNS) {
    const rowH = 6.5;
    const midY = y + rowH / 2;
    prims.push({
      kind: 'path',
      closed: false,
      stroke: { widthMm: DASH_WIDTH_MM, dashMm },
      points: [{ x: left, y: midY }, { x: left + SAMPLE_LEN_MM, y: midY }],
    });
    text(label, left + SAMPLE_LEN_MM + 5, midY + LABEL_MM * 0.35);
    y += rowH;
  }
  y += 6;

  // --- Area textures ---
  line('Area textures', HEAD_MM, 3);
  const SW = 34;
  const SH = 16;
  const GAP_X = 8;
  const GAP_Y = 6;
  const labelDrop = SH + LABEL_MM + 2;
  let sx = left;
  let rowTop = y;
  for (const swatch of TEXTURES) {
    if (sx + SW > right + 1e-9) {
      sx = left;
      rowTop += labelDrop + GAP_Y;
    }
    const rect: RectMm = { minX: sx, minY: rowTop, maxX: sx + SW, maxY: rowTop + SH };
    prims.push(rectOutline(rect, 0.3));
    prims.push(...swatch.fill(rect));
    text(swatch.label, sx, rowTop + SH + LABEL_MM + 1, LABEL_MM - 0.4);
    sx += SW + GAP_X;
  }
  y = rowTop + labelDrop + GAP_Y;

  // --- Braille ---
  line(
    `Braille — Marburg Medium (DIN 32976): ${MARBURG_MEDIUM.dotPitchMm} mm dots, ${MARBURG_MEDIUM.cellPitchMm} mm cells`,
    HEAD_MM,
    4,
  );
  for (const sample of ['marburg', 'strasse 12']) {
    const cells = basicTranslator.translate(sample);
    prims.push(...layoutCells(cells, { x: left, y }));
    text(
      `"${sample}"`,
      left + cellsWidthMm(cells.length) + 6,
      y + MARBURG_MEDIUM.dotPitchMm + LABEL_MM * 0.35,
    );
    y += MARBURG_MEDIUM.linePitchMm;
  }

  return { widthMm: dim.widthMm, heightMm: dim.heightMm, primitives: prims };
}
