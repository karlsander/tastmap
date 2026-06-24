import { cellsWidthMm, layoutCells } from '../braille/dots';
import { MARBURG_MEDIUM } from '../braille/spec';
import { basicTranslator, type BrailleCell } from '../braille/translate';
import type { PointMm, RectMm } from '../geo/types';
import { arcPoints } from '../scene/lines';
import type { DrawnLine } from '../scene/build';
import type { DotPrimitive, Primitive } from '../scene/types';

/**
 * Place short road-code labels (e.g. "GWS") onto the map as braille, each tied
 * to its road by a leader line ending in a fat dot *on* the road.
 *
 * Hard rule: the anchor dot sits on a clear, straightish stretch of the *drawn*
 * road — never on a corner or intersection, where it couldn't be matched to one
 * road. Everything else is scored and the least-bad placement is always taken
 * (labels are never dropped).
 *
 * The placer is parameterised so different strategies can be compared:
 *   - `reachMode` — how far the label floats off the road:
 *       'short'    = the closest clear spot (shortest leader);
 *       'breathe'  = the furthest clear spot (most breathing room);
 *       'adaptive' = proportional to the free space beside the road.
 *   - `dirMode` — 'perp' (only the road's two normals) or 'all8' (eight throws).
 *   - `overlapHard` — reject any candidate whose footprint hits a placed label,
 *      vs. merely penalising it.
 *
 * Codes are translated letter-by-letter with the *uncontracted* basic translator
 * (not German Vollschrift): a code reads against the legend, so "chs" stays three
 * cells, never a contracted "ch"+"s".
 */

/** Height of one braille line (top dot row to bottom dot edge), millimetres. */
const GLYPH_H = 2 * MARBURG_MEDIUM.dotPitchMm + MARBURG_MEDIUM.dotDiameterMm;

export type ReachMode = 'short' | 'breathe' | 'adaptive';
export type DirMode = 'perp' | 'all8';

export interface RoadLabel {
  code: string;
  name: string;
  /** Bounding box of the braille dots. */
  brailleBox: RectMm;
  /** Full rendered footprint (braille + connector edge + margin) — used for
   *  collision so labels never visibly overlap, only their braille boxes. */
  footprint: RectMm;
  /** Fat dot on the road where the leader meets it. */
  anchor: PointMm;
  /** The single connector edge, on the road-facing side, offset off the dots. */
  edge: [PointMm, PointMm];
  /** Where the leader attaches to the connector edge. */
  leaderEnd: PointMm;
  dots: DotPrimitive[];
}

export interface RoadLabelResult {
  labels: RoadLabel[];
  dropped: string[];
}

export interface LabelWeights {
  clash: number;
  leaderStreet: number;
  leaderLabel: number;
  angle: number;
  overlap: number;
  /** Per-mm weight on the reach preference term (mode-dependent). */
  reach: number;
}

export interface RoadLabelOptions {
  gapMm?: number;
  maxLabels?: number;
  strokeMm?: number;
  anchorRadiusMm?: number;
  /** Gap between the dots and the connector edge (≈ one braille row). */
  edgeOffsetMm?: number;
  reachMode?: ReachMode;
  dirMode?: DirMode;
  overlapHard?: boolean;
  /** Reach increments (mm) tried beyond the geometric minimum. */
  reachStepsMm?: number[];
  weights?: Partial<LabelWeights>;
}

const DEFAULTS = {
  gapMm: 1.5,
  maxLabels: 200,
  strokeMm: 0.3,
  anchorRadiusMm: 1.6,
  edgeOffsetMm: 2.5,
  reachMode: 'short' as ReachMode,
  dirMode: 'all8' as DirMode,
  overlapHard: true,
  reachStepsMm: [0, 3, 6, 10, 15, 21],
};
const WEIGHTS: LabelWeights = { clash: 60, leaderStreet: 90, leaderLabel: 250, angle: 14, overlap: 1500, reach: 1.4 };

