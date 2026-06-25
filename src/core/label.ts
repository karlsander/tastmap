import { cellsWidthMm, layoutCells } from './braille/dots';
import { MARBURG_MEDIUM } from './braille/spec';
import type { BrailleCell } from './braille/translate';
import { clipPolylineToRect, printableRect } from './geo/clip';
import { getPageDimensions, uniformMargins } from './geo/paper';
import type { Projector } from './geo/projection';
import type { PaperSize, PointMm, RectMm } from './geo/types';
import { createPage } from './scene/layout';
import type { DotPrimitive, Scene } from './scene/types';
import type { ClassifiedFeature } from './style/classify';

/**
 * Keyed braille labelling. Direct names on a tactile map cost too much space, so
 * each named feature gets a short braille *key* (a, b, c, …) placed on the map,
 * and a separate legend page maps each key to the full name (braille + ink).
 *
 * Translation is pluggable (the {@link import('./braille/translate').Translator}
 * interface) — swap the placeholder for liblouis without touching placement or
 * the legend. Braille geometry is exact Marburg Medium spec.
 */

type Translate = (text: string) => BrailleCell[];

/** Height of one braille line (top dot row to bottom dot edge), millimetres. */
const GLYPH_H = 2 * MARBURG_MEDIUM.dotPitchMm + MARBURG_MEDIUM.dotDiameterMm;
/** Minimum clear space between two placed labels so they read apart. */
const LABEL_GAP_MM = 2;
/** How far a label sits off its anchor point. */
const ANCHOR_OFFSET_MM = 1.5;
/** Default cap so a dense map doesn't become an unreadable thicket of keys. */
export const DEFAULT_MAX_LABELS = 50;

export interface LabelCandidate {
  name: string;
  /** On-page anchor (page mm) — a point on the feature to key. */
  anchor: PointMm;
  /** Longest on-page run of the feature; used to prioritise prominent features. */
  prominence: number;
}

export interface PlacedLabel {
  key: string;
  name: string;
  bbox: RectMm;
  dots: DotPrimitive[];
}

export interface PlaceResult {
  placed: PlacedLabel[];
  dropped: number;
}

