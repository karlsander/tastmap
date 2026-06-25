import { simplify } from '../geo/simplify';
import type { PointMm } from '../geo/types';

/**
 * Collapse divided roads ("dual carriageways") to a single centerline — a
 * topology/graph approach, so junctions read as *streets crossing*, not lanes.
 *
 * In dense OSM data a divided avenue is mapped as two `oneway` ways, one per
 * direction, sharing a `name` and running parallel a few metres apart. Earlier
 * attempts worked on geometry alone: nudging vertices onto a midline (wobbled),
 * or rasterising to a medial axis (forked at every junction, because the skeleton
 * faithfully traces the median opening where the carriageways splay around a
 * crossing). Both fought the data instead of reading its structure.
 *
 * Here we read the structure:
 *
 *   1. **Chain** — within each `name`, stitch the carriageway segments (split at
 *      every cross-street) back into long polylines. A cross-street node is
 *      degree-2 *within the name subgraph* (only the two carriageway segments
 *      carry the name), so a chain runs straight through junctions; it stops only
 *      at the road's own forks (slip roads, median U-turns), which are degree ≠ 2.
 *   2. **Pair** — match the two chains of a divided road by lateral proximity +
 *      parallelism over a shared run. Greedy, each chain pairs at most once.
 *   3. **Midline** — resample one chain by arc length and average each sample with
 *      the nearest point on its twin. One smooth centerline per street, with no
 *      per-vertex wobble and — crucially — no fork, since the median opening is
 *      just a brief widening along a single resampled run, not a topology split.
 *   4. **Heal** — snap the cross-streets that met a now-removed carriageway onto
 *      the new midline, so a T-junction or crossing lands *on* the centerline.
 *
 * The collapse is strictly **name-scoped**: only same-named carriageways ever
 * fuse, so two different streets — including the one crossing this road — are
 * never merged. Everything is page millimetres; thresholds are distances on paper.
 */

export interface Way {
  featureId: string;
  name?: string;
  oneway: boolean;
  points: PointMm[];
  isPolygon: boolean;
  stroke: { widthMm: number; dashMm?: number[] };
  minLengthMm?: number;
  /** Cross-tie decoration (rail lines): drawn over the centre stroke. */
  ties?: { lengthMm: number; spacingMm: number; widthMm: number };
  /** False for named non-streets (rail) — they obstruct label placement but are
   *  never themselves a label target. Undefined/true = an ordinary street. */
  labelable?: boolean;
}

export interface CollapseOptions {
  /** Max on-paper gap between twin carriageways to fuse them as one road (mm). */
  maxSeparationMm?: number;
  /** Min gap to count as a twin — below this it's the same line / digitising noise. */
  minSeparationMm?: number;
  /** Min |cos(angle)| between the two chains to accept them as a parallel pair. */
  minParallelCos?: number;
  /** Fraction of the shorter chain that must run alongside its twin to pair them. */
  minOverlapFrac?: number;
  /** Arc-length step for resampling the midline (mm). */
  stepMm?: number;
  /** Vertices within this distance are treated as the same junction node (mm). */
  nodeTolMm?: number;
  /** Chaikin smoothing passes applied to the midline. */
  smoothPasses?: number;
}

const DEFAULT_MAX_SEPARATION_MM = 14;
const DEFAULT_MIN_SEPARATION_MM = 0.5;
const DEFAULT_MIN_PARALLEL_COS = 0.6;
const DEFAULT_MIN_OVERLAP_FRAC = 0.3;
const DEFAULT_STEP_MM = 1.5;
const DEFAULT_NODE_TOL_MM = 0.2;
const DEFAULT_SMOOTH_PASSES = 1;

// — vector helpers (page mm) —
const sub = (p: PointMm, q: PointMm): PointMm => ({ x: p.x - q.x, y: p.y - q.y });
const add = (p: PointMm, q: PointMm): PointMm => ({ x: p.x + q.x, y: p.y + q.y });
const scale = (p: PointMm, s: number): PointMm => ({ x: p.x * s, y: p.y * s });
const dot = (p: PointMm, q: PointMm): number => p.x * q.x + p.y * q.y;
const dist = (p: PointMm, q: PointMm): number => Math.hypot(p.x - q.x, p.y - q.y);
const midpoint = (p: PointMm, q: PointMm): PointMm => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const lerp = (a: PointMm, b: PointMm, t: number): PointMm => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const unit = (p: PointMm): PointMm => {
  const n = Math.hypot(p.x, p.y);
  return n === 0 ? { x: 0, y: 0 } : { x: p.x / n, y: p.y / n };
};