/** Shortest leader we'll draw (edge → anchor dot), millimetres. */
const MIN_LEADER_MM = 2.5;
/** Cap on how far adaptive/breathe will float a label off its road. */
const MAX_EXTRA_MM = 21;
/** White quiet zone knocked out around the braille box + connector on *every*
 *  side — including the three sides that have no connector edge — so the
 *  surrounding map texture (cross-hatch, road lines) never crowds the dots.
 *  Must exceed the dot radius, since `layoutCells` puts the first dot's centre on
 *  the box corner (dots poke ~one radius past the box on the top/left edge). A
 *  couple of millimetres reads as a deliberate margin under the fingertip. */
const KNOCK_MARGIN_MM = 2;

// Anchor-quality thresholds (mm / deg).
const SAMPLE_STEP_MM = 1.5;
const TANGENT_WIN_MM = 2;
const MIN_JUNCTION_CLEAR_MM = 5;
const MIN_CORNER_CLEAR_MM = 4;
const END_CLEAR_MM = 4;
const CORNER_THRESHOLD_DEG = 28;
const JUNCTION_TOL_MM = 0.4;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const sub = (p: PointMm, q: PointMm): PointMm => ({ x: p.x - q.x, y: p.y - q.y });
const add = (p: PointMm, q: PointMm): PointMm => ({ x: p.x + q.x, y: p.y + q.y });
const scale = (p: PointMm, s: number): PointMm => ({ x: p.x * s, y: p.y * s });
const norm = (p: PointMm): number => Math.hypot(p.x, p.y);
const dot = (p: PointMm, q: PointMm): number => p.x * q.x + p.y * q.y;
const distp = (p: PointMm, q: PointMm): number => Math.hypot(p.x - q.x, p.y - q.y);

function cumulative(pts: PointMm[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distp(pts[i - 1], pts[i]));
  return cum;
}
const totalLen = (pts: PointMm[]): number => cumulative(pts).at(-1) ?? 0;

function pointAtArc(pts: PointMm[], cum: number[], s: number): PointMm {
  const t = clamp(s, 0, cum.at(-1) ?? 0);
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] >= t) {
      const seg = cum[i] - cum[i - 1];
      const f = seg > 0 ? (t - cum[i - 1]) / seg : 0;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    }
  }
  return pts[pts.length - 1];
}

function tangentAtArc(pts: PointMm[], cum: number[], s: number, win: number): PointMm {
  const a = pointAtArc(pts, cum, s - win);
  const b = pointAtArc(pts, cum, s + win);
  const d = sub(b, a);
  const n = norm(d);
  return n > 0 ? scale(d, 1 / n) : { x: 1, y: 0 };
}

function cornerPositions(pts: PointMm[], cum: number[]): number[] {
  const cos = Math.cos((CORNER_THRESHOLD_DEG * Math.PI) / 180);
  const out: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = sub(pts[i], pts[i - 1]);
    const b = sub(pts[i + 1], pts[i]);
    const na = norm(a);
    const nb = norm(b);
    if (na === 0 || nb === 0) continue;
    if (dot(a, b) / (na * nb) < cos) out.push(cum[i]);
  }
  return out;
}

