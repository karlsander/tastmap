import { describe, expect, it } from 'vitest';
import { standard, styles } from './defaultStyle';

describe('style registry', () => {
  it('exposes Standard, keyed by id', () => {
    expect(styles[standard.id]).toBe(standard);
    expect(Object.values(styles).map((s) => s.name)).toEqual(['Standard']);
  });

  it('folds dual carriageways via the pipeline default', () => {
    // The flag is left unset, so the pipeline default (collapse on) applies.
    expect(standard.collapseDualCarriageways).toBeUndefined();
  });

  it('carries water (two passes), the road weight bands, rail and station POIs', () => {
    const ruleIds = standard.rules.map((r) => r.id);
    expect(ruleIds).toEqual(['water', 'water-large', 'rail', 'major-roads', 'minor-roads', 'stations']);
  });

  it('shades water as a textured area with a bank outline, no solid fill', () => {
    const water = standard.rules.find((r) => r.id === 'water')?.symbol;
    expect(water).toMatchObject({ type: 'area', fill: { kind: 'crosshatch' }, outlineMm: 0.5 });
  });

  it('filters water to real bodies: ornamental subtypes out, plus a size escape hatch', () => {
    const water = standard.rules.find((r) => r.id === 'water');
    const large = standard.rules.find((r) => r.id === 'water-large');
    // First pass: natural=water minus ornamental subtypes, with a small size floor
    // (the floor is what removes the untyped fountains).
    expect(water?.where).toMatchObject({ natural: 'water', water: { not: expect.arrayContaining(['fountain', 'lock', 'basin']) } });
    expect((water?.symbol as { minAreaM2?: number }).minAreaM2).toBe(2500);
    // Escape hatch: any natural=water, but only when properly large.
    expect(large?.where).toEqual({ natural: 'water' });
    expect((large?.symbol as { minAreaM2?: number }).minAreaM2).toBe(10000);
  });

  it('draws rail as a tied centre stroke that is not a labellable street', () => {
    const rail = standard.rules.find((r) => r.id === 'rail');
    expect(rail?.symbol).toMatchObject({ type: 'line', widthMm: 0.8, ties: { lengthMm: 3, spacingMm: 3, widthMm: 0.5 } });
    expect(rail?.labelable).toBe(false); // a railway carries a name but isn't a street
  });

  it('keeps only running track — drops sidings, yards, crossovers, industrial spurs', () => {
    const rail = standard.rules.find((r) => r.id === 'rail');
    expect(rail?.where).toMatchObject({
      service: { not: ['siding', 'spur', 'yard', 'crossover'] },
      usage: { not: 'industrial' },
    });
  });

  it('marks train stations as POIs — S-Bahn/main-line only, no U-Bahn/tram/bus', () => {
    const station = standard.rules.find((r) => r.id === 'stations');
    expect(station?.symbol).toEqual({ type: 'poi' });
    expect(station?.where).toMatchObject({
      railway: ['station', 'halt'],
      station: { not: ['subway', 'tram', 'bus', 'monorail', 'funicular', 'miniature'] },
    });
  });

  it('fetches railway ways + station nodes alongside highways and water', () => {
    expect(standard.sourceKeys).toEqual(['highway', 'natural', 'railway']);
    expect(standard.nodeKeys).toEqual(['railway']);
  });
});
