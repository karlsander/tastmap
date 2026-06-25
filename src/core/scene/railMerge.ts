import { simplify } from '../geo/simplify';
import type { PointMm } from '../geo/types';

/**
 * Collapse a bundle of parallel railway tracks into one centerline per corridor.
 *
 * OSM maps each running track as its own way, so a double-track line, a station
 * throat, or a junction fan reads as a pile of near-parallel lines — far more
 * detail than a tactile map (or its reader) wants. We don't care how many tracks
 * there are or how they branch around stations; we want one line down the middle
 * of each corridor.
 *
 * This is the classic *area collapse to centerline* generalization, done in
 * raster space (robust, pure-TS, no polygon-skeleton library — well suited to the
 * coarse tactile target):
 *
 *   1. **Buffer + union** — rasterize every track thick (stamp a disk of radius
 *      `corridorMm/2` along each segment) onto a shared bitmap. Tracks closer than
 *      `corridorMm` overlap into a single blob; the station throat melts into one
 *      fat region.
 *   2. **Skeleton** — Zhang–Suen thinning erodes each blob to a 1-px medial line.
 *   3. **Vectorize** — trace the skeleton's pixel chains into polylines, splitting
 *      at junctions (degree ≠ 2) and following loops (a ring line).
 *   4. **Prune** — drop the short barbs thinning leaves at blob ends / junctions,
 *      then re-trace.
 *
 * Everything is page millimetres in and out. A single isolated track passes
 * through roughly unchanged (its blob thins back to itself).
 */

export interface RailMergeOptions {
  /** Tracks whose buffers overlap within this on-paper distance fuse into one
   *  corridor — the rasterised stamp diameter, mm. Larger = more aggressive. */
  corridorMm?: number;
  /** Raster resolution, page mm per pixel. Finer = smoother centerline, slower. */
  pxMm?: number;
  /** Prune skeleton branches (thinning barbs at blob ends / junctions) shorter
   *  than this, mm. */
  spurMm?: number;
  /** Cap on the larger raster dimension; `pxMm` is coarsened to stay under it so
   *  a huge extent can't blow up memory/time. */
  maxGridPx?: number;
}

const DEFAULTS = { corridorMm: 4, pxMm: 0.3, spurMm: 3, maxGridPx: 1600 };

export function mergeRailCorridors(lines: PointMm[][], opts: RailMergeOptions = {}): PointMm[][] {
  // Per-field defaults (not object-spread, so an explicit `undefined` doesn't
  // clobber a default — e.g. `{ corridorMm: opts.railCorridorMm }` from a caller).
  const o = {
    corridorMm: opts.corridorMm ?? DEFAULTS.corridorMm,
    pxMm: opts.pxMm ?? DEFAULTS.pxMm,
    spurMm: opts.spurMm ?? DEFAULTS.spurMm,
    maxGridPx: opts.maxGridPx ?? DEFAULTS.maxGridPx,
  };
  const pts = lines.filter((l) => l.length >= 1);
  if (pts.length === 0) return [];

  // Bounding box of all tracks, padded for the stamp + a couple of pixels.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of pts) {
    for (const p of l) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return [];
  const r = o.corridorMm / 2;
  const pad = r + 2 * o.pxMm;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  // Resolution, coarsened if the extent would exceed the grid cap.
  const wMm = maxX - minX;
  const hMm = maxY - minY;
  const pxMm = Math.max(o.pxMm, Math.max(wMm, hMm) / o.maxGridPx);
  const W = Math.max(1, Math.ceil(wMm / pxMm) + 1);
  const H = Math.max(1, Math.ceil(hMm / pxMm) + 1);
  const grid = new Uint8Array(W * H);
  const rPx = Math.max(0.75, r / pxMm); // never a zero-width stamp (degenerate input / extreme coarsening)
  const toPx = (p: PointMm): { x: number; y: number } => ({ x: (p.x - minX) / pxMm, y: (p.y - minY) / pxMm });

  // 1. Buffer + union: stamp every track thick onto the shared bitmap.
  for (const l of lines) {
    if (l.length === 1) {
      stampDisk(grid, W, H, toPx(l[0]), rPx);
      continue;
    }
    for (let i = 1; i < l.length; i++) stampSegment(grid, W, H, toPx(l[i - 1]), toPx(l[i]), rPx);
  }

  // 2. Skeleton.
  thin(grid, W, H);

  // 3 + 4. Vectorize, prune barbs, re-vectorize until stable.
  const spurPx = o.spurMm / pxMm;
  let edges = vectorize(grid, W, H);
  for (let it = 0; it < 3; it++) {
    if (!pruneBarbs(grid, W, H, edges, rPx, spurPx)) break;
    edges = vectorize(grid, W, H);
  }

  // Back to page mm; smooth the pixel staircase.
  const tol = pxMm * 1.5;
  const out: PointMm[][] = [];
  for (const e of edges) {
    const mm = e.map((idx) => ({ x: minX + (idx % W) * pxMm, y: minY + Math.floor(idx / W) * pxMm }));
    const s = simplify(mm, tol);
    if (s.length >= 2) out.push(s);
  }
  return out;
}

