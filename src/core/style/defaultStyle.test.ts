import { describe, expect, it } from 'vitest';
import { standard, streetOverview, styles } from './defaultStyle';

describe('style registry', () => {
  it('exposes Street overview and Standard, keyed by id', () => {
    expect(styles[streetOverview.id]).toBe(streetOverview);
    expect(styles[standard.id]).toBe(standard);
    expect(Object.values(styles).map((s) => s.name)).toEqual(['Standard', 'Street overview']); // Standard leads (the default)
  });

  it('Standard keeps carriageways apart; Street overview folds them (default)', () => {
    // Standard opts out explicitly; Street overview leaves it unset so the
    // pipeline default (collapse on) applies.
    expect(standard.collapseDualCarriageways).toBe(false);
    expect(streetOverview.collapseDualCarriageways).toBeUndefined();
  });

  it('shares the road weight bands; Street overview adds footpaths, Standard adds rail + stations', () => {
    // Both classify the drivable network identically (major/minor) and shade
    // water the same way; Street overview appends a thin footpath rule, while
    // Standard adds the rail line and station POIs instead.
    const ruleIds = (s: typeof standard): string[] => s.rules.map((r) => r.id);
    expect(ruleIds(standard)).toEqual(['water', 'rail', 'major-roads', 'minor-roads', 'stations']);
    expect(ruleIds(streetOverview)).toEqual(['water', 'major-roads', 'minor-roads', 'paths']);
  });

  it('shades water as a textured area with a bank outline, no solid fill', () => {
    const water = standard.rules.find((r) => r.id === 'water')?.symbol;
    expect(water).toMatchObject({ type: 'area', fill: { kind: 'crosshatch' }, outlineMm: 0.5 });
  });

  it('draws rail as a tied centre stroke that is not a labellable street', () => {
    const rail = standard.rules.find((r) => r.id === 'rail');
    expect(rail?.symbol).toMatchObject({ type: 'line', widthMm: 0.8, ties: { lengthMm: 3, spacingMm: 3, widthMm: 0.5 } });
    expect(rail?.labelable).toBe(false); // a railway carries a name but isn't a street
    expect(streetOverview.rules.some((r) => r.id === 'rail')).toBe(false); // Standard only
  });

  it('keeps only running track — drops sidings, yards, crossovers, industrial spurs', () => {
    const rail = standard.rules.find((r) => r.id === 'rail');
    expect(rail?.where).toMatchObject({
      service: { not: ['siding', 'spur', 'yard', 'crossover'] },
      usage: { not: 'industrial' },
    });
  });

  it('marks train stations as POIs — trains only, no tram/bus (Standard only)', () => {
    const station = standard.rules.find((r) => r.id === 'stations');
    expect(station?.symbol).toEqual({ type: 'poi' });
    expect(station?.where).toMatchObject({
      railway: ['station', 'halt'],
      station: { not: ['tram', 'bus', 'monorail', 'funicular', 'miniature'] },
    });
    expect(streetOverview.rules.some((r) => r.id === 'stations')).toBe(false);
  });

  it('fetches railway ways + station nodes only for Standard', () => {
    expect(standard.sourceKeys).toEqual(['highway', 'natural', 'railway']);
    expect(standard.nodeKeys).toEqual(['railway']);
    expect(streetOverview.sourceKeys).toEqual(['highway', 'natural']);
    expect(streetOverview.nodeKeys).toBeUndefined();
  });
});
