import { describe, expect, it } from 'vitest';
import { normalize } from './normalize';
import type { OverpassResponse } from './overpass';

const geom = (pts: [number, number][]) => pts.map(([lon, lat]) => ({ lon, lat }));

describe('normalize', () => {
  it('keeps a closed natural=water way as a Polygon', () => {
    const res: OverpassResponse = {
      elements: [{ type: 'way', id: 1, tags: { natural: 'water' }, geometry: geom([[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]) }],
    };
    const [f] = normalize(res);
    expect(f.geometry.type).toBe('Polygon');
  });

  it('keeps a closed highway way as a LineString (roundabout, not an area)', () => {
    const res: OverpassResponse = {
      elements: [{ type: 'way', id: 2, tags: { highway: 'primary' }, geometry: geom([[0, 0], [4, 0], [4, 4], [0, 0]]) }],
    };
    const [f] = normalize(res);
    expect(f.geometry.type).toBe('LineString');
  });

  it('assembles split outer fragments of a multipolygon into one ring with a hole', () => {
    const res = {
      elements: [
        {
          type: 'relation',
          id: 7,
          tags: { natural: 'water', type: 'multipolygon' },
          members: [
            // outer square, split into two fragments that meet end-to-end
            { type: 'way', ref: 1, role: 'outer', geometry: geom([[0, 0], [10, 0], [10, 10]]) },
            { type: 'way', ref: 2, role: 'outer', geometry: geom([[10, 10], [0, 10], [0, 0]]) },
            // an island, already a closed ring
            { type: 'way', ref: 3, role: 'inner', geometry: geom([[3, 3], [6, 3], [6, 6], [3, 6], [3, 3]]) },
            { type: 'node', ref: 4, role: 'admin_centre' }, // ignored
          ],
        },
      ],
    } as unknown as OverpassResponse;

    const feats = normalize(res);
    expect(feats).toHaveLength(1);
    const f = feats[0];
    expect(f.id).toBe('relation/7#0');
    expect(f.tags.natural).toBe('water');
    if (f.geometry.type !== 'Polygon') throw new Error('expected Polygon');
    // outer ring is closed
    expect(f.geometry.coordinates[0]).toEqual(f.geometry.coordinates.at(-1));
    expect(f.geometry.coordinates.length).toBeGreaterThanOrEqual(5);
    // the island became a hole
    expect(f.geometry.holes).toHaveLength(1);
    expect(f.geometry.holes?.[0][0]).toEqual({ lng: 3, lat: 3 });
  });

  it('reverses a tail-to-tail fragment when chaining a ring', () => {
    const res = {
      elements: [
        {
          type: 'relation',
          id: 8,
          tags: { natural: 'water', type: 'multipolygon' },
          members: [
            { type: 'way', ref: 1, role: 'outer', geometry: geom([[0, 0], [10, 0], [10, 10]]) },
            // this fragment runs 0,0 -> 0,10 -> 10,10: its END (10,10) meets the open end
            { type: 'way', ref: 2, role: 'outer', geometry: geom([[0, 0], [0, 10], [10, 10]]) },
          ],
        },
      ],
    } as unknown as OverpassResponse;
    const [f] = normalize(res);
    if (f.geometry.type !== 'Polygon') throw new Error('expected Polygon');
    expect(f.geometry.coordinates[0]).toEqual(f.geometry.coordinates.at(-1)); // closed
  });
});
