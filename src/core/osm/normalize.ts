import type { LngLat } from '../geo/types';
import type { OverpassRelation, OverpassResponse, OverpassWay } from './overpass';

export type Geometry =
  | { type: 'LineString'; coordinates: LngLat[] }
  /** `coordinates` is the outer ring (closed); `holes` are inner rings (islands)
   *  cut out of it — present only for multipolygon relations. */
  | { type: 'Polygon'; coordinates: LngLat[]; holes?: LngLat[][] };

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

function isRelation(el: OverpassResponse['elements'][number]): el is OverpassRelation {
  return el.type === 'relation' && Array.isArray((el as OverpassRelation).members);
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

const samePoint = (a: LngLat, b: LngLat): boolean => a.lng === b.lng && a.lat === b.lat;
const isRing = (r: LngLat[]): boolean => r.length >= 4 && samePoint(r[0], r[r.length - 1]);

/** Ray-casting point-in-ring on lng/lat (treats the ring as implicitly closed). */
function pointInRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat;
    const yj = ring[j].lat;
    if (yi > p.lat !== yj > p.lat) {
      const x = ((ring[j].lng - ring[i].lng) * (p.lat - yi)) / (yj - yi) + ring[i].lng;
      if (p.lng < x) inside = !inside;
    }
  }
  return inside;
}

/**
 * Chain unordered boundary fragments (member ways) into closed rings. Consecutive
 * fragments of a multipolygon ring share exact end nodes, so we grow a ring by
 * appending whichever leftover fragment continues its open end (reversing when it
 * joins tail-to-tail) until it closes. Best effort: broken data yields whatever
 * rings can be formed.
 */
function assembleRings(frags: LngLat[][]): LngLat[][] {
  const pool = frags.filter((f) => f.length >= 2).map((f) => f.slice());
  const used = new Array(pool.length).fill(false);
  const rings: LngLat[][] = [];
  for (let i = 0; i < pool.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const ring = pool[i].slice();
    let grew = true;
    while (grew && !isRing(ring)) {
      grew = false;
      const end = ring[ring.length - 1];
      for (let j = 0; j < pool.length; j++) {
        if (used[j]) continue;
        const f = pool[j];
        if (samePoint(end, f[0])) {
          ring.push(...f.slice(1));
        } else if (samePoint(end, f[f.length - 1])) {
          ring.push(...f.slice(0, -1).reverse());
        } else {
          continue;
        }
        used[j] = true;
        grew = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Build outer rings (each with the inner rings it contains) from a relation. */
function relationPolygons(rel: OverpassRelation): { outer: LngLat[]; holes: LngLat[][] }[] {
  const outerFrags: LngLat[][] = [];
  const innerFrags: LngLat[][] = [];
  for (const m of rel.members) {
    if (m.type !== 'way' || !Array.isArray(m.geometry) || m.geometry.length < 2) continue;
    const coords = m.geometry.map((g) => ({ lng: g.lon, lat: g.lat }));
    (m.role === 'inner' ? innerFrags : outerFrags).push(coords);
  }
  const inners = assembleRings(innerFrags);
  return assembleRings(outerFrags).map((outer) => ({
    outer,
    holes: inners.filter((inner) => pointInRing(inner[0], outer)),
  }));
}

/** Convert an Overpass `out geom;` response into typed features. */
export function normalize(res: OverpassResponse): Feature[] {
  const features: Feature[] = [];
  for (const el of res.elements) {
    if (isWay(el)) {
      const geom = el.geometry;
      if (!geom || geom.length < 2) continue;
      const coordinates: LngLat[] = geom.map((g) => ({ lng: g.lon, lat: g.lat }));
      const tags = el.tags ?? {};
      const geometry: Geometry =
        isClosed(coordinates) && looksLikeArea(tags)
          ? { type: 'Polygon', coordinates }
          : { type: 'LineString', coordinates };
      features.push({ id: `way/${el.id}`, tags, geometry });
    } else if (isRelation(el)) {
      const tags = el.tags ?? {};
      // Each outer ring becomes its own Polygon feature (sharing the relation's
      // tags), carrying any inner rings as holes.
      relationPolygons(el).forEach((poly, i) => {
        features.push({
          id: `relation/${el.id}#${i}`,
          tags,
          geometry: { type: 'Polygon', coordinates: poly.outer, holes: poly.holes.length ? poly.holes : undefined },
        });
      });
    }
  }
  return features;
}
