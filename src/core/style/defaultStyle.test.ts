import { describe, expect, it } from 'vitest';
import { standard, streetOverview, styles } from './defaultStyle';

describe('style registry', () => {
  it('exposes Street overview and Standard, keyed by id', () => {
    expect(styles[streetOverview.id]).toBe(streetOverview);
    expect(styles[standard.id]).toBe(standard);
    expect(Object.values(styles).map((s) => s.name)).toEqual(['Street overview', 'Standard']);
  });

  it('Standard keeps carriageways apart; Street overview folds them (default)', () => {
    // Standard opts out explicitly; Street overview leaves it unset so the
    // pipeline default (collapse on) applies.
    expect(standard.collapseDualCarriageways).toBe(false);
    expect(streetOverview.collapseDualCarriageways).toBeUndefined();
  });

  it('shares the road weight bands, but only Street overview adds footpaths', () => {
    // Both classify the drivable network identically (major/minor) and shade
    // water the same way; Street overview appends a thin footpath rule.
    const ruleIds = (s: typeof standard): string[] => s.rules.map((r) => r.id);
    expect(ruleIds(standard)).toEqual(['water', 'major-roads', 'minor-roads']);
    expect(ruleIds(streetOverview)).toEqual(['water', 'major-roads', 'minor-roads', 'paths']);
  });

  it('shades water as a textured area with a bank outline, no solid fill', () => {
    const water = standard.rules.find((r) => r.id === 'water')?.symbol;
    expect(water).toMatchObject({ type: 'area', fill: { kind: 'crosshatch' }, outlineMm: 0.5 });
  });

  it('fetches water keys alongside highways', () => {
    expect(standard.sourceKeys).toEqual(['highway', 'natural']);
  });
});
