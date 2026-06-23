import type { PointMm } from '../geo/types';

export interface StrokeStyle {
  widthMm: number;
  dashMm?: number[];
}

export interface PathPrimitive {
  kind: 'path';
  points: PointMm[];
  closed: boolean;
  stroke?: StrokeStyle;
  /** Fill the (closed) path solid black. Tactile areas should normally use a
   *  texture, not a solid — solids are here mainly to test how large black
   *  regions behave on the fuser. A path may be both filled and stroked. */
  fill?: boolean;
  /** Fill the (closed) path solid WHITE — an opaque knockout that clears (keeps
   *  flat) whatever is beneath, e.g. the map behind a label box. Drawn before
   *  the path's own stroke, so a white box with a thin black border is one
   *  primitive: `{ closed, fillWhite: true, stroke }`. */
  fillWhite?: boolean;
}

/** A single raised braille dot. */
export interface DotPrimitive {
  kind: 'dot';
  center: PointMm;
  radiusMm: number;
}

/** Human-readable ink text (tactile maps carry print alongside braille so a
 *  sighted helper can assist). Rendered by the PDF backend with an embedded font. */
export interface TextPrimitive {
  kind: 'text';
  origin: PointMm; // left end of the text baseline
  text: string;
  sizeMm: number;
}

export type Primitive = PathPrimitive | DotPrimitive | TextPrimitive;

/**
 * The canonical render model: everything in page millimetres, all black.
 * The PDF backend is the only consumer for now; keeping this explicit makes the
 * cartography unit-testable without parsing PDF bytes.
 */
export interface Scene {
  widthMm: number;
  heightMm: number;
  primitives: Primitive[];
}