/** Resample a polyline at ~`step` arc-length intervals, keeping both endpoints. */
function resample(pts: PointMm[], step: number): PointMm[] {
  if (pts.length <= 1) return [...pts];
  const out = [pts[0]];
  let acc = 0;
  let nextAt = step;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = dist(a, b);
    while (segLen > 0 && acc + segLen >= nextAt) {
      out.push(lerp(a, b, (nextAt - acc) / segLen));
      nextAt += step;
    }
    acc += segLen;
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > 1e-9) out.push(last);
  return out;
}

/** Closest point on a polyline to `p`, with the unit direction of that segment. */
function nearestOnPolyline(p: PointMm, pts: PointMm[]): { q: PointMm; dist: number; dir: PointMm } {
  let best = { q: pts[0], dist: Infinity, dir: { x: 0, y: 0 } };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const ab = sub(b, a);
    const len2 = dot(ab, ab);
    const t = len2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2)) : 0;
    const q = add(a, scale(ab, t));
    const d = dist(p, q);
    if (d < best.dist) best = { q, dist: d, dir: unit(ab) };
  }
  return best;
}

/**
 * Chaikin corner-cutting: round a polyline's interior corners while pinning the
 * endpoints, so the residual angular jog where a median briefly opens becomes a
 * gentle curve. Each pass replaces every edge with points at ¼ and ¾ along it.
 */