function pathLengthMm(pts: PointMm[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** Point at half the arc length along a polyline (so it lies on the line). */
function midpoint(pts: PointMm[]): PointMm {
  if (pts.length === 1) return pts[0];
  const half = pathLengthMm(pts) / 2;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + d >= half && d > 0) {
      const t = (half - acc) / d;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    acc += d;
  }
  return pts[pts.length - 1];
}

/**
 * One candidate per distinct name, anchored on its longest on-page run, sorted
 * most-prominent first.
 */
export function collectLabelCandidates(classified: ClassifiedFeature[], proj: Projector, clip: RectMm): LabelCandidate[] {
  const best = new Map<string, { pts: PointMm[]; len: number }>();
  for (const { feature } of classified) {
    const name = feature.tags.name;
    if (!name) continue;
    if (feature.geometry.type === 'Point') continue; // points aren't traced for keyed labels
    const projected = feature.geometry.coordinates.map((c) => proj.toPage(c));
    const parts = clipPolylineToRect(projected, clip, feature.geometry.type === 'Polygon');
    for (const part of parts) {
      const len = pathLengthMm(part);
      const cur = best.get(name);
      if (len > 0 && (!cur || len > cur.len)) best.set(name, { pts: part, len });
    }
  }
  return [...best.entries()]
    .map(([name, b]) => ({ name, anchor: midpoint(b.pts), prominence: b.len }))
    .sort((a, b) => b.prominence - a.prominence);
}

/** Bijective base-26 key: 0→a, 25→z, 26→aa, 27→ab, … */
export function keyFor(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function inside(b: RectMm, clip: RectMm): boolean {
  return b.minX >= clip.minX - 1e-6 && b.maxX <= clip.maxX + 1e-6 && b.minY >= clip.minY - 1e-6 && b.maxY <= clip.maxY + 1e-6;
}

function overlaps(a: RectMm, b: RectMm, gap: number): boolean {
  return !(a.maxX + gap < b.minX || b.maxX + gap < a.minX || a.maxY + gap < b.minY || b.maxY + gap < a.minY);
}

/**
 * Assign contiguous keys and place each as braille near its anchor, trying a few
 * offsets and skipping (dropping) any that would collide or leave the page.
 * Most-prominent candidates are placed first, so dense areas drop minor features.
 */
export function placeLabels(
  candidates: LabelCandidate[],
  clip: RectMm,
  translate: Translate,
  maxLabels = DEFAULT_MAX_LABELS,
): PlaceResult {
  const placed: PlacedLabel[] = [];
  let dropped = 0;
  for (const cand of candidates) {
    if (placed.length >= maxLabels) {
      dropped++;
      continue;
    }
    const key = keyFor(placed.length);
    const cells = translate(key);
    const w = cellsWidthMm(cells.length);
    // Try four quadrants around the anchor (off the feature so they don't merge).
    const offsets = [
      { x: ANCHOR_OFFSET_MM, y: -GLYPH_H - ANCHOR_OFFSET_MM },
      { x: ANCHOR_OFFSET_MM, y: ANCHOR_OFFSET_MM },
      { x: -w - ANCHOR_OFFSET_MM, y: -GLYPH_H - ANCHOR_OFFSET_MM },
      { x: -w - ANCHOR_OFFSET_MM, y: ANCHOR_OFFSET_MM },
    ];
    let chosen: RectMm | null = null;
    for (const off of offsets) {
      const minX = cand.anchor.x + off.x;
      const minY = cand.anchor.y + off.y;
      const bbox: RectMm = { minX, minY, maxX: minX + w, maxY: minY + GLYPH_H };
      if (!inside(bbox, clip)) continue;
      if (placed.some((pl) => overlaps(bbox, pl.bbox, LABEL_GAP_MM))) continue;
      chosen = bbox;
      break;
    }
    if (!chosen) {
      dropped++;
      continue;
    }
    placed.push({ key, name: cand.name, bbox: chosen, dots: layoutCells(cells, { x: chosen.minX, y: chosen.minY }) });
  }
  return { placed, dropped };
}

/** One or more portrait legend pages mapping each key to its full name. */
export function buildLegendScenes(placed: PlacedLabel[], paper: PaperSize, marginMm: number, translate: Translate): Scene[] {
  if (placed.length === 0) return [];
  const dim = getPageDimensions(paper, 'portrait');
  const area = printableRect(dim, uniformMargins(marginMm));
  const entryH = GLYPH_H + 3 + 3; // braille line + ink line + gap
  const titleSpace = 5 + 4;
  const rowsPerPage = Math.max(1, Math.floor((area.maxY - area.minY - titleSpace) / entryH));
  const scenes: Scene[] = [];
  for (let i = 0; i < placed.length; i += rowsPerPage) {
    scenes.push(legendPage(placed.slice(i, i + rowsPerPage), dim, area, translate, i === 0));
  }
  return scenes;
}

function legendPage(entries: PlacedLabel[], dim: { widthMm: number; heightMm: number }, area: RectMm, translate: Translate, first: boolean): Scene {
  const p = createPage(area, dim.widthMm, dim.heightMm);
  p.heading(first ? 'Legend / Zeichenerklarung' : 'Legend (continued)', 5, 4);
  const cellPitch = MARBURG_MEDIUM.cellPitchMm;
  for (const e of entries) {
    const top = p.y;
    const keyCells = translate(e.key);
    p.add(...layoutCells(keyCells, { x: area.minX, y: top }));
    const nameX = area.minX + cellsWidthMm(keyCells.length) + cellPitch;
    // Truncate the braille name to what fits; the ink line below always shows it whole.
    const nameCells = translate(e.name.toLowerCase());
    const avail = area.maxX - nameX;
    const fitCount = Math.max(0, Math.floor((avail - MARBURG_MEDIUM.dotPitchMm - MARBURG_MEDIUM.dotDiameterMm) / cellPitch) + 1);
    p.add(...layoutCells(nameCells.slice(0, Math.min(nameCells.length, fitCount)), { x: nameX, y: top }));
    p.text(`${e.key}  ${e.name}`, area.minX, top + GLYPH_H + 3, 2.8);
    p.advance(GLYPH_H + 3 + 3);
  }
  return p.scene();
}
