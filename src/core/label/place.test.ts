import { describe, expect, it } from 'vitest';
import type { PointMm, RectMm } from '../geo/types';
import type { DrawnLine } from '../scene/build';
import type { PathPrimitive } from '../scene/types';
import type { PlacedPoi } from '../scene/build';
import {
  badgePrimitives,
  mergePois,
  placePoiBadges,
  placeRoadBadges,
  placeRoadLabels,
  poiBadgePrimitives,
  type PoiInput,
} from './place';

const CLIP: RectMm = { minX: 0, minY: 0, maxX: 120, maxY: 120 };
const line = (name: string | undefined, pts: [number, number][]): DrawnLine => ({
  name,
  points: pts.map(([x, y]) => ({ x, y })),
});

function distToPolyline(p: PointMm, pts: PointMm[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t)));
  }
  return best;
}

describe('placeRoadLabels', () => {
  it('places a braille label anchored exactly on the drawn road', () => {
    const lines = [line('Greifswalder Straße', [[60, 5], [60, 115]])];
    const { labels, dropped } = placeRoadLabels(lines, CLIP, new Map([['Greifswalder Straße', 'GWS']]));

    expect(dropped).toEqual([]);
    expect(labels).toHaveLength(1);
    const l = labels[0];
    expect(l.code).toBe('GWS');
    expect(l.dots.length).toBe(11); // g(4)+w(4)+s(3)
    expect(distToPolyline(l.anchor, lines[0].points)).toBeLessThan(1e-6); // dot on the line
    // Box on the page; leader ends on the connector edge.
    expect(l.brailleBox.minX).toBeGreaterThanOrEqual(0);
    expect(l.brailleBox.maxX).toBeLessThanOrEqual(120);
    expect(distToPolyline(l.leaderEnd, [l.edge[0], l.edge[1]])).toBeLessThan(1e-6);
    // A real leader exists between dot and edge.
    expect(Math.hypot(l.anchor.x - l.leaderEnd.x, l.anchor.y - l.leaderEnd.y)).toBeGreaterThan(1);
  });

  it('keeps the anchor dot off corners and intersections', () => {
    // L-shaped road, 90° corner at (60,60); a cross street near it; arm ends are
    // endpoints (treated as junctions).
    const main = line('Main Straße', [[10, 60], [60, 60], [60, 110]]);
    const cross = line('Cross Weg', [[60, 35], [60, 85]]);
    const { labels } = placeRoadLabels([main, cross], CLIP, new Map([['Main Straße', 'MNS']]));

    expect(labels).toHaveLength(1);
    const a = labels[0].anchor;
    expect(distToPolyline(a, main.points)).toBeLessThan(1e-6); // still on the road
    expect(Math.hypot(a.x - 60, a.y - 60)).toBeGreaterThan(3.5); // off the corner
    expect(Math.hypot(a.x - 10, a.y - 60)).toBeGreaterThan(4.5); // off the endpoints
    expect(Math.hypot(a.x - 60, a.y - 110)).toBeGreaterThan(4.5);
  });

  it('throws the box to the clear side, away from other streets', () => {
    const lines = [
      line('Main Straße', [[60, 5], [60, 115]]),
      line('Wall A', [[66, 5], [66, 115]]),
      line('Wall B', [[70, 5], [70, 115]]),
      line('Wall C', [[74, 5], [74, 115]]),
    ];
    const { labels } = placeRoadLabels(lines, CLIP, new Map([['Main Straße', 'MNS']]));
    expect(labels).toHaveLength(1);
    const cx = (labels[0].brailleBox.minX + labels[0].brailleBox.maxX) / 2;
    expect(cx).toBeLessThan(60); // chose the empty (left) side
  });

  it('only labels coded roads and never drops a coded one with geometry', () => {
    const lines = [line('Main Straße', [[60, 5], [60, 115]]), line('Unnamed', [[20, 5], [20, 115]])];
    const { labels, dropped } = placeRoadLabels(lines, CLIP, new Map([['Main Straße', 'MNS']]));
    expect(labels.map((l) => l.name)).toEqual(['Main Straße']);
    expect(dropped).toEqual([]);
  });

  it('never anchors on a same-named non-labelable line (rail), only the street', () => {
    const road = line('Ringbahn', [[30, 45], [30, 75]]); // short street
    const rail: DrawnLine = { name: 'Ringbahn', points: [{ x: 90, y: 5 }, { x: 90, y: 115 }], labelable: false }; // longer rail, same name
    const { labels } = placeRoadLabels([road, rail], CLIP, new Map([['Ringbahn', 'RBN']]));
    expect(labels).toHaveLength(1);
    expect(distToPolyline(labels[0].anchor, road.points)).toBeLessThan(1e-6); // on the street, not the rail
  });
});