function rectsOverlap(a: RectMm, b: RectMm, gap: number): boolean {
  return !(a.maxX + gap < b.minX || b.maxX + gap < a.minX || a.maxY + gap < b.minY || b.maxY + gap < a.minY);
}
function inside(b: RectMm, clip: RectMm): boolean {
  return b.minX >= clip.minX - 1e-6 && b.maxX <= clip.maxX + 1e-6 && b.minY >= clip.minY - 1e-6 && b.maxY <= clip.maxY + 1e-6;
}
function pointInRect(p: PointMm, r: RectMm): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
}
function segsCross(p1: PointMm, p2: PointMm, p3: PointMm, p4: PointMm): boolean {
  const o = (a: PointMm, b: PointMm, c: PointMm): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return o(p3, p4, p1) > 0 !== o(p3, p4, p2) > 0 && o(p1, p2, p3) > 0 !== o(p1, p2, p4) > 0;
}
function segIntersectsRect(a: PointMm, b: PointMm, r: RectMm): boolean {
  if (pointInRect(a, r) || pointInRect(b, r)) return true;
  const c1 = { x: r.minX, y: r.minY };
  const c2 = { x: r.maxX, y: r.minY };
  const c3 = { x: r.maxX, y: r.maxY };
  const c4 = { x: r.minX, y: r.maxY };
  return segsCross(a, b, c1, c2) || segsCross(a, b, c2, c3) || segsCross(a, b, c3, c4) || segsCross(a, b, c4, c1);
}
function nearestOnSegment(p: PointMm, a: PointMm, b: PointMm): PointMm {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return a;
  const t = clamp(dot(sub(p, a), ab) / len2, 0, 1);
  return add(a, scale(ab, t));
}
/** Distance from `from` along unit `dir` to the nearest crossed segment (∞ if none). */
function rayHit(from: PointMm, dir: PointMm, segs: Segment[], cap: number): number {
  let best = cap;
  const far = add(from, scale(dir, cap));
  for (const s of segs) {
    if (!segsCross(from, far, s.a, s.b)) continue;
    // distance to intersection ≈ project segment crossing; approximate via param solve
    const r = dir;
    const sx = s.b.x - s.a.x;
    const sy = s.b.y - s.a.y;
    const denom = r.x * sy - r.y * sx;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((s.a.x - from.x) * sy - (s.a.y - from.y) * sx) / denom;
    if (t > 0 && t < best) best = t;
  }
  return best;
}

interface Segment {
  a: PointMm;
  b: PointMm;
  name?: string;
}

function findJunctions(lines: DrawnLine[]): PointMm[] {
  const key = (p: PointMm): string => `${Math.round(p.x / JUNCTION_TOL_MM)},${Math.round(p.y / JUNCTION_TOL_MM)}`;
  const owners = new Map<string, { p: PointMm; lines: Set<number> }>();
  lines.forEach((ln, idx) => {
    for (const p of ln.points) {
      const k = key(p);
      let e = owners.get(k);
      if (!e) owners.set(k, (e = { p, lines: new Set() }));
      e.lines.add(idx);
    }
  });
  const out: PointMm[] = [];
  for (const e of owners.values()) if (e.lines.size >= 2) out.push(e.p);
  for (const ln of lines) if (ln.points.length) out.push(ln.points[0], ln.points[ln.points.length - 1]);
  return out;
}

interface Anchor {
  p: PointMm;
  tangent: PointMm;
  clear: number;
}

function anchorsForRoad(pieces: PointMm[][], junctions: PointMm[]): Anchor[] {
  const longest = pieces.reduce((a, b) => (totalLen(b) > totalLen(a) ? b : a));
  const cum = cumulative(longest);
  const total = cum.at(-1) as number;
  if (total <= 0) return [];
  const corners = cornerPositions(longest, cum);
  const valid: Anchor[] = [];
  let fallback: Anchor | null = null;
  for (let s = 0; s <= total; s += SAMPLE_STEP_MM) {
    const p = pointAtArc(longest, cum, s);
    const jClear = junctions.reduce((m, j) => Math.min(m, distp(p, j)), Infinity);
    const cClear = corners.reduce((m, c) => Math.min(m, Math.abs(s - c)), Infinity);
    const endClear = Math.min(s, total - s);
    const clear = Math.min(jClear, cClear, endClear);
    const a: Anchor = { p, tangent: tangentAtArc(longest, cum, s, TANGENT_WIN_MM), clear };
    if (!fallback || clear > fallback.clear) fallback = a;
    if (endClear >= END_CLEAR_MM && jClear >= MIN_JUNCTION_CLEAR_MM && cClear >= MIN_CORNER_CLEAR_MM) valid.push(a);
  }
  if (valid.length === 0) return fallback ? [fallback] : [];
  return valid.sort((a, b) => b.clear - a.clear).slice(0, 8);
}

