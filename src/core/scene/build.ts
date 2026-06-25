import { clipPolylineToRect } from '../geo/clip';
import { groundMeters, type Projector } from '../geo/projection';
import { simplify } from '../geo/simplify';
import type { PointMm, RectMm } from '../geo/types';
import type { Geometry } from '../osm/normalize';
import type { ClassifiedFeature } from '../style/classify';
import type { AreaSymbology } from '../style/types';
import type { AreaFill } from '../style/vocabulary';
import { collapseDualCarriageways, type Way } from './dualCarriageway';
import { clipTextureToArea } from './fill';
import { ladderAlongPath } from './lines';
import { mergeRailCorridors } from './railMerge';
import { crossHatchFill, dotFill, hatchFill } from './textures';
import type { PathPrimitive, Primitive, Scene } from './types';

/** Default Douglas–Peucker tolerance (page mm) — well under tactile resolution,
 *  so it only de-noises sub-millimetre wiggle. */
export const DEFAULT_SIMPLIFY_MM = 0.3;

/** A street part is "edge-hugging" if it comes within this of the clip boundary. */
const EDGE_TOL_MM = 2;

/** Two vertices within this distance read as the same node for connectivity. */
const CONNECT_TOL_MM = 0.1;

export interface BuildOptions {
  /** Polyline simplification tolerance in page mm. 0 disables. */
  simplifyToleranceMm?: number;
  /** Drop short street snippets that hug the page edge and connect to nothing
   *  else on the page — usually streets clipped off at the boundary. */
  trimEdgeSnippets?: boolean;
  /** Collapse divided roads (two oneway carriageways of the same name running
   *  close and parallel) to a single centerline. See {@link collapseDualCarriageways}. */
  collapseDualCarriageways?: boolean;
  /** Collapse bundles of parallel railway tracks (a multi-track line, a station
   *  throat) to one centerline per corridor. Defaults on. See
   *  {@link mergeRailCorridors}. */
  mergeRail?: boolean;
  /** Tracks within this on-paper distance fuse into one rail corridor, mm. */
  railCorridorMm?: number;
}

/** OSM `oneway` values that mean the way carries one direction of traffic. */
function isOneway(value: string | undefined): boolean {
  return value === 'yes' || value === 'true' || value === '1' || value === '-1';
}

/** A street dropped by {@link BuildOptions.trimEdgeSnippets}. */
export interface TrimmedStreet {
  /** OSM name, when the way had one. */
  name?: string;
  /** On-page (clipped) length, converted to ground metres. */
  lengthM: number;
}

/** A polyline exactly as drawn (merged, clipped, simplified) — what the labeller
 *  must anchor to, so dots land on the rendered line, not the raw OSM geometry. */
export interface DrawnLine {
  name?: string;
  points: PointMm[];
  /** False for named non-streets (rail): an obstacle for label placement, never
   *  a label target. Undefined/true = an ordinary street the labeller may use. */
  labelable?: boolean;
}

/** A point feature (POI) projected onto the page, inside the clip — the anchor a
 *  POI badge is placed on. Badge content is decided downstream (by label style). */
export interface PlacedPoi {
  name?: string;
  point: PointMm;
}

export interface BuildResult {
  scene: Scene;
  /** Streets removed by edge-snippet trimming, longest first (empty otherwise). */
  trimmed: TrimmedStreet[];
  /** Every stroked line as drawn, in page mm (for label placement). */
  drawnLines: DrawnLine[];
  /** POI anchors inside the page (for badge placement), in draw order. */
  pois: PlacedPoi[];
}

