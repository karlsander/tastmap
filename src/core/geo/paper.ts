import type { Orientation, PaperSize } from './types';

export interface PageDimensions {
  widthMm: number;
  heightMm: number;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** ISO 216 sizes in portrait orientation, millimetres. */
const PAPER_PORTRAIT: Record<PaperSize, PageDimensions> = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
};

/** Default printable margin; small since the fuser handles near-edge content. */
export const DEFAULT_MARGIN_MM = 5;

export function uniformMargins(mm = DEFAULT_MARGIN_MM): Margins {
  return { top: mm, right: mm, bottom: mm, left: mm };
}

export function getPageDimensions(paper: PaperSize, orientation: Orientation): PageDimensions {
  const p = PAPER_PORTRAIT[paper];
  return orientation === 'portrait'
    ? { widthMm: p.widthMm, heightMm: p.heightMm }
    : { widthMm: p.heightMm, heightMm: p.widthMm };
}

export function getPrintableArea(dim: PageDimensions, margins: Margins): PageDimensions {
  return {
    widthMm: dim.widthMm - margins.left - margins.right,
    heightMm: dim.heightMm - margins.top - margins.bottom,
  };
}