function directionsFor(tangent: PointMm, mode: DirMode): PointMm[] {
  const left: PointMm = { x: -tangent.y, y: tangent.x };
  const right: PointMm = { x: tangent.y, y: -tangent.x };
  if (mode === 'perp') return [left, right];
  const out: PointMm[] = [];
  const c = Math.SQRT1_2;
  let cur = left;
  for (let i = 0; i < 8; i++) {
    out.push(cur);
    cur = { x: cur.x * c - cur.y * c, y: cur.x * c + cur.y * c };
  }
  return out;
}

function brailleBoxAt(center: PointMm, w: number, h: number): RectMm {
  return { minX: center.x - w / 2, minY: center.y - h / 2, maxX: center.x + w / 2, maxY: center.y + h / 2 };
}
function connectorEdge(box: RectMm, anchor: PointMm, offset: number): [PointMm, PointMm] {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const adir = sub(anchor, { x: cx, y: cy });
  if (Math.abs(adir.x) >= Math.abs(adir.y)) {
    const x = adir.x <= 0 ? box.minX - offset : box.maxX + offset;
    return [{ x, y: box.minY }, { x, y: box.maxY }];
  }
  const y = adir.y <= 0 ? box.minY - offset : box.maxY + offset;
  return [{ x: box.minX, y }, { x: box.maxX, y }];
}
function footprintOf(box: RectMm, edge: [PointMm, PointMm]): RectMm {
  return {
    minX: Math.min(box.minX, edge[0].x, edge[1].x) - KNOCK_MARGIN_MM,
    minY: Math.min(box.minY, edge[0].y, edge[1].y) - KNOCK_MARGIN_MM,
    maxX: Math.max(box.maxX, edge[0].x, edge[1].x) + KNOCK_MARGIN_MM,
    maxY: Math.max(box.maxY, edge[0].y, edge[1].y) + KNOCK_MARGIN_MM,
  };
}

