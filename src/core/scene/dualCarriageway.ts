import type { PointMm } from '../geo/types';

/**
 * Collapse divided roads ("dual carriageways") to a single centerline.
 *
 * In dense OSM data a divided avenue is mapped as two separate `oneway` ways —
 * one per direction — that share a `name` and run parallel a few metres apart.
 * On a tactile map that reads as two roads. We fix it in two steps:
 *
 *   1. **Fold**: move every vertex of a candidate way to the midpoint between it
 *      and the nearest parallel segment of another same-named way (its twin
 *      carriageway), when one is within `maxSeparationMm`. Both carriageways
 *      thus land on the median between them. Ways are kept whole — no splitting
 *      — so the line never fragments (and survives the min-length filter).
 *   2. **Dedupe**: the two carriageways now trace the same median line, so drop
 *      a folded way when it is nearly coincident with one already kept.
 *
 * Everything is in page millimetres, so the thresholds are distances *on paper*
 * — scale-independent, and exactly the right semantic (carriageways far apart
 * at a large scale stay separate). Un-paired stretches — undivided sections, or
 * the splayed ends where a median opens up — simply don't fold and pass through.
 */

export interface Way {
  featureId: string;
  name?: string;
  oneway: boolean;
  points: PointMm[];
  isPolygon: boolean;
  stroke: { widthMm: number; dashMm?: number[] };
  minLengthMm?: number;
}

export interface CollapseOptions {
  /** Max on-paper gap to the twin carriageway to treat as one road (mm). */
  maxSeparationMm?: number;
  /** Min gap to count as a twin — below this it's the way's own continuation. */
  minSeparationMm?: number;
  /** Min |cos(angle)| between two segments to count as roughly parallel. */
  minParallelCos?: number;
  /** A folded way is dropped when this fraction of its vertices lie within
   *  `coincidentMm` of an already-kept same-named way. */
  coincidentMm?: number;
  coverageToDrop?: number;
  /** Endpoints of same-named survivors within this distance are joined into one
   *  polyline, so seam pieces aren't lost to the min-length filter (mm). */
  joinToleranceMm?: number;
}

const DEFAULT_MAX_SEPARATION_MM = 10;
const DEFAULT_MIN_SEPARATION_MM = 1;
const DEFAULT_MIN_PARALLEL_COS = 0.6;
const DEFAULT_COINCIDENT_MM = 1.2;
const DEFAULT_COVERAGE_TO_DROP = 0.7;
const DEFAULT_JOIN_TOLERANCE_MM = 1.5;

interface Seg {
  featureId: string;
  a: PointMm;
  b: PointMm;
  dir: PointMm; // unit a→b
}

const sub = (p: PointMm, q: PointMm): PointMm => ({ x: p.x - q.x, y: p.y - q.y });
const add = (p: PointMm, q: PointMm): PointMm => ({ x: p.x + q.x, y: p.y + q.y });
const scale = (p: PointMm, s: number): PointMm => ({ x: p.x * s, y: p.y * s });
const dot = (p: PointMm, q: PointMm): number => p.x * q.x + p.y * q.y;
const midpoint = (p: PointMm, q: PointMm): PointMm => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const norm = (p: PointMm): number => Math.hypot(p.x, p.y);

/** Foot-of-perpendicular parameter `t` and perpendicular distance from `p` to
 *  segment a–b. `t` in [0,1] means the foot lies within the segment. */
function projectToSegment(p: PointMm, a: PointMm, b: PointMm): { t: number; dist: number } {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return { t: -1, dist: Infinity };
  const t = dot(sub(p, a), ab) / len2;
  const foot = add(a, scale(ab, t));
  return { t, dist: norm(sub(p, foot)) };
}

/** Foot of the perpendicular from `p` to the infinite line through a–b. */
function projectToLine(p: PointMm, a: PointMm, b: PointMm): PointMm {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return a;
  return add(a, scale(ab, dot(sub(p, a), ab) / len2));
}

/** Distance from `p` to segment a–b, clamped to the segment ends. */
function distToSegment(p: PointMm, a: PointMm, b: PointMm): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return norm(sub(p, a));
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  return norm(sub(p, add(a, scale(ab, t))));
}

/** Join same-named survivors that meet end-to-end into continuous polylines, so
 *  no seam piece is later dropped by the min-length filter. Endpoints within
 *  `tol` are treated as the same node. */
