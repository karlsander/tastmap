import { describe, expect, it } from 'vitest';
import type { PointMm, RectMm } from '../geo/types';
import type { DrawnLine } from '../scene/build';
import type { PathPrimitive } from '../scene/types';
import { badgePrimitives, placeRoadBadges, placeRoadLabels } from './place';

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
});
