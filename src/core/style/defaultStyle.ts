import type { Rule, StyleSpec } from './types';
import { TACTILE_AREAS, TACTILE_LINES } from './vocabulary';

const THICK = TACTILE_LINES.thick.pattern.widthMm; // 2.0 — major roads
const NORMAL = TACTILE_LINES.normal.pattern.widthMm; // 0.8 — minor roads
const RAIL = TACTILE_LINES.rail.pattern; // 0.8 centre stroke + cross-ties

/** Base OSM keys: the road network plus water area features. */
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
 * mapped as a way/area, via its centroid). S-Bahn and proper (main-line/regional)
 * trains only — *not* the U-Bahn metro: the `station=*` denylist drops `subway`
 * along with tram/bus/monorail/funicular/miniature, so `station=light_rail` (how
 * Berlin tags the S-Bahn) and bare main-line stations (no `station` subtag, just
 * `train=yes`) pass. OSM models each mode of a multi-modal stop as its own node,
 * so dropping the subway node at e.g. Alexanderplatz or Jannowitzbrücke still
 * leaves the S-Bahn node — the badge stays (POI cluster-merge keeps it to one).
 * The badge's label content follows the map's label style. Only "Standard"
 * carries stations.
 */
const stationRule: Rule = {
  id: 'stations',
  where: {
    railway: ['station', 'halt'],
    station: { not: ['subway', 'tram', 'bus', 'monorail', 'funicular', 'miniature'] },
  },
  z: 40, // POIs sit on top of everything
  symbol: { type: 'poi' },
};

/**
 * Ornamental / infrastructure water subtypes — not a river, lake or sea. Fountains
 * are usually mapped as bare `natural=water` (no subtype), so they're caught by
 * the size floor instead; locks and basins do carry a subtype, so we name them.
 */
const ORNAMENTAL_WATER = ['fountain', 'reflecting_pool', 'basin', 'tank', 'lock', 'wastewater', 'salt_pool'];

/**
 * Water, drawn beneath the road network with a cross-hatch and a bank outline so
 * the shoreline is traceable and the surface reads as a filled area. We only want
 * real bodies — rivers, lakes, the sea — not the fountains, ornamental basins and
 * canal locks that speckle a city centre, so two passes filter by tag *and* size:
 *
 *   - `water`: `natural=water` that isn't an ornamental subtype, above a real-body
 *     footprint. The size floor is what removes the untyped ornamental water that
 *     carries no tag to filter on — fountains (Neptunbrunnen ~190 m², Brunnen der
 *     Völkerfreundschaft ~370 m²) and even a 1.2k m² show cascade — while genuine
 *     water sits far above it (the Spree's polygons here are 50k–700k m²).
 *   - `water-large`: the size escape hatch — *any* `natural=water`, as long as it
 *     is properly large (≥ 1 ha), so a big body tagged unexpectedly (a reservoir,
 *     a wide lock cut) still shows even though the first pass would skip it.
 *
 * (Park shading was tried and dropped — dotted parks read as noise here.)
 */
const areaRules: Rule[] = [
  {
    id: 'water',
    where: { natural: 'water', water: { not: ORNAMENTAL_WATER } },
    z: 4,
    symbol: { type: 'area', fill: TACTILE_AREAS.crosshatch.fill, outlineMm: 0.5, minAreaM2: 2500 },
  },
  {
    id: 'water-large',
    where: { natural: 'water' },
    z: 4,
    symbol: { type: 'area', fill: TACTILE_AREAS.crosshatch.fill, outlineMm: 0.5, minAreaM2: 10000 },
  },
];

/**
 * "Standard" — the one tactile style (more will follow).
 *
 * Two road weight bands read as a hierarchy under the fingertip. Divided roads
 * fold to a single centerline (`collapseDualCarriageways` defaults on) so a dual
 * carriageway reads as one traceable line. On top of the drivable network it
 * carries water areas, the rail network and train-station POIs; footpaths are
 * omitted to keep the page legible.
 */
export const standard: StyleSpec = {
  id: 'standard',
  name: 'Standard',
  sourceKeys: [...SOURCE_KEYS, 'railway'],
  nodeKeys: ['railway'],
  rules: [...areaRules, railRule, ...roadRules, stationRule],
};

export const styles: Record<string, StyleSpec> = {
  [standard.id]: standard,
};