const within = (b: RectMm, clip: RectMm): boolean =>
  b.minX >= clip.minX - 1e-6 && b.maxX <= clip.maxX + 1e-6 && b.minY >= clip.minY - 1e-6 && b.maxY <= clip.maxY + 1e-6;

describe('placeRoadBadges', () => {
  it('puts an upright badge centred on a clear stretch of the drawn road', () => {
    const lines = [line('Greifswalder Straße', [[60, 5], [60, 115]])];
    const { badges, dropped } = placeRoadBadges(lines, CLIP, new Map([['Greifswalder Straße', [1, 2]]]));

    expect(dropped).toEqual([]);
    expect(badges).toHaveLength(1);
    const b = badges[0];
    // The badge sits on the road, and its outline is centred on that anchor.
    expect(distToPolyline(b.anchor, lines[0].points)).toBeLessThan(1e-6);
    expect((b.rect.minX + b.rect.maxX) / 2).toBeCloseTo(b.anchor.x, 6);
    expect((b.rect.minY + b.rect.maxY) / 2).toBeCloseTo(b.anchor.y, 6);
    expect(within(b.rect, CLIP)).toBe(true);
    // One braille cell ([1,2] = two dots), each dot inside the outline.
    expect(b.dots).toHaveLength(2);
    for (const d of b.dots) {
      expect(d.center.x).toBeGreaterThan(b.rect.minX);
      expect(d.center.x).toBeLessThan(b.rect.maxX);
      expect(d.center.y).toBeGreaterThan(b.rect.minY);
      expect(d.center.y).toBeLessThan(b.rect.maxY);
    }
  });

  it('renders each badge as a white-knockout rounded rect that breaks the line', () => {
    const lines = [line('Greifswalder Straße', [[60, 5], [60, 115]])];
    const { badges } = placeRoadBadges(lines, CLIP, new Map([['Greifswalder Straße', [1]]]));
    const prims = badgePrimitives(badges);
    const boxes = prims.filter((p): p is PathPrimitive => p.kind === 'path');
    const dots = prims.filter((p) => p.kind === 'dot');
    expect(boxes).toHaveLength(1);
    expect(dots).toHaveLength(1); // cell [1] = one dot
    const box = boxes[0];
    expect(box.closed).toBe(true);
    expect(box.fillWhite).toBe(true); // severs the road beneath + clears texture
    expect(box.stroke?.widthMm).toBeGreaterThan(0); // thin enclosing outline
  });

  it('places the longest road first and never overlaps two badges', () => {
    const lines = [
      line('Short Weg', [[40, 50], [40, 70]]),
      line('Long Straße', [[80, 5], [80, 115]]),
    ];
    const { badges, dropped } = placeRoadBadges(
      lines,
      CLIP,
      new Map([
        ['Short Weg', [1]],
        ['Long Straße', [1, 2]],
      ]),
    );
    expect(dropped).toEqual([]);
    expect(badges.map((b) => b.name)).toEqual(['Long Straße', 'Short Weg']); // prominence order
    // The two footprints don't overlap.
    const [a, b] = badges;
    const overlap = !(a.rect.maxX < b.rect.minX || b.rect.maxX < a.rect.minX || a.rect.maxY < b.rect.minY || b.rect.maxY < a.rect.minY);
    expect(overlap).toBe(false);
  });

  it('keeps the badge off corners and intersections', () => {
    const main = line('Main Straße', [[10, 60], [60, 60], [60, 110]]);
    const cross = line('Cross Weg', [[60, 35], [60, 85]]);
    const { badges } = placeRoadBadges([main, cross], CLIP, new Map([['Main Straße', [1]]]));
    expect(badges).toHaveLength(1);
    const a = badges[0].anchor;
    expect(distToPolyline(a, main.points)).toBeLessThan(1e-6); // still on the road
    expect(Math.hypot(a.x - 60, a.y - 60)).toBeGreaterThan(3.5); // off the corner / cross
  });

  it('never anchors on a same-named non-labelable line (rail), only the street', () => {
    const road = line('Ringbahn', [[30, 45], [30, 75]]); // short street
    const rail: DrawnLine = { name: 'Ringbahn', points: [{ x: 90, y: 5 }, { x: 90, y: 115 }], labelable: false }; // longer rail, same name
    const { badges } = placeRoadBadges([road, rail], CLIP, new Map([['Ringbahn', [1]]]));
    expect(badges).toHaveLength(1);
    expect(distToPolyline(badges[0].anchor, road.points)).toBeLessThan(1e-6); // on the street, not the rail
  });
});