export function placeRoadLabels(
  lines: DrawnLine[],
  clip: RectMm,
  codeByName: Map<string, string>,
  opts: RoadLabelOptions = {},
): RoadLabelResult {
  const o = { ...DEFAULTS, ...opts };
  const w: LabelWeights = { ...WEIGHTS, ...(opts.weights ?? {}) };

  const segments: Segment[] = [];
  const piecesByName = new Map<string, PointMm[][]>();
  for (const ln of lines) {
    for (let i = 1; i < ln.points.length; i++) segments.push({ a: ln.points[i - 1], b: ln.points[i], name: ln.name });
    if (ln.name && codeByName.has(ln.name)) {
      const list = piecesByName.get(ln.name);
      if (list) list.push(ln.points);
      else piecesByName.set(ln.name, [ln.points]);
    }
  }
  const junctions = findJunctions(lines);
  const order = [...piecesByName.keys()].sort(
    (a, b) =>
      Math.max(...(piecesByName.get(b) as PointMm[][]).map(totalLen)) -
      Math.max(...(piecesByName.get(a) as PointMm[][]).map(totalLen)),
  );

  const labels: RoadLabel[] = [];
  const dropped: string[] = [];

  for (const name of order) {
    if (labels.length >= o.maxLabels) {
      dropped.push(name);
      continue;
    }
    const code = codeByName.get(name) as string;
    const cells = basicTranslator.translate(code.toLowerCase());
    const boxW = cellsWidthMm(cells.length);
    const boxH = GLYPH_H;
    const anchors = anchorsForRoad(piecesByName.get(name) as PointMm[][], junctions);
    if (anchors.length === 0) {
      dropped.push(name);
      continue;
    }
    const foreignSegs = segments.filter((s) => s.name !== name);

    type Cand = { box: RectMm; foot: RectMm; anchor: PointMm; edge: [PointMm, PointMm]; leaderEnd: PointMm; score: number };
    let chosen: Cand | null = null;
    for (const anchor of anchors) {
      for (const dir of directionsFor(anchor.tangent, o.dirMode)) {
        const support = Math.abs(dir.x) * (boxW / 2) + Math.abs(dir.y) * (boxH / 2);
        const minReach = support + o.edgeOffsetMm + MIN_LEADER_MM;
        // Free space beside the road along this throw (for adaptive reach).
        const clearance = rayHit(anchor.p, dir, foreignSegs, minReach + MAX_EXTRA_MM + 5);
        const targetExtra = clamp(clearance * 0.5 - support - o.edgeOffsetMm, 0, MAX_EXTRA_MM);
        for (const extra of o.reachStepsMm) {
          const reach = minReach + extra;
          const center = add(anchor.p, scale(dir, reach));
          const box = brailleBoxAt(center, boxW, boxH);
          if (!inside(box, clip)) continue;
          if (pointInRect(anchor.p, box)) continue;
          const edge = connectorEdge(box, anchor.p, o.edgeOffsetMm);
          const leaderEnd = nearestOnSegment(anchor.p, edge[0], edge[1]);
          const foot = footprintOf(box, edge);

          let overlapHits = 0;
          for (const l of labels) if (rectsOverlap(foot, l.footprint, o.gapMm)) overlapHits++;
          if (o.overlapHard && overlapHits > 0) continue;

          let score = overlapHits * w.overlap;
          for (const s of foreignSegs) {
            if (segIntersectsRect(s.a, s.b, box)) score += w.clash;
            if (segsCross(anchor.p, leaderEnd, s.a, s.b)) score += w.leaderStreet;
          }
          for (const l of labels) if (segsCross(anchor.p, leaderEnd, l.edge[0], l.edge[1])) score += w.leaderLabel;
          score += Math.abs(dot(dir, anchor.tangent)) * w.angle;
          // Reach preference per mode.
          if (o.reachMode === 'short') score += extra * w.reach;
          else if (o.reachMode === 'breathe') score += (MAX_EXTRA_MM - extra) * w.reach;
          else score += Math.abs(extra - targetExtra) * w.reach;

          if (!chosen || score < chosen.score - 1e-6) chosen = { box, foot, anchor: anchor.p, edge, leaderEnd, score };
        }
      }
    }
    if (!chosen) {
      dropped.push(name);
      continue;
    }
    const dots = layoutCells(cells, { x: chosen.box.minX, y: chosen.box.minY });
    labels.push({
      code,
      name,
      brailleBox: chosen.box,
      footprint: chosen.foot,
      anchor: chosen.anchor,
      edge: chosen.edge,
      leaderEnd: chosen.leaderEnd,
      dots,
    });
  }

  return { labels, dropped };
}

export function labelPrimitives(labels: RoadLabel[], opts: RoadLabelOptions = {}): Primitive[] {
  const strokeMm = opts.strokeMm ?? DEFAULTS.strokeMm;
  const anchorRadiusMm = opts.anchorRadiusMm ?? DEFAULTS.anchorRadiusMm;
  const knockouts: Primitive[] = labels.map((l) => ({
    kind: 'path',
    points: [
      { x: l.footprint.minX, y: l.footprint.minY },
      { x: l.footprint.maxX, y: l.footprint.minY },
      { x: l.footprint.maxX, y: l.footprint.maxY },
      { x: l.footprint.minX, y: l.footprint.maxY },
    ],
    closed: true,
    fillWhite: true,
  }));
  const connectors: Primitive[] = labels.flatMap((l) => [
    { kind: 'path', points: [l.anchor, l.leaderEnd], closed: false, stroke: { widthMm: strokeMm } },
    { kind: 'path', points: [l.edge[0], l.edge[1]], closed: false, stroke: { widthMm: strokeMm } },
    { kind: 'dot', center: l.anchor, radiusMm: anchorRadiusMm },
  ]);
  const braille: Primitive[] = labels.flatMap((l) => l.dots);
  return [...knockouts, ...connectors, ...braille];
}

