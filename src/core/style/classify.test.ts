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
});
