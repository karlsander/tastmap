import type { RectMm } from '../geo/types';
import type { Primitive, Scene } from './types';

/**
 * A tiny top-down page builder in page millimetres: a primitive list plus a
 * vertical cursor and a few text/section helpers. Keeps the calibration and
 * test-sheet generators declarative instead of arithmetic-heavy.
 */
export interface Page {
  readonly area: RectMm;
  readonly left: number;
  readonly right: number;
  /** Mutable vertical cursor (top of the next element). */
  y: number;
  /** Absolute-positioned text; `baselineY` is the text baseline. */
  text(s: string, x: number, baselineY: number, sizeMm?: number): void;
  /** A section heading at the left margin; advances the cursor past it. */
  heading(s: string, sizeMm?: number, gapMm?: number): void;
  /** A small label whose top sits at `topY`. */
  caption(s: string, x: number, topY: number, sizeMm?: number): void;
  add(...prims: Primitive[]): void;
  advance(mm: number): void;
  scene(): Scene;
}

export function createPage(area: RectMm, widthMm: number, heightMm: number): Page {
  const prims: Primitive[] = [];
  return {
    area,
    get left() {
      return area.minX;
    },
    get right() {
      return area.maxX;
    },
    y: area.minY,
    text(s, x, baselineY, sizeMm = 3.2) {
      prims.push({ kind: 'text', origin: { x, y: baselineY }, text: s, sizeMm });
    },
    heading(s, sizeMm = 4, gapMm = 3) {
      this.y += sizeMm;
      this.text(s, area.minX, this.y, sizeMm);
      this.y += gapMm;
    },
    caption(s, x, topY, sizeMm = 2.8) {
      this.text(s, x, topY + sizeMm, sizeMm);
    },
    add(...p) {
      prims.push(...p);
    },
    advance(mm) {
      this.y += mm;
    },
    scene() {
      return { widthMm, heightMm, primitives: prims };
    },
  };
}
