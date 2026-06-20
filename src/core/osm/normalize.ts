import type { LngLat } from '../geo/types';
import type { OverpassResponse, OverpassWay } from './overpass';

export type Geometry =
  | { type: 'LineString'; coordinates: LngLat[] }
  | { type: 'Polygon'; coordinates: LngLat[] };

export interface Feature {
  id: string;
  tags: Record<string, string>;
  geometry: Geometry;
}

/** Tag keys whose presence makes a closed way an area rather than a line. */
const AREA_KEYS = ['building', 'landuse', 'leisure', 'natural', 'amenity'];

function isWay(el: OverpassResponse['elements'][number]): el is OverpassWay {
  return el.type === 'way' && Array.isArray((el as OverpassWay).geometry);
}

function looksLikeArea(tags: Record<string, string>): boolean {
  if (tags.area === 'yes') return true;
  if (tags.area === 'no') return false;
  if (tags.highway) return false; // closed roads (roundabouts) stay lines
  return AREA_KEYS.some((k) => k in tags);
}

function isClosed(coords: LngLat[]): boolean {
  if (coords.length < 4) return false;
  const a = coords[0];
  const b = coords[coords.length - 1];
  return a.lng === b.lng && a.lat === b.lat;
}

/** Convert an Overpass `out geom;` response into typed features. */
export function normalize(res: OverpassResponse): Feature[] {
  const features: Feature[] = [];
  for (const el of res.elements) {
    if (!isWay(el)) continue;
    const geom = el.geometry;
    if (!geom || geom.length < 2) continue;
    const coordinates: LngLat[] = geom.map((g) => ({ lng: g.lon, lat: g.lat }));
    const tags = el.tags ?? {};
    const geometry: Geometry =
      isClosed(coordinates) && looksLikeArea(tags)
        ? { type: 'Polygon', coordinates }
        : { type: 'LineString', coordinates };
    features.push({ id: `way/${el.id}`, tags, geometry });
  }
  return features;
}
