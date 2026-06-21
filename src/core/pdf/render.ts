import {
  LineCapStyle,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  StandardFonts,
  closePath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
} from 'pdf-lib';
import type { DotPrimitive, PathPrimitive, Scene, TextPrimitive } from '../scene/types';

const MM_TO_PT = 72 / 25.4;
const toPt = (mm: number): number => mm * MM_TO_PT;
const BLACK = rgb(0, 0, 0);
const DEFAULT_STROKE_MM = 0.3;

type Transform = (n: number) => number;

/**
 * Render the scene to a single-page PDF at exact physical size.
 * Scene space is top-left/y-down/mm; PDF space is bottom-left/y-up/points.
 */
export interface RenderOptions {
  /** Replace every ink label with a thin outlined "ghost" box of the same size.
   *  Print this version to fuse: fine text swells into mush, but the placeholder
   *  marks where each label sits so the normal (with-text) PDF reads as the key. */
  ghostText?: boolean;
}

/** Render a single scene to a one-page PDF at exact physical size. */
export async function renderPdf(scene: Scene, opts: RenderOptions = {}): Promise<Uint8Array> {
  return renderPdfPages([scene], opts);
}

/** Render several scenes to a multi-page PDF (one scene per page). Used for the
 *  calibration / test-sheet galleries and the keyed legend page. */
export async function renderPdfPages(scenes: Scene[], opts: RenderOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Helvetica is one of pdf-lib's built-in standard fonts, so ink labels need no
  // embedded font file. Tactile sheets carry print alongside braille so a sighted
  // helper can read along.
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const scene of scenes) drawScene(doc, font, scene, opts);
  return doc.save();
}

function drawScene(doc: PDFDocument, font: PDFFont, scene: Scene, opts: RenderOptions): void {
  const pageHeightPt = toPt(scene.heightMm);
  const page = doc.addPage([toPt(scene.widthMm), pageHeightPt]);

  const X: Transform = (x) => toPt(x);
  const Y: Transform = (y) => pageHeightPt - toPt(y);

  for (const prim of scene.primitives) {
    if (prim.kind === 'path') drawPath(page, prim, X, Y);
    else if (prim.kind === 'dot') drawDot(page, prim, X, Y);
    else if (prim.kind === 'text') drawText(page, prim, font, X, Y, opts.ghostText ?? false);
  }
}

function drawPath(page: PDFPage, prim: PathPrimitive, X: Transform, Y: Transform): void {
  const pts = prim.points;
  if (pts.length < 2) return;

  if (prim.fill && prim.closed && pts.length >= 3) {
    page.pushOperators(
      pushGraphicsState(),
      setFillingColor(BLACK),
      moveTo(X(pts[0].x), Y(pts[0].y)),
      ...pts.slice(1).map((pt) => lineTo(X(pt.x), Y(pt.y))),
      closePath(),
      fill(),
      popGraphicsState(),
    );
    if (!prim.stroke) return; // filled-only shape; nothing more to draw
  }

  const thickness = toPt(prim.stroke?.widthMm ?? DEFAULT_STROKE_MM);
  const dashArray = prim.stroke?.dashMm?.map(toPt);

  const segment = (ax: number, ay: number, bx: number, by: number): void => {
    page.drawLine({
      start: { x: X(ax), y: Y(ay) },
      end: { x: X(bx), y: Y(by) },
      thickness,
      color: BLACK,
      lineCap: LineCapStyle.Round,
      ...(dashArray ? { dashArray } : {}),
    });
  };

  for (let i = 1; i < pts.length; i++) {
    segment(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  }
  if (prim.closed) {
    const a = pts[pts.length - 1];
    const b = pts[0];
    segment(a.x, a.y, b.x, b.y);
  }
}

function drawDot(page: PDFPage, prim: DotPrimitive, X: Transform, Y: Transform): void {
  page.drawCircle({
    x: X(prim.center.x),
    y: Y(prim.center.y),
    size: toPt(prim.radiusMm),
    color: BLACK,
  });
}

function drawText(
  page: PDFPage,
  prim: TextPrimitive,
  font: PDFFont,
  X: Transform,
  Y: Transform,
  ghost: boolean,
): void {
  const sizePt = toPt(prim.sizeMm);
  if (ghost) {
    // A thin outlined box the size of the text — the "ghost" placeholder.
    const w = safeTextWidth(font, prim.text, sizePt);
    page.drawRectangle({
      x: X(prim.origin.x),
      y: Y(prim.origin.y), // baseline
      width: w,
      height: sizePt * 0.62, // ~cap height
      borderColor: BLACK,
      borderWidth: toPt(0.25),
    });
    return;
  }
  // origin is the left end of the text baseline, which is exactly pdf-lib's
  // drawText anchor (lower-left of the first glyph, on the baseline).
  const opts = {
    x: X(prim.origin.x),
    y: Y(prim.origin.y),
    size: sizePt,
    font,
    color: BLACK,
  };
  try {
    page.drawText(prim.text, opts);
  } catch {
    // Helvetica (WinAnsi) can't encode every character a real label or OSM name
    // might contain; degrade those to '?' rather than failing the whole render.
    page.drawText(toWinAnsiSafe(prim.text, font), opts);
  }
}

/** Text width, falling back to an estimate if the font can't encode a glyph. */
function safeTextWidth(font: PDFFont, text: string, sizePt: number): number {
  try {
    return font.widthOfTextAtSize(text, sizePt);
  } catch {
    return text.length * sizePt * 0.5;
  }
}

/** Replace characters the font cannot encode with '?'. */
function toWinAnsiSafe(text: string, font: PDFFont): string {
  let out = '';
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}
