import { describe, expect, it } from 'vitest';
import type { Feature } from '../osm/normalize';
import { classify, matches } from './classify';
import { standard } from './defaultStyle';

function line(tags: Record<string, string>): Feature {
  return {
    id: 'way/1',
    tags,
    geometry: { type: 'LineString', coordinates: [{ lng: 0, lat: 0 }, { lng: 0.01, lat: 0.01 }] },
  };
}

function node(tags: Record<string, string>): Feature {
  return { id: 'node/1', tags, geometry: { type: 'Point', coordinates: { lng: 0, lat: 0 } } };
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
    const res = classify([line({ highway: 'primary' }), line({ power: 'line' })], standard);
    expect(res).toHaveLength(1);
    expect(res[0].rule.id).toBe('major-roads');
  });

  it('returns features in ascending z order', () => {
    const res = classify([line({ highway: 'primary' }), line({ railway: 'rail' })], standard);
    expect(res.map((r) => r.rule.id)).toEqual(['rail', 'major-roads']); // rail z=15 below major-roads z=30
  });

  it('drops cycle ways and service lanes (clutter for a blind reader)', () => {
    const res = classify([line({ highway: 'cycleway' }), line({ highway: 'service' })], standard);
    expect(res).toHaveLength(0);
  });

  it('drops footpaths, sidewalks and crossings (no footpath rule)', () => {
    const res = classify(
      [
        line({ highway: 'footway' }),
        line({ highway: 'path' }),
        line({ highway: 'footway', footway: 'sidewalk' }),
        line({ highway: 'footway', footway: 'crossing' }),
      ],
      standard,
    );
    expect(res).toHaveLength(0);
  });

  it('routes rail to the rail rule and stations to the POI rule (Standard)', () => {
    const res = classify(
      [line({ railway: 'rail' }), node({ railway: 'station', name: 'Hbf' }), line({ railway: 'tram' }), line({ railway: 'subway' })],
      standard,
    );
    // tram (in-street) and subway (underground) match no rule and are dropped.
    expect(res.map((r) => r.rule.id).sort()).toEqual(['rail', 'stations']);
    expect(res.find((r) => r.rule.id === 'stations')?.feature.geometry.type).toBe('Point');
  });

  it('keeps S-Bahn / main-line stations but drops U-Bahn, tram and bus', () => {
    const res = classify(
      [
        node({ railway: 'station', name: 'Hbf' }), // mainline rail (no subtag) → kept
        node({ railway: 'station', station: 'light_rail', name: 'S' }), // S-Bahn → kept
        node({ railway: 'station', station: 'subway', name: 'U' }), // U-Bahn metro → dropped
        node({ railway: 'station', station: 'tram', name: 'Tram' }), // dropped
        node({ railway: 'halt', station: 'bus', name: 'Bus' }), // dropped
      ],
      standard,
    );
    expect(res.map((r) => r.feature.tags.name)).toEqual(['Hbf', 'S']);
  });

  it('drops station-throat and yard track (sidings, crossovers, spurs, industrial)', () => {
    const res = classify(
      [
        line({ railway: 'rail' }), // running track → kept
        line({ railway: 'rail', service: 'siding' }), // dropped
        line({ railway: 'rail', service: 'crossover' }), // dropped
        line({ railway: 'rail', service: 'yard' }), // dropped
        line({ railway: 'rail', usage: 'industrial' }), // dropped
      ],
      standard,
    );
    expect(res.map((r) => r.rule.id)).toEqual(['rail']); // only the running track survives
  });
});