function chaikin(points: PointMm[], passes: number): PointMm[] {
  let pts = points;
  for (let p = 0; p < passes && pts.length >= 3; p++) {
    const next: PointMm[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      next.push(lerp(a, b, 0.25), lerp(a, b, 0.75));
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

interface Chain {
  points: PointMm[];
  widthMm: number;
  dashMm?: number[];
  minLengthMm?: number;
  labelable?: boolean;
}

/**
 * Stitch a name group's carriageway segments into maximal chains. Two segments
 * join at a shared endpoint only where that node is degree-2 *within the group*
 * (exactly those two segments) — so a chain runs through cross-street junctions
 * but stops at the road's own forks, keeping each carriageway a separate chain.
 */
function buildChains(ways: Way[], tol: number): Chain[] {
  const key = (p: PointMm): string => `${Math.round(p.x / tol)},${Math.round(p.y / tol)}`;
  const index = new Map<string, { wi: number; atStart: boolean }[]>();
  const addEnd = (k: string, wi: number, atStart: boolean): void => {
    const list = index.get(k);
    if (list) list.push({ wi, atStart });
    else index.set(k, [{ wi, atStart }]);
  };
  ways.forEach((w, i) => {
    addEnd(key(w.points[0]), i, true);
    addEnd(key(w.points[w.points.length - 1]), i, false);
  });
  const degree = (k: string): number => index.get(k)?.length ?? 0;
  const used = new Array(ways.length).fill(false);
  const nextUnusedAt = (k: string): { wi: number; atStart: boolean } | null =>
    index.get(k)?.find((e) => !used[e.wi]) ?? null;

  const chains: Chain[] = [];
  for (let i = 0; i < ways.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let pts = [...ways[i].points];
    let widthMm = ways[i].stroke.widthMm;
    let minLengthMm = ways[i].minLengthMm;
    const dashMm = ways[i].stroke.dashMm;
    const labelable = ways[i].labelable;
    const absorb = (w: Way): void => {
      widthMm = Math.max(widthMm, w.stroke.widthMm);
      if (w.minLengthMm != null && (minLengthMm == null || w.minLengthMm < minLengthMm)) minLengthMm = w.minLengthMm;
    };
    // Extend forward from the tail, then backward from the head, only through
    // degree-2 nodes (a clean continuation of this single carriageway).
    for (;;) {
      const k = key(pts[pts.length - 1]);
      if (degree(k) !== 2) break;
      const e = nextUnusedAt(k);
      if (!e) break;
      used[e.wi] = true;
      absorb(ways[e.wi]);
      const wp = ways[e.wi].points;
      pts.push(...(e.atStart ? wp : [...wp].reverse()).slice(1));
    }
    for (;;) {
      const k = key(pts[0]);
      if (degree(k) !== 2) break;
      const e = nextUnusedAt(k);
      if (!e) break;
      used[e.wi] = true;
      absorb(ways[e.wi]);
      const wp = ways[e.wi].points;
      pts = [...(e.atStart ? [...wp].reverse() : wp).slice(0, -1), ...pts];
    }
    chains.push({ points: pts, widthMm, dashMm, minLengthMm, labelable });
  }
  return chains;
}

/** Fraction of `a`'s length that runs within [minSep, maxSep] of, and roughly
 *  parallel to, `b`. Used to decide whether two chains are twin carriageways. */
function overlapFraction(a: PointMm[], b: PointMm[], step: number, minSep: number, maxSep: number, minCos: number): number {
  const samples = resample(a, step);
  if (samples.length < 2) return 0;
  let near = 0;
  for (let i = 0; i < samples.length; i++) {
    const { dist: d, dir: dirB } = nearestOnPolyline(samples[i], b);
    if (d < minSep || d > maxSep) continue;
    const prev = samples[Math.max(0, i - 1)];
    const nextS = samples[Math.min(samples.length - 1, i + 1)];
    const dirA = unit(sub(nextS, prev));
    if (Math.abs(dot(dirA, dirB)) >= minCos) near++;
  }
  return near / samples.length;
}

/** Raw (unsmoothed) midline of two carriageways: resample the longer chain and
 *  pull each sample halfway to the nearest point on its twin (within `maxSep`;
 *  elsewhere the sample stays put — a brief splay, not a fork). */
function pairMidline(a: PointMm[], b: PointMm[], o: Required<CollapseOptions>): PointMm[] {
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  return resample(long, o.stepMm).map((s) => {
    const { q, dist: d } = nearestOnPolyline(s, short);
    return d <= o.maxSeparationMm ? midpoint(s, q) : s;
  });
}

/** Blend one more carriageway `c` into a midline already averaging `weight`
 *  carriageways: each point moves a 1/(weight+1) share toward `c`, so a third
 *  lane recentres the line on the true middle of the bundle instead of a lopsided
 *  pairwise average. Points with no `c` within `maxSep` stay put. */
function absorbMidline(mid: PointMm[], c: PointMm[], weight: number, o: Required<CollapseOptions>): PointMm[] {
  return mid.map((p) => {
    const { q, dist: d } = nearestOnPolyline(p, c);
    return d <= o.maxSeparationMm ? lerp(p, q, 1 / (weight + 1)) : p;
  });
}

const smallerMinLen = (a?: number, b?: number): number | undefined =>
  a == null ? b : b == null ? a : Math.min(a, b);

export function collapseDualCarriageways(ways: Way[], opts: CollapseOptions = {}): Way[] {
  const o: Required<CollapseOptions> = {
    maxSeparationMm: opts.maxSeparationMm ?? DEFAULT_MAX_SEPARATION_MM,
    minSeparationMm: opts.minSeparationMm ?? DEFAULT_MIN_SEPARATION_MM,
    minParallelCos: opts.minParallelCos ?? DEFAULT_MIN_PARALLEL_COS,
    minOverlapFrac: opts.minOverlapFrac ?? DEFAULT_MIN_OVERLAP_FRAC,
    stepMm: opts.stepMm ?? DEFAULT_STEP_MM,
    nodeTolMm: opts.nodeTolMm ?? DEFAULT_NODE_TOL_MM,
    smoothPasses: opts.smoothPasses ?? DEFAULT_SMOOTH_PASSES,
  };

  // Split into merge candidates (named one-way polylines) and everything else.
  const others: Way[] = [];
  const byName = new Map<string, Way[]>();
  for (const w of ways) {
    if (w.oneway && w.name && !w.isPolygon && w.points.length >= 2) {
      const list = byName.get(w.name);
      if (list) list.push(w);
      else byName.set(w.name, [w]);
    } else {
      others.push(w);
    }
  }

  const merged: Way[] = [];
  // nodeKey of a consumed carriageway vertex → its projection on the new midline,
  // so cross-streets that met the old carriageway can be healed onto the centerline.
  const heal = new Map<string, PointMm>();
  const healKey = (p: PointMm): string => `${Math.round(p.x / o.nodeTolMm)},${Math.round(p.y / o.nodeTolMm)}`;

  for (const [name, group] of byName) {
    const chains = buildChains(group, o.nodeTolMm);
    const paired = new Array(chains.length).fill(false);

    // A bundle of carriageways collapsed into one centerline. `members` are the
    // source chain indices (for healing); `points` is the running raw midline.
    interface Bundle {
      points: PointMm[];
      weight: number;
      members: number[];
      widthMm: number;
      dashMm?: number[];
      minLengthMm?: number;
      labelable?: boolean;
    }
    const bundles: Bundle[] = [];

    // 1. Seed bundles from the best two-chain pairs (greedy, each chain once).
    const candidates: { i: number; j: number; score: number }[] = [];
    for (let i = 0; i < chains.length; i++) {
      for (let j = i + 1; j < chains.length; j++) {
        const fAB = overlapFraction(chains[i].points, chains[j].points, o.stepMm, o.minSeparationMm, o.maxSeparationMm, o.minParallelCos);
        const fBA = overlapFraction(chains[j].points, chains[i].points, o.stepMm, o.minSeparationMm, o.maxSeparationMm, o.minParallelCos);
        const score = Math.max(fAB, fBA);
        if (score >= o.minOverlapFrac) candidates.push({ i, j, score });
      }
    }
    candidates.sort((p, q) => q.score - p.score);
    for (const { i, j } of candidates) {
      if (paired[i] || paired[j]) continue;
      paired[i] = true;
      paired[j] = true;
      const a = chains[i];
      const b = chains[j];
      bundles.push({
        points: pairMidline(a.points, b.points, o),
        weight: 2,
        members: [i, j],
        widthMm: Math.max(a.widthMm, b.widthMm),
        dashMm: a.dashMm,
        minLengthMm: smallerMinLen(a.minLengthMm, b.minLengthMm),
        labelable: a.labelable,
      });
    }

    // 2. Absorb leftover chains (3rd, 4th… carriageways of a wide road, ramps at
    //    an interchange) into whichever bundle they run alongside, recentring the
    //    midline each time. Loop until a pass absorbs nothing.
    for (let changed = true; changed; ) {
      changed = false;
      for (let k = 0; k < chains.length; k++) {
        if (paired[k]) continue;
        let best = -1;
        let bestScore = o.minOverlapFrac;
        for (let g = 0; g < bundles.length; g++) {
          const f = Math.max(
            overlapFraction(chains[k].points, bundles[g].points, o.stepMm, o.minSeparationMm, o.maxSeparationMm, o.minParallelCos),
            overlapFraction(bundles[g].points, chains[k].points, o.stepMm, o.minSeparationMm, o.maxSeparationMm, o.minParallelCos),
          );
          if (f >= bestScore) {
            bestScore = f;
            best = g;
          }
        }
        if (best < 0) continue;
        const bnd = bundles[best];
        bnd.points = absorbMidline(bnd.points, chains[k].points, bnd.weight, o);
        bnd.weight += 1;
        bnd.members.push(k);
        bnd.widthMm = Math.max(bnd.widthMm, chains[k].widthMm);
        bnd.minLengthMm = smallerMinLen(bnd.minLengthMm, chains[k].minLengthMm);
        paired[k] = true;
        changed = true;
      }
    }

    // 3. Emit one smoothed centerline per bundle; heal its members onto it.
    for (const bnd of bundles) {
      const points = chaikin(simplify(bnd.points, 0.3), o.smoothPasses);
      for (const m of bnd.members) {
        for (const v of chains[m].points) heal.set(healKey(v), nearestOnPolyline(v, points).q);
      }
      merged.push({
        featureId: `${name}~carriageway/${merged.length}`,
        name,
        oneway: false, // the merged centerline no longer carries a single direction
        points,
        isPolygon: false,
        stroke: { widthMm: bnd.widthMm, dashMm: bnd.dashMm },
        minLengthMm: bnd.minLengthMm,
        labelable: bnd.labelable,
      });
    }

    // Unpaired chains (undivided one-ways, lone carriageways) pass through whole.
    chains.forEach((c, idx) => {
      if (paired[idx]) return;
      merged.push({
        featureId: `${name}~chain/${merged.length}`,
        name,
        oneway: false,
        points: c.points,
        isPolygon: false,
        stroke: { widthMm: c.widthMm, dashMm: c.dashMm },
        minLengthMm: c.minLengthMm,
        labelable: c.labelable,
      });
    });
  }

  // Heal the rest: snap any vertex that sat on a removed carriageway node onto the
  // midline, then drop consecutive duplicates so a healed cross-street meets the
  // centerline cleanly instead of stopping a lane-width short of it.
  const healed = others.map((w) => {
    if (heal.size === 0) return w;
    const out: PointMm[] = [];
    for (const p of w.points) {
      const snapped = heal.get(healKey(p)) ?? p;
      if (out.length === 0 || dist(out[out.length - 1], snapped) > 1e-9) out.push(snapped);
    }
    return out.length >= 2 || w.isPolygon ? { ...w, points: out } : w;
  });

  return [...healed, ...merged];
}