/** Set every pixel within `rPx` of `c`. */
function stampDisk(grid: Uint8Array, W: number, H: number, c: { x: number; y: number }, rPx: number): void {
  const r2 = rPx * rPx;
  const i0 = Math.max(0, Math.floor(c.x - rPx));
  const i1 = Math.min(W - 1, Math.ceil(c.x + rPx));
  const j0 = Math.max(0, Math.floor(c.y - rPx));
  const j1 = Math.min(H - 1, Math.ceil(c.y + rPx));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i - c.x;
      const dy = j - c.y;
      if (dx * dx + dy * dy <= r2) grid[j * W + i] = 1;
    }
  }
}

/** Set every pixel within `rPx` of segment a–b (a thick stroke). */
function stampSegment(grid: Uint8Array, W: number, H: number, a: { x: number; y: number }, b: { x: number; y: number }, rPx: number): void {
  const i0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - rPx));
  const i1 = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x) + rPx));
  const j0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - rPx));
  const j1 = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y) + rPx));
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const r2 = rPx * rPx;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      let t = len2 > 0 ? ((i - a.x) * abx + (j - a.y) * aby) / len2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const dx = i - (a.x + abx * t);
      const dy = j - (a.y + aby * t);
      if (dx * dx + dy * dy <= r2) grid[j * W + i] = 1;
    }
  }
}

/** Zhang–Suen thinning to a 1-px skeleton, in place. */
function thin(grid: Uint8Array, W: number, H: number): void {
  const get = (i: number, j: number): number => (i < 0 || j < 0 || i >= W || j >= H ? 0 : grid[j * W + i]);
  const toDelete: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      toDelete.length = 0;
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          if (grid[j * W + i] === 0) continue;
          const p2 = get(i, j - 1);
          const p3 = get(i + 1, j - 1);
          const p4 = get(i + 1, j);
          const p5 = get(i + 1, j + 1);
          const p6 = get(i, j + 1);
          const p7 = get(i - 1, j + 1);
          const p8 = get(i - 1, j);
          const p9 = get(i - 1, j - 1);
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let a = 0;
          for (let k = 0; k < 8; k++) if (seq[k] === 0 && seq[k + 1] === 1) a++;
          if (a !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          toDelete.push(j * W + i);
        }
      }
      if (toDelete.length) {
        changed = true;
        for (const idx of toDelete) grid[idx] = 0;
      }
    }
  }
}

/**
 * Skeleton-graph neighbours of pixel `idx`. 8-connected, but a *diagonal* link is
 * dropped when an orthogonal neighbour already bridges it (an "L" shortcut), so a
 * staircased diagonal line stays a clean degree-2 chain instead of sprouting
 * false degree-3 junctions that would shatter it into hundreds of tiny edges.
 */
function neighbours(grid: Uint8Array, W: number, H: number, idx: number): number[] {
  const i = idx % W;
  const j = Math.floor(idx / W);
  const g = (x: number, y: number): number => (x < 0 || y < 0 || x >= W || y >= H ? 0 : grid[y * W + x]);
  const N = g(i, j - 1);
  const E = g(i + 1, j);
  const S = g(i, j + 1);
  const Wd = g(i - 1, j);
  const out: number[] = [];
  if (N) out.push(idx - W);
  if (E) out.push(idx + 1);
  if (S) out.push(idx + W);
  if (Wd) out.push(idx - 1);
  if (g(i + 1, j - 1) && !(E || N)) out.push(idx - W + 1); // NE
  if (g(i + 1, j + 1) && !(E || S)) out.push(idx + W + 1); // SE
  if (g(i - 1, j + 1) && !(Wd || S)) out.push(idx + W - 1); // SW
  if (g(i - 1, j - 1) && !(Wd || N)) out.push(idx - W - 1); // NW
  return out;
}