function pathLengthMm(points: PointMm[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** Distance from a point to the nearest edge of the rect (0 on the boundary). */
function distToBoundary(p: PointMm, r: RectMm): number {
  return Math.min(p.x - r.minX, r.maxX - p.x, p.y - r.minY, r.maxY - p.y);
}

const pointInRect = (p: PointMm, r: RectMm): boolean =>
  p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;

/** The single page-mm point that stands for a POI feature: the node itself, or
 *  the centroid of an area/line tagged as a POI. Null for empty geometry. */
function representativePoint(geom: Geometry, proj: Projector): PointMm | null {
  if (geom.type === 'Point') return proj.toPage(geom.coordinates);
  const coords = geom.coordinates;
  if (coords.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const c of coords) {
    const p = proj.toPage(c);
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / coords.length, y: sy / coords.length };
}

/** Grid key so coincident OSM nodes (shared junctions) hash together. */
function vertexKey(p: PointMm): string {
  return `${Math.round(p.x / CONNECT_TOL_MM)},${Math.round(p.y / CONNECT_TOL_MM)}`;
}

/** A clipped line part awaiting simplification, kept with its source feature so
 *  connectivity can be judged across features. */
interface LinePart {
  featureId: string;
  name?: string;
  points: PointMm[];
  stroke: { widthMm: number; dashMm?: number[] };
  minLengthMm?: number;
  ties?: { lengthMm: number; spacingMm: number; widthMm: number };
  labelable?: boolean;
}

/** Real-world footprint (m²) of a projected outer ring, from its on-page area and
 *  the map scale: 1 mm on paper is `scaleDenominator` mm on the ground, so
 *  1 mm² on paper is (scaleDenominator/1000)² m². Uses the whole (unclipped) ring,
 *  so the size test reflects the real feature, not the slice that fell on-page. */
function groundAreaM2(ring: PointMm[], scaleDenominator: number): number {
  let cross = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    cross += p.x * q.y - q.x * p.y;
  }
  const mPerMm = scaleDenominator / 1000;
  return (Math.abs(cross) / 2) * mPerMm * mPerMm;
}

/** Generate a tactile fill pattern (dots / hatch) over an axis-aligned rect. */
function fillTexture(fill: AreaFill, rect: RectMm): Primitive[] {
  if (fill.kind === 'dots') return dotFill(rect, { spacingMm: fill.spacingMm, radiusMm: fill.radiusMm });
  if (fill.kind === 'crosshatch')
    return crossHatchFill(rect, { spacingMm: fill.spacingMm, angleDeg: fill.angleDeg, widthMm: fill.widthMm });
  return hatchFill(rect, { spacingMm: fill.spacingMm, angleDeg: fill.angleDeg, widthMm: fill.widthMm });
}

/**
 * Shade a polygon area: a texture clipped to the outer ring minus any holes
 * (islands stay flat), plus an optional outline on every shore (outer + holes).
 * The texture is generated only over the outer ring's on-page bounding box
 * (clamped to `clip`) so off-page parts cost nothing; boundaries are clipped to
 * the page. Returns [] when the area falls entirely outside the page.
 */
function buildArea(outer: PointMm[], holes: PointMm[][], symbol: AreaSymbology, clip: RectMm): Primitive[] {
  const xs = outer.map((p) => p.x);
  const ys = outer.map((p) => p.y);
  const bbox: RectMm = {
    minX: Math.max(clip.minX, Math.min(...xs)),
    minY: Math.max(clip.minY, Math.min(...ys)),
    maxX: Math.min(clip.maxX, Math.max(...xs)),
    maxY: Math.min(clip.maxY, Math.max(...ys)),
  };
  if (bbox.maxX <= bbox.minX || bbox.maxY <= bbox.minY) return []; // off page
  const out: Primitive[] = clipTextureToArea(fillTexture(symbol.fill, bbox), outer, holes);
  if (symbol.outlineMm) {
    // Rings already close (first point repeats), so clip them as open paths.
    for (const ring of [outer, ...holes]) {
      for (const part of clipPolylineToRect(ring, clip, false)) {
        out.push({ kind: 'path', points: part, closed: false, stroke: { widthMm: symbol.outlineMm } });
      }
    }
  }
  return out;
}

/**
 * Turn classified features into scene primitives in page millimetres, clipped to
 * the printable rectangle `clip` (the page inset by its margins).
 *
 * Generalization: each clipped part is Douglas–Peucker simplified (drops
 * sub-tactile wiggle); a part shorter than its rule's minLengthMm is dropped
 * only when it is *isolated* (shares no node with another street). A sub-tactile
 * stub clipped off at the boundary still goes, but a short fragment inside a
 * continuous road connects to its neighbours at junctions and stays — otherwise
 * the per-part filter would punch gaps into streets (dense OSM splits a road
 * into many ways, some only a millimetre or two long on the page).
 *
 * With {@link BuildOptions.trimEdgeSnippets}, a street part is also dropped when
 * all of these hold: it touches the page edge, it is shorter than a third of the
 * page width, and it shares no node with any other street on the page — i.e. a
 * fragment clipped off at the boundary that leads nowhere.
 *
 * Area features (polygons: parks, water) are shaded with a tactile texture and
 * drawn *under* the line network. They are emitted in z order (classify sorts
 * ascending), so a higher-z water area lays over a lower-z park.
 *
 * TODO (next slices):
 *   - enforce minimum feature *separation* (displace crowded parallels)
 */
export function buildScene(
  classified: ClassifiedFeature[],
  proj: Projector,
  clip: RectMm,
  opts: BuildOptions = {},
): BuildResult {
  const tol = opts.simplifyToleranceMm ?? DEFAULT_SIMPLIFY_MM;
  const trim = opts.trimEdgeSnippets ?? false;

  // Project every line feature to a full page-mm polyline, tagged with what the
  // dual-carriageway merge needs (name, oneway). Done before clipping so the
  // merge sees whole carriageways, not page-edge fragments. Area features are
  // shaded here and collected to draw beneath the lines.
  const ways: Way[] = [];
  const railWays: Way[] = []; // rail tracks, set aside for corridor merging
  const areaPrimitives: Primitive[] = [];
  const pois: PlacedPoi[] = [];
  for (const { feature, rule } of classified) {
    if (rule.symbol.type === 'area') {
      if (feature.geometry.type === 'Polygon') {
        const outer = feature.geometry.coordinates.map((c) => proj.toPage(c));
        const minA = rule.symbol.minAreaM2;
        if (minA == null || groundAreaM2(outer, proj.scaleDenominator) >= minA) {
          const holes = (feature.geometry.holes ?? []).map((h) => h.map((c) => proj.toPage(c)));
          areaPrimitives.push(...buildArea(outer, holes, rule.symbol, clip));
        }
      }
      continue;
    }
    if (rule.symbol.type === 'poi') {
      // A POI sits at a single point: the node itself, or the centroid of an
      // area/line tagged as one (a station mapped as a building, say). Keep only
      // those inside the page — the badge is drawn there downstream.
      const point = representativePoint(feature.geometry, proj);
      if (point && pointInRect(point, clip)) pois.push({ name: feature.tags.name, point });
      continue;
    }
    if (feature.geometry.type === 'Point') continue; // a point can't be a traced line
    const way: Way = {
      featureId: feature.id,
      name: feature.tags.name,
      oneway: isOneway(feature.tags.oneway),
      points: feature.geometry.coordinates.map((c) => proj.toPage(c)),
      isPolygon: feature.geometry.type === 'Polygon',
      stroke: { widthMm: rule.symbol.widthMm, dashMm: rule.symbol.dashMm },
      minLengthMm: rule.symbol.minLengthMm,
      ties: rule.symbol.ties,
      labelable: rule.labelable,
    };
    // Rail tracks (the ones carrying a tie decoration) are bundled and collapsed
    // to one centerline per corridor before clipping; everything else passes
    // straight through.
    (way.ties ? railWays : ways).push(way);
  }
  if (railWays.length) {
    if (opts.mergeRail === false) {
      ways.push(...railWays);
    } else {
      const proto = railWays[0]; // rail symbology is uniform; reuse it for the centerlines
      const centerlines = mergeRailCorridors(
        railWays.map((w) => w.points),
        { corridorMm: opts.railCorridorMm },
      );
      centerlines.forEach((points, i) => {
        ways.push({
          featureId: `rail-corridor/${i}`,
          oneway: false,
          points,
          isPolygon: false,
          stroke: proto.stroke,
          minLengthMm: proto.minLengthMm,
          ties: proto.ties,
          labelable: proto.labelable,
        });
      });
    }
  }
  const merged = opts.collapseDualCarriageways ? collapseDualCarriageways(ways) : ways;

  // Clip into parts (kept pre-simplify so junction nodes survive for the
  // connectivity test below).
  const parts: LinePart[] = [];
  for (const w of merged) {
    for (const part of clipPolylineToRect(w.points, clip, w.isPolygon)) {
      parts.push({ featureId: w.featureId, name: w.name, points: part, stroke: w.stroke, minLengthMm: w.minLengthMm, ties: w.ties, labelable: w.labelable });
    }
  }

  // Connectivity index: vertex → the set of features that own a node there.
  // Built unconditionally — both edge-snippet trimming and the connectivity-aware
  // minLength drop below use it to tell a real junction from a dead-end sliver.
  const ownersByVertex = new Map<string, Set<string>>();
  for (const part of parts) {
    for (const p of part.points) {
      const key = vertexKey(p);
      let owners = ownersByVertex.get(key);
      if (!owners) ownersByVertex.set(key, (owners = new Set()));
      owners.add(part.featureId);
    }
  }
  const maxSnippetLenMm = proj.page.widthMm / 3;
  const connectsToOtherStreet = (part: LinePart): boolean =>
    part.points.some((p) => {
      const owners = ownersByVertex.get(vertexKey(p));
      return owners ? [...owners].some((id) => id !== part.featureId) : false;
    });
  const isEdgeSnippet = (part: LinePart): boolean =>
    part.points.some((p) => distToBoundary(p, clip) <= EDGE_TOL_MM) &&
    pathLengthMm(part.points) < maxSnippetLenMm &&
    !connectsToOtherStreet(part);

  const primitives: Primitive[] = [...areaPrimitives]; // areas first → beneath the lines
  const drawnLines: DrawnLine[] = [];
  const trimmed: TrimmedStreet[] = [];
  for (const part of parts) {
    if (trim && isEdgeSnippet(part)) {
      trimmed.push({ name: part.name, lengthM: groundMeters(pathLengthMm(part.points), proj.scaleDenominator) });
      continue;
    }
    const simplified = simplify(part.points, tol);
    // Drop a sub-threshold part only when it is an *isolated* sliver — one that
    // shares no node with another street. A short fragment in the middle of a
    // continuous road connects to its neighbours at a junction, so it stays;
    // dropping it would break the street. A clipped-off stub that leads nowhere
    // has no such neighbour and is dropped, as before.
    if (part.minLengthMm && pathLengthMm(simplified) < part.minLengthMm && !connectsToOtherStreet(part)) {
      continue;
    }
    const path: PathPrimitive = { kind: 'path', points: simplified, closed: false, stroke: part.stroke };
    primitives.push(path);
    // Rail and friends carry cross-ties over the centre stroke.
    if (part.ties) {
      primitives.push(
        ...ladderAlongPath(simplified, { tieLengthMm: part.ties.lengthMm, tieSpacingMm: part.ties.spacingMm, widthMm: part.ties.widthMm }),
      );
    }
    drawnLines.push({ name: part.name, points: simplified, labelable: part.labelable });
  }
  trimmed.sort((a, b) => b.lengthM - a.lengthM);
  const scene: Scene = { widthMm: proj.page.widthMm, heightMm: proj.page.heightMm, primitives };
  return { scene, trimmed, drawnLines, pois };
}
