import type { PageDimensions } from './paper';
import type { BBox, LngLat, PointMm } from './types';

/** Mean Earth radius, metres (IUGG). */
export const EARTH_RADIUS_M = 6371008.8;
const DEG2RAD = Math.PI / 180;

/**
 * Local tangent-plane offset (metres) of `p` from `center`.
 *
 * An equirectangular approximation about the centre latitude. Accurate to well
 * under a millimetre on paper across a single A3 sheet at city scales, which is
 * what tactile maps need — the printed scale must be honest for a blind reader.
 * Swap in proj4/UTM here if we ever need large extents.
 */
export function metersFromCenter(center: LngLat, p: LngLat): { east: number; north: number } {
  const east = (p.lng - center.lng) * DEG2RAD * EARTH_RADIUS_M * Math.cos(center.lat * DEG2RAD);
  const north = (p.lat - center.lat) * DEG2RAD * EARTH_RADIUS_M;
  return { east, north };
}

/** Bounding box centred on `center` spanning the given half-extents in metres. */
export function bboxFromCenter(center: LngLat, halfWidthM: number, halfHeightM: number): BBox {
  const dLat = halfHeightM / EARTH_RADIUS_M / DEG2RAD;
  const dLng = halfWidthM / (EARTH_RADIUS_M * Math.cos(center.lat * DEG2RAD)) / DEG2RAD;
  return {
    minLng: center.lng - dLng,
    minLat: center.lat - dLat,
    maxLng: center.lng + dLng,
    maxLat: center.lat + dLat,
  };
}

export interface Projector {
  /** Project a geographic point to page millimetres (top-left origin, y-down). */
  toPage(p: LngLat): PointMm;
  readonly page: PageDimensions;
  readonly scaleDenominator: number;
}

/**
 * Build a projector that places `center` at the middle of the page and renders
 * ground distances at 1:`scaleDenominator`.
 *
 * 1 mm on paper === `scaleDenominator` mm on the ground, so
 *   paperMm = groundMetres * 1000 / scaleDenominator.
 */
export function makeProjector(
  center: LngLat,
  scaleDenominator: number,
  page: PageDimensions,
): Projector {
  const cx = page.widthMm / 2;
  const cy = page.heightMm / 2;
  const mmPerMeter = 1000 / scaleDenominator;
  return {
    page,
    scaleDenominator,
    toPage(p: LngLat): PointMm {
      const { east, north } = metersFromCenter(center, p);
      return {
        x: cx + east * mmPerMeter,
        y: cy - north * mmPerMeter, // north is up → smaller y
      };
    },
  };
}

/** Ground distance (metres) covered by a paper dimension (mm) at a given scale. */
export function groundMeters(paperMm: number, scaleDenominator: number): number {
  return (paperMm * scaleDenominator) / 1000;
}
