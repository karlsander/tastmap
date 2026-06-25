import { describe, expect, it } from 'vitest';
import { buildQuery } from './overpass';

describe('buildQuery', () => {
  const bbox = { minLng: 1, minLat: 2, maxLng: 3, maxLat: 4 };

  it('requests both ways and multipolygon relations for each key', () => {
    const q = buildQuery(bbox, ['highway', 'natural']);
    expect(q).toContain('way["highway"](2,1,4,3);');
    expect(q).toContain('relation["highway"]["type"="multipolygon"](2,1,4,3);');
    expect(q).toContain('way["natural"](2,1,4,3);');
    expect(q).toContain('relation["natural"]["type"="multipolygon"](2,1,4,3);');
    expect(q).toContain('out geom;');
  });

  it('requests nodes for nodeKeys (POIs) on top of the ways/relations', () => {
    const q = buildQuery(bbox, ['railway'], { nodeKeys: ['railway'] });
    expect(q).toContain('way["railway"](2,1,4,3);');
    expect(q).toContain('node["railway"](2,1,4,3);');
  });

  it('omits node clauses when no nodeKeys are given', () => {
    expect(buildQuery(bbox, ['highway'])).not.toContain('node[');
  });
});
