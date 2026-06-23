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
    // Both classify the drivable network identically (major/minor); Street
    // overview appends a thin footpath rule that Standard omits.
    const ruleIds = (s: typeof standard): string[] => s.rules.map((r) => r.id);
    expect(ruleIds(standard)).toEqual(['major-roads', 'minor-roads']);
    expect(ruleIds(streetOverview)).toEqual(['major-roads', 'minor-roads', 'paths']);
  });
});
