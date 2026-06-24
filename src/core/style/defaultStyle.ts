import type { Rule, StyleSpec } from './types';
import { TACTILE_AREAS, TACTILE_LINES } from './vocabulary';

const THICK = TACTILE_LINES.thick.pattern.widthMm; // 2.0 — major roads
const NORMAL = TACTILE_LINES.normal.pattern.widthMm; // 0.8 — minor roads
const THIN = TACTILE_LINES.thin.pattern.widthMm; // 0.3 — standalone footpaths

/** OSM keys both styles fetch: the road network plus water area features. */
const SOURCE_KEYS = ['highway', 'natural'];

/**
 * The drivable street network, in two weight bands so they read as a hierarchy
 * under the fingertip — major = thick (2.0 mm), minor = normal (0.8 mm).
 * Sidewalks, crossings, cycle tracks and service lanes are dropped so a street
 * is a single line, not a bundle of parallels. Widths come from the validated
 * tactile vocabulary (see `./vocabulary` and AGENTS.md, print run 1).
 */
const roadRules: Rule[] = [
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
];

/**
 * Standalone footpaths, tracks and steps, drawn thin (0.3 mm). Only "Street
 * overview" carries these; "Standard" omits them to keep the page to the
 * drivable network.
 */
const footpathRule: Rule = {
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
};

/**
 * Area features, drawn beneath the road network. Water (rivers, lakes, basins)
 * is shaded with a cross-hatch and a bank outline, so the shoreline is traceable
 * and the surface reads as a filled area. Fill comes from the validated tactile
 * vocabulary (see `./vocabulary`). (Park shading was tried and dropped — dotted
 * parks read as noise here.)
 */
const areaRules: Rule[] = [
  {
    id: 'water',
    where: { natural: 'water' },
    z: 4,
    symbol: { type: 'area', fill: TACTILE_AREAS.crosshatch.fill, outlineMm: 0.5 },
  },
];

/**
 * "Street overview" — the first tactile style.
 *
 * Single-stroke: divided roads fold to one centerline and same-named survivors
 * join end-to-end (`collapseDualCarriageways` defaults on), so every real-world
 * way reads as a single traceable line. Includes thin footpaths.
 */
export const streetOverview: StyleSpec = {
  id: 'street-overview',
  name: 'Street overview',
  sourceKeys: SOURCE_KEYS,
  rules: [...areaRules, ...roadRules, footpathRule],
};

/**
 * "Standard" — the literal counterpart to Street overview.
 *
 * Same weight hierarchy, but no carriageway folding or path joining: a divided
 * big road keeps its two fat lanes, and an ordinary street stays a single simple
 * line. Footpaths are omitted entirely, leaving just the drivable street network.
 * Closer to the raw OSM geometry; busier, but truer to the ground.
 */
export const standard: StyleSpec = {
  id: 'standard',
  name: 'Standard',
  sourceKeys: SOURCE_KEYS,
  rules: [...areaRules, ...roadRules],
  collapseDualCarriageways: false,
};

export const styles: Record<string, StyleSpec> = {
  [streetOverview.id]: streetOverview,
  [standard.id]: standard,
};