function joinByProximity(ways: Way[], tol: number): Way[] {
  if (ways.length <= 1) return ways;
  const key = (p: PointMm): string => `${Math.round(p.x / tol)},${Math.round(p.y / tol)}`;
  const used = new Array(ways.length).fill(false);

  // endpoint key → ways that start/end there
  const index = new Map<string, { idx: number; atStart: boolean }[]>();
  const addEnd = (k: string, idx: number, atStart: boolean): void => {
    const list = index.get(k);
    if (list) list.push({ idx, atStart });
    else index.set(k, [{ idx, atStart }]);
  };
  ways.forEach((w, i) => {
    addEnd(key(w.points[0]), i, true);
    addEnd(key(w.points[w.points.length - 1]), i, false);
  });
  const findUnused = (k: string): { idx: number; atStart: boolean } | null => {
    for (const e of index.get(k) ?? []) if (!used[e.idx]) return e;
    return null;
  };

  const out: Way[] = [];
  for (let i = 0; i < ways.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let pts = [...ways[i].points];
    for (;;) {
      const e = findUnused(key(pts[pts.length - 1]));
      if (!e) break;
      used[e.idx] = true;
      const wp = ways[e.idx].points;
      pts.push(...(e.atStart ? wp : [...wp].reverse()).slice(1));
    }
    for (;;) {
      const e = findUnused(key(pts[0]));
      if (!e) break;
      used[e.idx] = true;
      const wp = ways[e.idx].points;
      pts = [...(e.atStart ? [...wp].reverse() : wp).slice(0, -1), ...pts];
    }
    out.push({ ...ways[i], points: pts });
  }
  return out;
}

/** Local travel direction of a polyline at vertex `i` (unit, forward-biased). */
function localDir(points: PointMm[], i: number): PointMm | null {
  const next = i < points.length - 1 ? sub(points[i + 1], points[i]) : sub(points[i], points[i - 1]);
  const len = norm(next);
  return len === 0 ? null : scale(next, 1 / len);
}

export function collapseDualCarriageways(ways: Way[], opts: CollapseOptions = {}): Way[] {
  const maxSep = opts.maxSeparationMm ?? DEFAULT_MAX_SEPARATION_MM;
  const minSep = opts.minSeparationMm ?? DEFAULT_MIN_SEPARATION_MM;
  const minCos = opts.minParallelCos ?? DEFAULT_MIN_PARALLEL_COS;
  const coincident = opts.coincidentMm ?? DEFAULT_COINCIDENT_MM;
  const coverageToDrop = opts.coverageToDrop ?? DEFAULT_COVERAGE_TO_DROP;
  const joinTol = opts.joinToleranceMm ?? DEFAULT_JOIN_TOLERANCE_MM;

  // Only named, oneway polylines are candidates; everything else is untouched.
  const out: Way[] = [];
  const byName = new Map<string, Way[]>();
  for (const w of ways) {
    if (w.oneway && w.name && !w.isPolygon && w.points.length >= 2) {
      const list = byName.get(w.name);
      if (list) list.push(w);
      else byName.set(w.name, [w]);
    } else {
      out.push(w);
    }
  }

  for (const group of byName.values()) {
    if (group.length < 2) {
      out.push(...group);
      continue;
    }

    // 1. Chain the raw ways into whole carriageway lines first — consecutive
    //    ways share exact junction nodes, so this is reliable and gives the fold
    //    long, continuous input (no fragmentation, no min-length losses later).
    const chains = joinByProximity(group, joinTol);
    if (chains.length < 2) {
      out.push(...chains); // only one carriageway present → nothing to merge
      continue;
    }

    // Segments of every chain, so each chain can find its twin on another chain.
    const segs: Seg[] = [];
    for (const c of chains) {
      for (let i = 0; i < c.points.length - 1; i++) {
        const d = sub(c.points[i + 1], c.points[i]);
        const len = norm(d);
        if (len === 0) continue;
        segs.push({ featureId: c.featureId, a: c.points[i], b: c.points[i + 1], dir: scale(d, 1 / len) });
      }
    }

    // 2. Fold each chain's vertices onto the median with its nearest twin.
    const folded: Way[] = chains.map((w) => {
      const dir0 = w.points.map((_, i) => localDir(w.points, i));
      const points = w.points.map((v, i) => {
        const dir = dir0[i];
        if (!dir) return v;
        let best: Seg | null = null;
        let bestDist = Infinity;
        for (const s of segs) {
          if (s.featureId === w.featureId) continue; // skip the way's own segments
          if (Math.abs(dot(dir, s.dir)) < minCos) continue; // not parallel
          const pr = projectToSegment(v, s.a, s.b);
          if (pr.t < 0 || pr.t > 1) continue; // no lateral overlap
          if (pr.dist < minSep || pr.dist > maxSep) continue; // self/continuation, or too far
          if (pr.dist < bestDist) {
            bestDist = pr.dist;
            best = s;
          }
        }
        return best ? midpoint(v, projectToLine(v, best.a, best.b)) : v;
      });
      return { ...w, points };
    });

    // 3. Drop a folded chain that now retraces one already kept (its twin).
    const kept: Way[] = [];
    for (const w of folded) {
      const covered = w.points.filter((p) =>
        kept.some((k) => {
          for (let i = 0; i < k.points.length - 1; i++) {
            if (distToSegment(p, k.points[i], k.points[i + 1]) <= coincident) return true;
          }
          return false;
        }),
      ).length;
      if (kept.length && covered / w.points.length >= coverageToDrop) continue;
      kept.push(w);
    }
    out.push(...kept);
  }

  return out;
}
