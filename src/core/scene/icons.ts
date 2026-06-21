import type { PointMm } from '../geo/types';
import { arcPoints, segment } from './lines';
import type { DotPrimitive, PathPrimitive, Primitive } from './types';

/**
 * Simple schematic point-feature icons, drawn small for tactile reading. Each is
 * built from strokes / dots / closed paths so it works on swell paper, and is
 * parameterised by stroke width ("strength") so the print run can find the
 * boldness that reads best. Reusable for real POI symbology later.
 */

export type IconKind = 'church' | 'person' | 'station' | 'home' | 'shop' | 'restaurant' | 'tree';

export const ICON_KINDS: IconKind[] = ['church', 'person', 'station', 'home', 'shop', 'restaurant', 'tree'];

const at = (x: number, y: number): PointMm => ({ x, y });

/** A stroked circle outline centred at (cx,cy). */
function circle(cx: number, cy: number, r: number, widthMm: number): PathPrimitive {
  return { kind: 'path', closed: true, points: arcPoints(cx, cy, r, 0, 360, 16), stroke: { widthMm } };
}

/** Build a point-icon of `kind` centred at `center`, fitting a sizeMm box. */
export function icon(kind: IconKind, center: PointMm, sizeMm: number, strokeMm: number): Primitive[] {
  const { x: cx, y: cy } = center;
  const h = sizeMm / 2; // half-extent
  const w = strokeMm;
  const seg = (a: PointMm, b: PointMm): PathPrimitive => segment(a, b, w);
  const dot = (p: PointMm, r: number): DotPrimitive => ({ kind: 'dot', center: p, radiusMm: r });
  const out: Primitive[] = [];

  switch (kind) {
    case 'church': {
      // gabled body + roof + cross
      const bx = h * 0.55;
      out.push(seg(at(cx - bx, cy + h), at(cx - bx, cy - h * 0.1)));
      out.push(seg(at(cx + bx, cy + h), at(cx + bx, cy - h * 0.1)));
      out.push(seg(at(cx - bx, cy + h), at(cx + bx, cy + h)));
      out.push(seg(at(cx - bx, cy - h * 0.1), at(cx, cy - h * 0.5)));
      out.push(seg(at(cx + bx, cy - h * 0.1), at(cx, cy - h * 0.5)));
      out.push(seg(at(cx, cy - h * 0.5), at(cx, cy - h))); // cross post
      out.push(seg(at(cx - h * 0.2, cy - h * 0.8), at(cx + h * 0.2, cy - h * 0.8))); // cross arm
      break;
    }
    case 'person': {
      const headR = h * 0.28;
      const headY = cy - h + headR;
      out.push(dot(at(cx, headY), headR));
      const shoulder = headY + headR + w;
      out.push(seg(at(cx, shoulder), at(cx, cy + h * 0.3))); // torso
      out.push(seg(at(cx - h * 0.5, cy - h * 0.1), at(cx + h * 0.5, cy - h * 0.1))); // arms
      out.push(seg(at(cx, cy + h * 0.3), at(cx - h * 0.45, cy + h))); // legs
      out.push(seg(at(cx, cy + h * 0.3), at(cx + h * 0.45, cy + h)));
      break;
    }
    case 'station': {
      // schematic loco: body + cab + two wheels
      out.push(seg(at(cx - h * 0.7, cy - h * 0.4), at(cx + h * 0.7, cy - h * 0.4)));
      out.push(seg(at(cx - h * 0.7, cy - h * 0.4), at(cx - h * 0.7, cy + h * 0.4)));
      out.push(seg(at(cx + h * 0.7, cy - h * 0.4), at(cx + h * 0.7, cy + h * 0.4)));
      out.push(seg(at(cx - h * 0.7, cy + h * 0.4), at(cx + h * 0.7, cy + h * 0.4)));
      out.push(seg(at(cx - h * 0.7, cy - h * 0.4), at(cx - h * 0.2, cy - h * 0.4))); // cab roof
      out.push(seg(at(cx - h * 0.55, cy - h * 0.4), at(cx - h * 0.55, cy - h))); // cab
      out.push(seg(at(cx - h * 0.2, cy - h * 0.4), at(cx - h * 0.2, cy - h)));
      out.push(seg(at(cx - h * 0.55, cy - h), at(cx - h * 0.2, cy - h)));
      out.push(dot(at(cx - h * 0.35, cy + h * 0.7), h * 0.18));
      out.push(dot(at(cx + h * 0.35, cy + h * 0.7), h * 0.18));
      break;
    }
    case 'home': {
      const bx = h * 0.6;
      out.push(seg(at(cx - bx, cy + h), at(cx - bx, cy - h * 0.1)));
      out.push(seg(at(cx + bx, cy + h), at(cx + bx, cy - h * 0.1)));
      out.push(seg(at(cx - bx, cy + h), at(cx + bx, cy + h)));
      out.push(seg(at(cx - h * 0.8, cy - h * 0.1), at(cx, cy - h))); // roof
      out.push(seg(at(cx + h * 0.8, cy - h * 0.1), at(cx, cy - h)));
      out.push(seg(at(cx - bx, cy - h * 0.1), at(cx + bx, cy - h * 0.1))); // eaves
      break;
    }
    case 'shop': {
      // shopping bag: body + handle
      const bx = h * 0.5;
      out.push(seg(at(cx - bx, cy - h * 0.2), at(cx - bx, cy + h)));
      out.push(seg(at(cx + bx, cy - h * 0.2), at(cx + bx, cy + h)));
      out.push(seg(at(cx - bx, cy + h), at(cx + bx, cy + h)));
      out.push(seg(at(cx - bx, cy - h * 0.2), at(cx + bx, cy - h * 0.2)));
      out.push({ kind: 'path', closed: false, points: arcPoints(cx, cy - h * 0.2, h * 0.3, 180, 360, 8), stroke: { widthMm: w } }); // handle
      break;
    }
    case 'restaurant': {
      // fork + knife
      const fx = cx - h * 0.45;
      out.push(seg(at(fx, cy - h * 0.2), at(fx, cy + h))); // fork stem
      for (const dx of [-h * 0.18, 0, h * 0.18]) out.push(seg(at(fx + dx, cy - h), at(fx + dx, cy - h * 0.2))); // tines
      const kx = cx + h * 0.45;
      out.push(seg(at(kx, cy - h), at(kx, cy + h))); // knife
      out.push(seg(at(kx, cy - h), at(kx + h * 0.22, cy - h * 0.55))); // blade
      out.push(seg(at(kx + h * 0.22, cy - h * 0.55), at(kx, cy - h * 0.2)));
      break;
    }
    case 'tree': {
      out.push(seg(at(cx, cy + h), at(cx, cy + h * 0.2))); // trunk
      out.push(circle(cx, cy - h * 0.25, h * 0.6, w)); // canopy
      break;
    }
  }
  return out;
}
