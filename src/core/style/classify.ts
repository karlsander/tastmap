import type { Feature } from '../osm/normalize';
import type { Rule, StyleSpec, TagMatch } from './types';

export interface ClassifiedFeature {
  feature: Feature;
  rule: Rule;
}

export function matches(tags: Record<string, string>, where: TagMatch): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = tags[key];
    if (value === undefined) return false;
    if (cond === true) continue;
    if (typeof cond === 'string') {
      if (value !== cond) return false;
    } else if (!cond.includes(value)) {
      return false;
    }
  }
  return true;
}

/**
 * Attach the first matching rule to each feature; unmatched features are dropped.
 * Returned in ascending z order so that later items draw on top.
 */
export function classify(features: Feature[], style: StyleSpec): ClassifiedFeature[] {
  const out: ClassifiedFeature[] = [];
  for (const feature of features) {
    const rule = style.rules.find((r) => matches(feature.tags, r.where));
    if (rule) out.push({ feature, rule });
  }
  out.sort((a, b) => a.rule.z - b.rule.z);
  return out;
}
