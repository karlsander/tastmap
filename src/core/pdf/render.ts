import { LineCapStyle, PDFDocument, type PDFPage, rgb } from 'pdf-lib';
import type { DotPrimitive, PathPrimitive, Scene } from '../scene/types';

const MM_TO_PT = 72 / 25.4;
const toPt = (mm: number): number => mm * MM_TO_PT;
const BLACK = rgb(0, 0, 0);
const DEFAULT_STROKE_MM = 0.3;

type Transform = (n: number) => number;

/**
 * Render the scene to a single-page PDF at exact physical size.
 * Scene space is top-left/y-down/mm; PDF space is bottom-left/y-up/points.
 */
export async function renderPdf(scene: Scene): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pageHeightPt = toPt(scene.heightMm);
  const page = doc.addPage([toPt(scene.widthMm), pageHeightPt]);

  const X: Transform = (x) => toPt(x);
  const Y: Transform = (y) => pageHeightPt - toPt(y);

  for (const prim of scene.primitives) {
    if (prim.kind === 'path') drawPath(page, prim, X, Y);
    else if (prim.kind === 'dot') drawDot(page, prim, X, Y);
    // 'text' → TODO: embed a font and draw ink labels
  }

  return doc.save();
}

function drawPath(page: PDFPage, prim: PathPrimitive, X: Transform, Y: Transform): void {
  const pts = prim.points;
  if (pts.length < 2) return;
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
