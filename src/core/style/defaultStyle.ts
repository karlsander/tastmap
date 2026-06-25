import type { Rule, StyleSpec } from './types';
import { TACTILE_AREAS, TACTILE_LINES } from './vocabulary';

const THICK = TACTILE_LINES.thick.pattern.widthMm; // 2.0 — major roads
const NORMAL = TACTILE_LINES.normal.pattern.widthMm; // 0.8 — minor roads
const THIN = TACTILE_LINES.thin.pattern.widthMm; // 0.3 — standalone footpaths
const RAIL = TACTILE_LINES.rail.pattern; // 0.8 centre stroke + cross-ties

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
 * Railways, drawn as the tactile "rail" line (a centre stroke with perpendicular
 * cross-ties — see `./vocabulary`), so a track reads as categorically different
 * from a road under the fingertip. Heavy/suburban rail only: in-street trams
 * (`railway=tram`) would double up with the road they run in, and the
 * underground (`railway=subway`) isn't on the surface to feel.
 *
 * Only *running* track is kept: `service=*` marks the sidings, spurs, yard tracks
 * and crossovers that make up a station throat or marshalling yard — exactly the
 * "ins and outs" a reader doesn't need — and `usage=industrial` marks works
 * spurs; both are dropped. The parallel running tracks that survive are then
 * collapsed to one centerline per corridor in `buildScene` (see
 * {@link mergeRailCorridors}). A railway often carries a `name`, but it isn't a
 * street, so `labelable: false` keeps it out of the road list and the
 * street-label pass. Only "Standard" carries rail.
 */
const railRule: Rule = {
  id: 'rail',
  where: {
    railway: ['rail', 'light_rail', 'narrow_gauge'],
    service: { not: ['siding', 'spur', 'yard', 'crossover'] },
    usage: { not: 'industrial' },
  },
  z: 15, // beneath the road network, above water
  symbol: {
    type: 'line',
    widthMm: RAIL.widthMm,
    ties: { lengthMm: RAIL.tieLengthMm, spacingMm: RAIL.tieSpacingMm, widthMm: RAIL.tieWidthMm },
    minLengthMm: 3,
  },
  labelable: false,
};

/**
 * Train stations, drawn as POI badges (a bold sharp-cornered box around a braille
 * label — see `core/label/place`). Matches station/halt *nodes* (and any station
 * mapped as a way/area, via its centroid). Trains only — rail, light rail and
 * metro (S-/U-Bahn, regional): the `station=*` denylist drops tram and bus stops
 * (and monorail/funicular/miniature), while mainline rail (no `station` subtag),
 * `subway` and `light_rail` pass. The badge's label content follows the map's
 * label style. Only "Standard" carries stations.
 */
const stationRule: Rule = {
  id: 'stations',
  where: {
    railway: ['station', 'halt'],
    station: { not: ['tram', 'bus', 'monorail', 'funicular', 'miniature'] },
  },
  z: 40, // POIs sit on top of everything
  symbol: { type: 'poi' },
};

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
 * Closer to the raw OSM geometry; busier, but truer to the ground. Adds the rail
 * network and train-station POIs (Street overview keeps to streets + water).
 */
export const standard: StyleSpec = {
  id: 'standard',
  name: 'Standard',
  sourceKeys: [...SOURCE_KEYS, 'railway'],
  nodeKeys: ['railway'],
  rules: [...areaRules, railRule, ...roadRules, stationRule],
  collapseDualCarriageways: false,
};

// Standard first → it's the default and leads the style dropdown.
export const styles: Record<string, StyleSpec> = {
  [standard.id]: standard,
  [streetOverview.id]: streetOverview,
};