const centred = (r: RectMm, p: PointMm): boolean =>
  Math.abs((r.minX + r.maxX) / 2 - p.x) < 1e-6 && Math.abs((r.minY + r.maxY) / 2 - p.y) < 1e-6;
const poi = (point: [number, number], code: string, cells: number[][]): PoiInput => ({
  name: code,
  point: { x: point[0], y: point[1] },
  code,
  cells,
});

describe('placePoiBadges', () => {
  it('centres a thick border on the POI, on the page', () => {
    const { badges, dropped } = placePoiBadges([poi([60, 60], 'a', [[1]])], CLIP);
    expect(dropped).toEqual([]);
    expect(badges).toHaveLength(1);
    const b = badges[0];
    expect(centred(b.border, b.anchor)).toBe(true);
    expect(within(b.border, CLIP)).toBe(true);
    expect(b.dots).toHaveLength(1); // cell [1] = one dot
    for (const d of b.dots) {
      expect(d.center.x).toBeGreaterThan(b.border.minX);
      expect(d.center.x).toBeLessThan(b.border.maxX);
    }
  });

  it('widens the badge for a longer label, keeping it centred', () => {
    const [one] = placePoiBadges([poi([60, 60], 'a', [[1]])], CLIP).badges;
    const [three] = placePoiBadges([poi([60, 60], 'abc', [[1], [1], [1]])], CLIP).badges;
    const w = (r: RectMm): number => r.maxX - r.minX;
    expect(w(three.border)).toBeGreaterThan(w(one.border)); // 3 cells need a wider box
    expect(centred(three.border, three.anchor)).toBe(true);
    expect(three.dots).toHaveLength(3);
  });

  it('drops a station whose badge would run off the page', () => {
    const { badges, dropped } = placePoiBadges([poi([1, 1], 'x', [[1]])], CLIP);
    expect(badges).toEqual([]);
    expect(dropped).toHaveLength(1);
  });

  it('still draws a bare marker box for an unnamed POI (empty label)', () => {
    const { badges } = placePoiBadges([poi([60, 60], '', [])], CLIP);
    expect(badges).toHaveLength(1);
    expect(badges[0].dots).toEqual([]); // empty box, sized as one cell
    expect(badges[0].border.maxX).toBeGreaterThan(badges[0].border.minX); // border still present
  });
});

