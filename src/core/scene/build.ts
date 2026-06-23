import { clipPolylineToRect } from '../geo/clip';
import { groundMeters, type Projector } from '../geo/projection';
import { simplify } from '../geo/simplify';
import type { PointMm, RectMm } from '../geo/types';
import type { ClassifiedFeature } from '../style/classify';
import { collapseDualCarriageways, type Way } from './dualCarriageway';
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
}

export interface BuildResult {
  scene: Scene;
  /** Streets removed by edge-snippet trimming, longest first (empty otherwise). */
  trimmed: TrimmedStreet[];
  /** Every stroked line as drawn, in page mm (for label placement). */
  drawnLines: DrawnLine[];
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
}

/**
 * Turn classified features into scene primitives in page millimetres, clipped to
 * the printable rectangle `clip` (the page inset by its margins).
 *
 * Generalization: each clipped part is Douglas–Peucker simplified (drops
 * sub-tactile wiggle); minLengthMm is then enforced per part, so a stroke that
 * survives clipping only as a sub-threshold sliver is dropped (it would not be
 * feel-able anyway).
 *
 * With {@link BuildOptions.trimEdgeSnippets}, a street part is also dropped when
 * all of these hold: it touches the page edge, it is shorter than a third of the
 * page width, and it shares no node with any other street on the page — i.e. a
 * fragment clipped off at the boundary that leads nowhere.
 *
 * TODO (next slices):
 *   - enforce minimum feature *separation* (displace crowded parallels)
 *   - area textures (hatch/dots) instead of solid fills
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
  // merge sees whole carriageways, not page-edge fragments.
  const ways: Way[] = [];
  for (const { feature, rule } of classified) {
    if (rule.symbol.type !== 'line') continue; // areas: TODO
    ways.push({
      featureId: feature.id,
      name: feature.tags.name,
      oneway: isOneway(feature.tags.oneway),
      points: feature.geometry.coordinates.map((c) => proj.toPage(c)),
      isPolygon: feature.geometry.type === 'Polygon',
      stroke: { widthMm: rule.symbol.widthMm, dashMm: rule.symbol.dashMm },
      minLengthMm: rule.symbol.minLengthMm,
    });
  }
  const merged = opts.collapseDualCarriageways ? collapseDualCarriageways(ways) : ways;

  // Clip into parts (kept pre-simplify so junction nodes survive for the
  // connectivity test below).
  const parts: LinePart[] = [];
  for (const w of merged) {
    for (const part of clipPolylineToRect(w.points, clip, w.isPolygon)) {
      parts.push({ featureId: w.featureId, name: w.name, points: part, stroke: w.stroke, minLengthMm: w.minLengthMm });
    }
  }

  // Connectivity index: vertex → the set of features that own a node there.
  const ownersByVertex = new Map<string, Set<string>>();
  if (trim) {
    for (const part of parts) {
      for (const p of part.points) {
        const key = vertexKey(p);
        let owners = ownersByVertex.get(key);
        if (!owners) ownersByVertex.set(key, (owners = new Set()));
        owners.add(part.featureId);
      }
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

  const primitives: Primitive[] = [];
  const drawnLines: DrawnLine[] = [];
  const trimmed: TrimmedStreet[] = [];
  for (const part of parts) {
    if (trim && isEdgeSnippet(part)) {
      trimmed.push({ name: part.name, lengthM: groundMeters(pathLengthMm(part.points), proj.scaleDenominator) });
      continue;
    }
    const simplified = simplify(part.points, tol);
    if (part.minLengthMm && pathLengthMm(simplified) < part.minLengthMm) continue;
    const path: PathPrimitive = { kind: 'path', points: simplified, closed: false, stroke: part.stroke };
    primitives.push(path);
    drawnLines.push({ name: part.name, points: simplified });
  }
  trimmed.sort((a, b) => b.lengthM - a.lengthM);
  const scene: Scene = { widthMm: proj.page.widthMm, heightMm: proj.page.heightMm, primitives };
  return { scene, trimmed, drawnLines };
}