/* ------------------------------------------------------------------------- *
 *  Single Character Index badges
 *
 *  An alternative to the leader-line acronym labels: drop a small rounded-rect
 *  badge holding ONE braille cell directly onto a clear stretch of the road,
 *  breaking the line at that point. The badge's white fill knocks out the road
 *  (and any texture) beneath it; the thin outline encloses the single cell. The
 *  cell is always upright — braille is orientation-sensitive — regardless of the
 *  road's direction. Anchor selection reuses {@link anchorsForRoad}, so badges
 *  land on the same clear, straight, junction-free stretches the acronym labels
 *  prefer; "least confusing" then also means: not overlapping another badge and
 *  not straddling a second street.
 * ------------------------------------------------------------------------- */

export interface RoadBadge {
  name: string;
  cell: BrailleCell;
  /** The rounded-rect outline bounds (also the collision/knockout footprint). */
  rect: RectMm;
  /** Centre of the badge — a point on the drawn road. */
  anchor: PointMm;
  dots: DotPrimitive[];
}

export interface RoadBadgeResult {
  badges: RoadBadge[];
  dropped: string[];
}

export interface RoadBadgeOptions {
  strokeMm?: number;
  /** Minimum clear gap between two badges, millimetres. */
  gapMm?: number;
  maxBadges?: number;
  /** Padding between the braille cell's dot extent and the outline. */
  padMm?: number;
  /** Corner radius of the rounded rect. */
  cornerMm?: number;
  /** Reject (vs. tolerate) a badge that can only sit overlapping another. */
  overlapHard?: boolean;
}

const BADGE_DEFAULTS = {
  strokeMm: 0.3,
  gapMm: 1.5,
  maxBadges: 200,
  padMm: 1.6,
  cornerMm: 1.5,
  overlapHard: true,
};

/** Outline points of a rounded rect (4 corner arcs joined by straight edges). */
function roundedRectPoints(rect: RectMm, r: number): PointMm[] {
  const w = rect.maxX - rect.minX;
  const h = rect.maxY - rect.minY;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) {
    return [
      { x: rect.minX, y: rect.minY },
      { x: rect.maxX, y: rect.minY },
      { x: rect.maxX, y: rect.maxY },
      { x: rect.minX, y: rect.maxY },
    ];
  }
  const n = 6;
  return [
    ...arcPoints(rect.minX + rr, rect.minY + rr, rr, 180, 270, n), // top-left
    ...arcPoints(rect.maxX - rr, rect.minY + rr, rr, 270, 360, n), // top-right
    ...arcPoints(rect.maxX - rr, rect.maxY - rr, rr, 0, 90, n), // bottom-right
    ...arcPoints(rect.minX + rr, rect.maxY - rr, rr, 90, 180, n), // bottom-left
  ];
}

/**
 * Place one single-cell badge on each named road in `cellByName`, centred on a
 * clear stretch of the *drawn* road. Most-prominent (longest) roads are placed
 * first so they claim the best spots; a road is dropped if no centred badge fits
 * on the page without overlapping an already-placed badge.
 */
