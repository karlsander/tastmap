import { describe, expect, it } from 'vitest';
import type { Feature } from '../osm/normalize';
import { classify, matches } from './classify';
import { streetOverview } from './defaultStyle';

function line(tags: Record<string, string>): Feature {
  return {
    id: 'way/1',
    tags,
    geometry: { type: 'LineString', coordinates: [{ lng: 0, lat: 0 }, { lng: 0.01, lat: 0.01 }] },
  };
}

describe('matches', () => {
  it('matches any value in an array', () => {
    expect(matches({ highway: 'residential' }, { highway: ['residential', 'service'] })).toBe(true);
    expect(matches({ highway: 'motorway' }, { highway: ['residential'] })).toBe(false);
  });

  it('matches presence with true', () => {
    expect(matches({ building: 'yes' }, { building: true })).toBe(true);
    expect(matches({}, { building: true })).toBe(false);
  });

  it('matches an exact string', () => {
    expect(matches({ area: 'yes' }, { area: 'yes' })).toBe(true);
    expect(matches({ area: 'no' }, { area: 'yes' })).toBe(false);
  });

  it('matches { not } when the key is absent or outside the excluded set', () => {
    expect(matches({ highway: 'footway' }, { footway: { not: 'sidewalk' } })).toBe(true); // absent
    expect(matches({ footway: 'crossing' }, { footway: { not: ['sidewalk', 'crossing'] } })).toBe(false);
    expect(matches({ footway: 'sidewalk' }, { footway: { not: 'sidewalk' } })).toBe(false);
    expect(matches({ footway: 'link' }, { footway: { not: ['sidewalk', 'crossing'] } })).toBe(true);
  });
});

describe('classify', () => {
  it('assigns the first matching rule and drops unmatched features', () => {
    const res = classify([line({ highway: 'primary' }), line({ power: 'line' })], streetOverview);
    expect(res).toHaveLength(1);
    expect(res[0].rule.id).toBe('major-roads');
  });

  it('returns features in ascending z order', () => {
    const res = classify([line({ highway: 'footway' }), line({ highway: 'primary' })], streetOverview);
    expect(res.map((r) => r.rule.id)).toEqual(['paths', 'major-roads']);
  });

  it('drops cycle ways and service lanes (clutter for a blind reader)', () => {
    const res = classify([line({ highway: 'cycleway' }), line({ highway: 'service' })], streetOverview);
    expect(res).toHaveLength(0);
  });

  it('keeps standalone footpaths but drops sidewalks and crossings', () => {
    const res = classify(
      [
        line({ highway: 'footway' }), // park path → paths
        line({ highway: 'path' }), // → paths
        line({ highway: 'footway', footway: 'sidewalk' }), // dropped
        line({ highway: 'footway', footway: 'crossing' }), // dropped
      ],
      streetOverview,
    );
    expect(res.map((r) => r.rule.id)).toEqual(['paths', 'paths']);
  });

  it('renders footpaths as a thin solid line (no dash)', () => {
    const [res] = classify([line({ highway: 'path' })], streetOverview);
    expect(res.rule.symbol).toMatchObject({ type: 'line', widthMm: 0.3 });
    expect((res.rule.symbol as { dashMm?: number[] }).dashMm).toBeUndefined();
  });
});
