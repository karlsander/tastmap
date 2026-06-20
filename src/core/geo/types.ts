/** WGS84 coordinate in degrees. */
export interface LngLat {
  lng: number;
  lat: number;
}

/** Geographic bounding box in degrees. */
export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * A point on the printed page in millimetres.
 * Origin is the top-left corner; x increases right, y increases down.
 * (The PDF backend flips this to PDF's bottom-left/y-up space.)
 */
export interface PointMm {
  x: number;
  y: number;
}

export type PaperSize = 'A4' | 'A3';
export type Orientation = 'portrait' | 'landscape';
