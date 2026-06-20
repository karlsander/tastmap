import type { StyleSpec } from './types';

/**
 * "Street overview" — the first tactile style.
 *
 * Widths are starting guesses (millimetres) to be calibrated empirically on the
 * Schwellpapierkopierer. The three width bands (1.0 / 0.6 / 0.4 mm) are spaced
 * so a finger can tell them apart; paths are dashed so they read differently
 * from solid roads even before the width is felt.
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
      symbol: { type: 'line', widthMm: 1.0, minLengthMm: 3 },
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
      symbol: { type: 'line', widthMm: 0.6, minLengthMm: 3 },
    },
    {
      id: 'paths',
      where: {
        highway: ['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track', 'bridleway'],
      },
      z: 10,
      symbol: { type: 'line', widthMm: 0.4, dashMm: [1.5, 1.5], minLengthMm: 3 },
    },
  ],
};

export const styles: Record<string, StyleSpec> = {
  [streetOverview.id]: streetOverview,
};
