import type { StyleSpec } from './types';
import { TACTILE_LINES } from './vocabulary';

const THICK = TACTILE_LINES.thick.pattern.widthMm; // 2.0 — major roads
const NORMAL = TACTILE_LINES.normal.pattern.widthMm; // 0.8 — minor roads
const DASHED = TACTILE_LINES.dashed.pattern; // 0.6 / [3,1.5] — paths

/**
 * "Street overview" — the first tactile style.
 *
 * Widths come from the validated tactile vocabulary (see `./vocabulary` and
 * AGENTS.md, print run 1): major = thick (2.0 mm), minor = normal (0.8 mm),
 * paths = dashed line (3/1.5). The class → line-type mapping itself is still
 * provisional and worth refining on the next print.
 */
export const streetOverview: StyleSpec = {
  id: 'street-overview',
  name: 'Street overview',
  sourceKeys: ['highway'],
  rules: [
    {
      id: 'major-roads',
      where: {
        highway: [
          'motorway',
          'trunk',
          'primary',
          'secondary',
          'motorway_link',
          'trunk_link',
          'primary_link',
          'secondary_link',
        ],
      },
      z: 30,
      symbol: { type: 'line', widthMm: THICK, minLengthMm: 3 },
    },
    {
      id: 'minor-roads',
      where: {
        highway: [
          'tertiary',
          'tertiary_link',
          'residential',
          'unclassified',
          'living_street',
          'service',
          'road',
        ],
      },
      z: 20,
      symbol: { type: 'line', widthMm: NORMAL, minLengthMm: 3 },
    },
    {
      id: 'paths',
      where: {
        highway: ['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track', 'bridleway'],
      },
      z: 10,
      symbol: { type: 'line', widthMm: DASHED.widthMm, dashMm: [...DASHED.dashMm], minLengthMm: 3 },
    },
  ],
};

export const styles: Record<string, StyleSpec> = {
  [streetOverview.id]: streetOverview,
};
