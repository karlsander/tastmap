import type { StyleSpec } from './types';
import { TACTILE_LINES } from './vocabulary';

const THICK = TACTILE_LINES.thick.pattern.widthMm; // 2.0 — major roads
const NORMAL = TACTILE_LINES.normal.pattern.widthMm; // 0.8 — minor roads
const THIN = TACTILE_LINES.thin.pattern.widthMm; // 0.3 — standalone footpaths

/**
 * "Street overview" — the first tactile style.
 *
 * Single-stroke approach: one line per real-world way, three solid weights so
 * they read as a hierarchy under the fingertip — major = thick (2.0 mm),
 * minor = normal (0.8 mm), footpaths = thin (0.3 mm). Sidewalks, crossings,
 * cycle tracks and service lanes are dropped so a street is a single line, not
 * a bundle of parallels. (Dual carriageways still draw as two parallel ways
 * until the merge step lands.) Widths come from the validated tactile
 * vocabulary (see `./vocabulary` and AGENTS.md, print run 1).
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
        // `service` (driveways, parking aisles, alleys) is intentionally left
        // out — rarely relevant to a blind reader and a major source of clutter.
        // Revisit if we add an "understand traffic" style.
        highway: ['tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'road'],
      },
      z: 20,
      symbol: { type: 'line', widthMm: NORMAL, minLengthMm: 3 },
    },
    {
      id: 'paths',
      where: {
        // `cycleway` is intentionally left out — cycle tracks are rarely
        // relevant to a blind reader and add parallel-line clutter. Revisit if
        // we add an "understand traffic" style.
        highway: ['footway', 'path', 'pedestrian', 'steps', 'track', 'bridleway'],
        // Drop sidewalks and crossings: they only shadow the road they run
        // beside. Standalone paths (parks etc.) carry no such subtag and survive.
        footway: { not: ['sidewalk', 'crossing'] },
      },
      z: 10,
      symbol: { type: 'line', widthMm: THIN, minLengthMm: 3 },
    },
  ],
};

export const styles: Record<string, StyleSpec> = {
  [streetOverview.id]: streetOverview,
};