export function placeRoadBadges(
  lines: DrawnLine[],
  clip: RectMm,
  cellByName: Map<string, BrailleCell>,
  opts: RoadBadgeOptions = {},
): RoadBadgeResult {
  const o = { ...BADGE_DEFAULTS, ...opts };
  const pitch = MARBURG_MEDIUM.dotPitchMm;
  const radius = MARBURG_MEDIUM.dotDiameterMm / 2;
  // Half-extents of the badge rect: the cell's dot grid (pitch wide × 2·pitch
  // tall) plus the dots' radius plus the inner padding, centred on the anchor.
  const halfW = pitch / 2 + radius + o.padMm;
  const halfH = pitch + radius + o.padMm;
  const rectAt = (c: PointMm): RectMm => ({ minX: c.x - halfW, minY: c.y - halfH, maxX: c.x + halfW, maxY: c.y + halfH });

  const segments: Segment[] = [];
  const piecesByName = new Map<string, PointMm[][]>();
  for (const ln of lines) {
    for (let i = 1; i < ln.points.length; i++) segments.push({ a: ln.points[i - 1], b: ln.points[i], name: ln.name });
    if (ln.name && cellByName.has(ln.name)) {
      const list = piecesByName.get(ln.name);
      if (list) list.push(ln.points);
      else piecesByName.set(ln.name, [ln.points]);
    }
  }
  const junctions = findJunctions(lines);
  const order = [...piecesByName.keys()].sort(
    (a, b) =>
      Math.max(...(piecesByName.get(b) as PointMm[][]).map(totalLen)) -
      Math.max(...(piecesByName.get(a) as PointMm[][]).map(totalLen)),
  );

  const badges: RoadBadge[] = [];
  const dropped: string[] = [];

  for (const name of order) {
    if (badges.length >= o.maxBadges) {
      dropped.push(name);
      continue;
    }
    const cell = cellByName.get(name) as BrailleCell;
    const anchors = anchorsForRoad(piecesByName.get(name) as PointMm[][], junctions);
    if (anchors.length === 0) {
      dropped.push(name);
      continue;
    }
    const foreignSegs = segments.filter((s) => s.name !== name);

    type Cand = { rect: RectMm; anchor: PointMm; overlaps: number; foreignHit: boolean };
    const cands: Cand[] = [];
    for (const a of anchors) {
      const rect = rectAt(a.p);
      if (!inside(rect, clip)) continue;
      let overlaps = 0;
      for (const b of badges) if (rectsOverlap(rect, b.rect, o.gapMm)) overlaps++;
      const foreignHit = foreignSegs.some((s) => segIntersectsRect(s.a, s.b, rect));
      cands.push({ rect, anchor: a.p, overlaps, foreignHit });
    }
    // anchors arrive best-clearance-first, so the first qualifying candidate is
    // the clearest. Prefer no-overlap & single-street; then no-overlap; finally,
    // when overlaps are tolerated, the clearest spot regardless.
    const pick =
      cands.find((c) => c.overlaps === 0 && !c.foreignHit) ??
      cands.find((c) => c.overlaps === 0) ??
      (o.overlapHard ? undefined : cands[0]);
    if (!pick) {
      dropped.push(name);
      continue;
    }
    const dots = layoutCells([cell], { x: pick.anchor.x - pitch / 2, y: pick.anchor.y - pitch });
    badges.push({ name, cell, rect: pick.rect, anchor: pick.anchor, dots });
  }

  return { badges, dropped };
}

export function badgePrimitives(badges: RoadBadge[], opts: RoadBadgeOptions = {}): Primitive[] {
  const strokeMm = opts.strokeMm ?? BADGE_DEFAULTS.strokeMm;
  const cornerMm = opts.cornerMm ?? BADGE_DEFAULTS.cornerMm;
  // One primitive per badge: a white-knockout rounded rect (severs the road and
  // clears texture under it) with a thin black outline. Dots drawn after, on top.
  const boxes: Primitive[] = badges.map((b) => ({
    kind: 'path',
    points: roundedRectPoints(b.rect, cornerMm),
    closed: true,
    fillWhite: true,
    stroke: { widthMm: strokeMm },
  }));
  const braille: Primitive[] = badges.flatMap((b) => b.dots);
  return [...boxes, ...braille];
}