const bboxOf = (pts: PointMm[]): RectMm => ({
  minX: Math.min(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxX: Math.max(...pts.map((p) => p.x)),
  maxY: Math.max(...pts.map((p) => p.y)),
});

describe('poiBadgePrimitives', () => {
  it('renders a sharp black frame with a white knocked-out interior, dots on top', () => {
    const { badges } = placePoiBadges([poi([60, 60], 'a', [[1, 2]])], CLIP);
    const prims = poiBadgePrimitives(badges);
    const paths = prims.filter((p): p is PathPrimitive => p.kind === 'path');
    const dots = prims.filter((p) => p.kind === 'dot');
    const black = paths.filter((p) => p.fill);
    const white = paths.filter((p) => p.fillWhite);
    expect(black).toHaveLength(1); // solid outer box (the border band, before the interior is cleared)
    expect(white).toHaveLength(1); // white interior knockout
    expect(black[0].stroke).toBeUndefined(); // filled, not stroked → true sharp corners
    expect(black[0].points).toHaveLength(4); // sharp box (no corner arcs)
    expect(white[0].points).toHaveLength(4);
    // The white interior sits inside the black box, leaving a 3 mm band all round.
    const bb = bboxOf(black[0].points);
    const wb = bboxOf(white[0].points);
    expect(wb.minX - bb.minX).toBeCloseTo(3, 5); // band width = borderMm
    expect(bb.maxY - wb.maxY).toBeCloseTo(3, 5);
    expect(dots).toHaveLength(2); // cell [1,2]
    // Black box before the white interior (so the interior clears the band fill).
    expect(prims.indexOf(black[0])).toBeLessThan(prims.indexOf(white[0]));
  });
});

describe('mergePois', () => {
  const at = (x: number, y: number, name?: string): PlacedPoi => ({ name, point: { x, y } });

  it('folds a cluster of station nodes into one badge at their centroid', () => {
    const merged = mergePois(
      [at(50, 50, 'Berlin Ostkreuz (Stadtbahn)'), at(54, 52, 'Ostkreuz'), at(52, 56, 'Berlin Ostkreuz (Ringbahn)')],
      { maxDistMm: 18 },
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Ostkreuz'); // shortest member name represents the cluster
    expect(merged[0].point.x).toBeCloseTo(52, 6); // centroid (50+54+52)/3
    expect(merged[0].point.y).toBeCloseTo(52.667, 3);
  });

  it('keeps genuinely separate stations apart', () => {
    const merged = mergePois([at(20, 20, 'A'), at(90, 90, 'B')], { maxDistMm: 18 });
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.name).sort()).toEqual(['A', 'B']);
  });

  it('merges unnamed nodes too, leaving the cluster unnamed when none has a name', () => {
    const merged = mergePois([at(10, 10), at(12, 11)], { maxDistMm: 18 });
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBeUndefined();
  });

  it('merges two same-named nodes even when far apart (a station listed twice)', () => {
    const merged = mergePois([at(20, 20, 'Hbf'), at(80, 80, 'Hbf')], { maxDistMm: 18 });
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Hbf');
  });

  it('anchors a cluster on the member nearest a rail line, snapping it onto the line', () => {
    const line: PointMm[] = [{ x: 0, y: 40 }, { x: 100, y: 40 }]; // horizontal rail at y=40
    // Two nodes of one station: one far off the line (y=55), one ~2 mm off (y=42).
    const merged = mergePois([at(30, 55, 'S'), at(34, 42, 'S')], { lines: [line], snapMm: 6 });
    expect(merged).toHaveLength(1);
    expect(merged[0].point.y).toBeCloseTo(40, 6); // snapped exactly onto the line
    expect(merged[0].point.x).toBeCloseTo(34, 6); // the near member's foot on the line
  });

  it('does not yank a station that sits well off any rail line', () => {
    const line: PointMm[] = [{ x: 0, y: 40 }, { x: 100, y: 40 }];
    const merged = mergePois([at(30, 60, 'U')], { lines: [line], snapMm: 6 }); // 20 mm off
    expect(merged).toHaveLength(1);
    expect(merged[0].point).toEqual({ x: 30, y: 60 }); // left where it is (e.g. an underground metro)
  });
});