/**
 * Trace the skeleton into polylines (arrays of pixel indices). Chains of degree-2
 * pixels become edges, split at endpoints (degree 1) and junctions (degree ≥ 3);
 * pure loops with no such node are walked separately.
 */
function vectorize(grid: Uint8Array, W: number, H: number): number[][] {
  const BIG = W * H;
  const deg = (idx: number): number => neighbours(grid, W, H, idx).length;
  const visited = new Set<number>(); // directed first-steps a*BIG+b
  const covered = new Set<number>(); // interior pixels already on an edge
  const edges: number[][] = [];

  // Node-anchored edges.
  for (let idx = 0; idx < BIG; idx++) {
    if (!grid[idx]) continue;
    const d = deg(idx);
    if (d === 2 || d === 0) continue; // not a node
    for (const v of neighbours(grid, W, H, idx)) {
      if (visited.has(idx * BIG + v)) continue;
      visited.add(idx * BIG + v);
      const path = [idx, v];
      covered.add(v);
      let prev = idx;
      let cur = v;
      while (cur !== idx && deg(cur) === 2) {
        const next = neighbours(grid, W, H, cur).find((n) => n !== prev);
        if (next === undefined) break;
        prev = cur;
        cur = next;
        path.push(cur);
        covered.add(cur);
      }
      visited.add(cur * BIG + path[path.length - 2]); // block the reverse trace
      edges.push(path);
    }
  }

  // Pure loops (no node): remaining degree-2 pixels.
  for (let idx = 0; idx < BIG; idx++) {
    if (!grid[idx] || covered.has(idx) || deg(idx) !== 2) continue;
    const path = [idx];
    covered.add(idx);
    let prev = -1;
    let cur = idx;
    for (;;) {
      const ns = neighbours(grid, W, H, cur).filter((n) => n !== prev);
      const next = ns.find((n) => !covered.has(n));
      if (next === undefined) {
        if (ns.includes(idx)) path.push(idx); // close the ring
        break;
      }
      prev = cur;
      cur = next;
      path.push(cur);
      covered.add(cur);
    }
    if (path.length >= 3) edges.push(path);
  }

  return edges;
}

/** Pixel length (px) of an index path, counting diagonals as √2. */
function pathLenPx(edge: number[], W: number): number {
  let len = 0;
  for (let k = 1; k < edge.length; k++) {
    const dx = (edge[k] % W) - (edge[k - 1] % W);
    const dy = Math.floor(edge[k] / W) - Math.floor(edge[k - 1] / W);
    len += Math.hypot(dx, dy);
  }
  return len;
}

/**
 * Erase skeleton junk: a *junction barb* (a branch from a junction, degree ≥ 3,
 * to a dead end, degree 1) is a thinning artefact bounded by the corridor
 * half-width, so prune it only when shorter than `barbPx` — a *longer* dead-end
 * arm is a real track terminus that happens to join near a junction, and is kept.
 * An isolated *speck* (a free-floating fragment, both ends degree 1) below the
 * tactile floor `speckPx` is dropped outright. The junction pixel is preserved so
 * the through-line stays connected. Returns whether anything was erased.
 */
function pruneBarbs(grid: Uint8Array, W: number, H: number, edges: number[][], barbPx: number, speckPx: number): boolean {
  const deg = (idx: number): number => neighbours(grid, W, H, idx).length;
  let pruned = false;
  for (const e of edges) {
    if (e.length < 2) continue;
    const dA = deg(e[0]);
    const dB = deg(e[e.length - 1]);
    const len = pathLenPx(e, W);
    const junctionBarb = (dA === 1 && dB >= 3) || (dB === 1 && dA >= 3);
    const speck = dA === 1 && dB === 1;
    if (!((junctionBarb && len < barbPx) || (speck && len < speckPx))) continue;
    const keep = dA >= 3 ? e[0] : dB >= 3 ? e[e.length - 1] : -1;
    for (const idx of e) if (idx !== keep) grid[idx] = 0;
    pruned = true;
  }
  return pruned;
}
