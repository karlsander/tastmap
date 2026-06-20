import { describe, expect, it } from 'vitest';
import { basicTranslator } from './braille/translate';
import type { Projector } from './geo/projection';
import type { LngLat, PointMm, RectMm } from './geo/types';
import { buildLegendScenes, collectLabelCandidates, keyFor, placeLabels } from './label';
import type { ClassifiedFeature } from './style/classify';

// A trivial projector: treat lng/lat as page mm directly.
const proj: Projector = {
  toPage: (p: LngLat): PointMm => ({ x: p.lng, y: p.lat }),
  page: { widthMm: 100, heightMm: 100 },
  scaleDenominator: 1,
};
const CLIP: RectMm = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
const translate = (s: string): number[][] => basicTranslator.translate(s);

function lineFeature(name: string, coords: [number, number][]): ClassifiedFeature {
  return {
    feature: { id: name, tags: { name, highway: 'residential' }, geometry: { type: 'LineString', coordinates: coords.map(([lng, lat]) => ({ lng, lat })) } },
    rule: { id: 'r', where: {}, z: 0, symbol: { type: 'line', widthMm: 0.6 } },
  };
}

describe('keyFor', () => {
  it('is a bijective base-26 sequence', () => {
    expect(keyFor(0)).toBe('a');
    expect(keyFor(25)).toBe('z');
    expect(keyFor(26)).toBe('aa');
    expect(keyFor(27)).toBe('ab');
    expect(keyFor(51)).toBe('az');
    expect(keyFor(52)).toBe('ba');
  });
});

describe('collectLabelCandidates', () => {
  it('keeps one candidate per name, anchored on the line, sorted by prominence', () => {
    const classified = [
      lineFeature('Short', [[10, 10], [14, 10]]), // length 4
      lineFeature('Long', [[10, 50], [90, 50]]), // length 80
    ];
    const cands = collectLabelCandidates(classified, proj, CLIP);
    expect(cands.map((c) => c.name)).toEqual(['Long', 'Short']); // longest first
    expect(cands[0].anchor).toEqual({ x: 50, y: 50 }); // midpoint of Long
  });

  it('merges segments sharing a name and keeps the longest run', () => {
    const classified = [
      lineFeature('Main', [[10, 20], [20, 20]]), // 10
      lineFeature('Main', [[10, 40], [70, 40]]), // 60 — wins
    ];
    const cands = collectLabelCandidates(classified, proj, CLIP);
    expect(cands).toHaveLength(1);
    expect(cands[0].anchor).toEqual({ x: 40, y: 40 });
  });

  it('ignores unnamed features and those clipped away', () => {
    const unnamed: ClassifiedFeature = {
      feature: { id: 'x', tags: { highway: 'service' }, geometry: { type: 'LineString', coordinates: [{ lng: 1, lat: 1 }, { lng: 5, lat: 1 }] } },
      rule: { id: 'r', where: {}, z: 0, symbol: { type: 'line', widthMm: 0.4 } },
    };
    const offPage = lineFeature('Far', [[200, 200], [220, 200]]);
    expect(collectLabelCandidates([unnamed, offPage], proj, CLIP)).toEqual([]);
  });
});

describe('placeLabels', () => {
  it('assigns contiguous keys and places non-overlapping labels', () => {
    const cands = [
      { name: 'A', anchor: { x: 20, y: 20 }, prominence: 9 },
      { name: 'B', anchor: { x: 60, y: 60 }, prominence: 8 },
    ];
    const { placed, dropped } = placeLabels(cands, CLIP, translate);
    expect(dropped).toBe(0);
    expect(placed.map((p) => p.key)).toEqual(['a', 'b']);
    expect(placed[0].dots.length).toBeGreaterThan(0);
  });

  it('drops labels that cannot be placed without collision', () => {
    // Five candidates at the same point: only the four quadrant offsets fit.
    const cands = Array.from({ length: 5 }, (_, i) => ({ name: `N${i}`, anchor: { x: 50, y: 50 }, prominence: 5 }));
    const { placed, dropped } = placeLabels(cands, CLIP, translate);
    expect(placed).toHaveLength(4);
    expect(dropped).toBe(1);
  });

  it('respects maxLabels', () => {
    const cands = Array.from({ length: 10 }, (_, i) => ({ name: `N${i}`, anchor: { x: 10 + i * 8, y: 50 }, prominence: 1 }));
    const { placed } = placeLabels(cands, CLIP, translate, 3);
    expect(placed).toHaveLength(3);
  });
});

describe('buildLegendScenes', () => {
  it('returns nothing for no labels', () => {
    expect(buildLegendScenes([], 'A4', 10, translate)).toEqual([]);
  });

  it('builds in-bounds legend pages with braille and ink', () => {
    const { placed } = placeLabels(
      [
        { name: 'Bahnhofstrasse', anchor: { x: 20, y: 20 }, prominence: 9 },
        { name: 'Marktplatz', anchor: { x: 60, y: 60 }, prominence: 8 },
      ],
      CLIP,
      translate,
    );
    const pages = buildLegendScenes(placed, 'A4', 10, translate);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    const kinds = new Set(pages[0].primitives.map((p) => p.kind));
    expect(kinds.has('text')).toBe(true);
    expect(kinds.has('dot')).toBe(true);
    for (const p of pages[0].primitives) {
      const pts = p.kind === 'path' ? p.points : p.kind === 'dot' ? [p.center] : [p.origin];
      for (const pt of pts) {
        expect(pt.x).toBeLessThanOrEqual(pages[0].widthMm);
        expect(pt.y).toBeLessThanOrEqual(pages[0].heightMm);
      }
    }
  });
});
