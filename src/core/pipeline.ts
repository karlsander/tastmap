import { basicTranslator, type BrailleCell, type Translator } from './braille/translate';
import { printableRect } from './geo/clip';
import { DEFAULT_MARGIN_MM, getPageDimensions, getPrintableArea, uniformMargins } from './geo/paper';
import { bboxFromCenter, groundMeters, makeProjector } from './geo/projection';
import type { BBox, LngLat, Orientation, PaperSize, PointMm, RectMm } from './geo/types';
import { buildFurniture } from './furniture';
import { fetchOverpass } from './osm/overpass';
import { normalize } from './osm/normalize';
import { renderPdf, renderPdfPages } from './pdf/render';
import { roadLengths, type RoadLength } from './roads';
import { buildLegend, type LegendEntry } from './label/abbreviate';
import {
  badgePrimitives,
  labelPrimitives,
  mergePois,
  placePoiBadges,
  placeRoadBadges,
  placeRoadLabels,
  poiBadgePrimitives,
  type PoiInput,
} from './label/place';
import { indexCell, indexLabel, MAX_INDEX } from './label/indexCode';
import { buildScene, type PlacedPoi, type TrimmedStreet } from './scene/build';
import type { Scene } from './scene/types';
import { classify } from './style/classify';
import type { StyleSpec } from './style/types';
import { buildTestSheets } from './testsheets';

/**
 * How named streets are labelled on the map:
 *   - `'acronym'` — 3-letter codes (e.g. "GWS") thrown off the road on a leader.
 *   - `'index'`   — a single braille cell in a small badge, placed on the road.
 *   - `'none'`    — no labels (and an empty legend).
 */
export type LabelStyle = 'acronym' | 'index' | 'none';

export interface MapParams {
  center: LngLat;
  scaleDenominator: number;
  paper: PaperSize;
  orientation: Orientation;
  style: StyleSpec;
  /** How named streets are labelled. Defaults to `'acronym'`. */
  labelStyle?: LabelStyle;
  /** Uniform printable margin in millimetres. Defaults to {@link DEFAULT_MARGIN_MM}. */
  marginMm?: number;
  /** Braille translator for the furniture (default: uncontracted placeholder; swap for liblouis). */
  translator?: Translator;
  /** Title shown in the furniture band (ink + braille). Defaults to "1:N". */
  title?: string;
  /** Douglas–Peucker simplification tolerance (page mm); defaults applied in buildScene. */
  simplifyToleranceMm?: number;
  /** Drop short, unconnected street snippets clipped off at the page edge. */
  trimEdgeSnippets?: boolean;
  /** Collapse divided roads to a single centerline (default true). */
  collapseDualCarriageways?: boolean;
  overpassEndpoint?: string;
  signal?: AbortSignal;
}

export interface MapResult {
  pdf: Uint8Array;
  /** Number of features that survived classification (before clipping). */
  featureCount: number;
  /** Stroke primitives actually drawn, after clipping to the page and dropping
   *  sub-threshold parts. Lower than featureCount when features fall in the
   *  margin; can exceed it when a feature is clipped into several pieces. */
  strokeCount: number;
  /** Named roads in the section with their ground length (m), longest first. */
  roads: RoadLength[];
  /** The label style that produced {@link legend} and the on-map labels. */
  labelStyle: LabelStyle;
  /** Legend code per named road (same order as {@link roads}); empty for
   *  `labelStyle: 'none'`. For `'acronym'` the code is a 3-letter abbreviation;
   *  for `'index'` it is the single-character index (latin letter or braille glyph). */
  legend: LegendEntry[];
  /** Braille road codes/badges actually placed on the map. */
  labelsPlaced: number;
  /** Coded roads whose braille label didn't fit (collision / off-page / over the
   *  63-index limit). */
  labelsDropped: number;
  /** Code per named station POI shown on the map (same code scheme as the street
   *  labels — 3-letter acronym or single-character index); empty for styles that
   *  carry no stations or for `labelStyle: 'none'`. */
  stations: LegendEntry[];
  /** Station POI badges actually placed on the map (over-index-limit stations
   *  still get a bare-marker badge, so they count as placed). */
  stationsPlaced: number;
  /** Stations whose badge didn't fit on the page. */
  stationsDropped: number;
  /** Streets dropped by edge-snippet trimming (empty when the option is off). */
  trimmed: TrimmedStreet[];
}

/** Fetch slightly beyond the page so edge features aren't cut off mid-render. */
const COVERAGE_PADDING = 1.15;

/** Height of the bottom band reserved for map furniture (title/scale/north), mm. */
const FURNITURE_BAND_MM = 20;

export interface CoverageParams {
  center: LngLat;
  scaleDenominator: number;
  paper: PaperSize;
  orientation: Orientation;
}

/** Geographic box covered by the full page at the given scale (padding 1.0 = exact page). */
export function coverageBBox(p: CoverageParams, padding = COVERAGE_PADDING): BBox {
  const dim = getPageDimensions(p.paper, p.orientation);
  const halfWidthM = (groundMeters(dim.widthMm, p.scaleDenominator) / 2) * padding;
  const halfHeightM = (groundMeters(dim.heightMm, p.scaleDenominator) / 2) * padding;
  return bboxFromCenter(p.center, halfWidthM, halfHeightM);
}

/**
 * Geographic box that is actually rendered — the printable area inside the
 * margins. Use this for the picker footprint so it honestly previews what the
 * reader gets, not the slightly larger full-page extent we over-fetch.
 */
export function renderedBBox(p: CoverageParams, marginMm = DEFAULT_MARGIN_MM): BBox {
  const dim = getPageDimensions(p.paper, p.orientation);
  const printable = getPrintableArea(dim, uniformMargins(marginMm));
  const halfWidthM = groundMeters(printable.widthMm, p.scaleDenominator) / 2;
  const halfHeightM = groundMeters(printable.heightMm, p.scaleDenominator) / 2;
  return bboxFromCenter(p.center, halfWidthM, halfHeightM);
}

/** Full pipeline: params → Overpass → features → scene → PDF bytes. */
export async function generateMap(params: MapParams): Promise<MapResult> {
  const dim = getPageDimensions(params.paper, params.orientation);
  const margins = uniformMargins(params.marginMm ?? DEFAULT_MARGIN_MM);
  const bbox = coverageBBox(params);

  const res = await fetchOverpass(bbox, params.style.sourceKeys, {
    endpoint: params.overpassEndpoint,
    signal: params.signal,
    nodeKeys: params.style.nodeKeys,
  });

  const features = normalize(res);
  const projector = makeProjector(params.center, params.scaleDenominator, dim);
  const classified = classify(features, params.style);
  const translate = (s: string): BrailleCell[] => (params.translator ?? basicTranslator).translate(s);

  // Reserve a band at the top of the printable area for map furniture; the
  // map clips to the area below it.
  const printable = printableRect(dim, margins);
  const clip: RectMm = { ...printable, minY: printable.minY + FURNITURE_BAND_MM };
  const { scene, trimmed, drawnLines, pois } = buildScene(classified, projector, clip, {
    simplifyToleranceMm: params.simplifyToleranceMm,
    trimEdgeSnippets: params.trimEdgeSnippets,
    collapseDualCarriageways: params.collapseDualCarriageways ?? params.style.collapseDualCarriageways ?? true,
  });
  const strokeCount = scene.primitives.length;

  // Keyed braille labels + a legend page are shelved pending a different
  // approach; the braille rendering itself (furniture above, core/braille,
  // core/label) is kept. The furniture scale/north/title still use braille.
  scene.primitives.push(
    ...buildFurniture(
      { minX: printable.minX, minY: printable.minY, maxX: printable.maxX, maxY: printable.minY + FURNITURE_BAND_MM },
      { scaleDenominator: params.scaleDenominator, title: params.title ?? '', translate },
    ),
  );

  const roads = roadLengths(classified, projector, clip, params.scaleDenominator);
  const labelStyle: LabelStyle = params.labelStyle ?? 'acronym';

  // Build the legend + place the labels onto the map according to the style,
  // compositing them on top (so a label/badge knockout severs the road beneath).
  let legend: LegendEntry[] = [];
  let labelsPlaced = 0;
  let labelsDropped = 0;

  if (labelStyle === 'acronym') {
    // 3-letter codes as braille with leader lines (knockout box, leader, anchor).
    legend = buildLegend(roads.map((r) => r.name));
    const codeByName = new Map(legend.map((e) => [e.name, e.code]));
    const { labels, dropped } = placeRoadLabels(drawnLines, clip, codeByName);
    scene.primitives.push(...labelPrimitives(labels));
    labelsPlaced = labels.length;
    labelsDropped = dropped.length;
  } else if (labelStyle === 'index') {
    // One braille cell per road in a badge on the road; the i-th road (longest
    // first) gets index i. Roads past the 63-cell limit go unlabelled.
    const cellByName = new Map<string, BrailleCell>();
    roads.forEach((r, i) => {
      if (i >= MAX_INDEX) return;
      legend.push({ code: indexLabel(i), name: r.name });
      cellByName.set(r.name, indexCell(i));
    });
    const { badges, dropped } = placeRoadBadges(drawnLines, clip, cellByName);
    scene.primitives.push(...badgePrimitives(badges));
    labelsPlaced = badges.length;
    labelsDropped = dropped.length + Math.max(0, roads.length - MAX_INDEX);
  }
  // 'none': no legend, no labels.

  // Train-station POIs: one double-border badge per station, drawn on top so it
  // marks the spot through the road/rail beneath. The braille inside follows the
  // street-label style — a 3-cell acronym, a single index cell (its own sequence,
  // distinct from the roads'), or a bare marker for 'none'. Badges are placed
  // last so they sit above every line and label.
  // The drawn rail centerlines (non-labelable lines) — stations anchor onto these.
  const railLines = drawnLines.filter((l) => l.labelable === false).map((l) => l.points);
  const { stations, placed: stationsPlaced, dropped: stationsDropped } = placeStations(pois, clip, labelStyle, scene, railLines);

  const pdf = await renderPdf(scene);
  return {
    pdf,
    featureCount: classified.length,
    strokeCount,
    roads,
    labelStyle,
    legend,
    labelsPlaced,
    labelsDropped,
    stations,
    stationsPlaced,
    stationsDropped,
    trimmed,
  };
}

/**
 * Build and composite the train-station badges. The braille content tracks the
 * map's label style; the on-screen key (`stations`) maps each badge code to its
 * station name, so the reader can decode the emboss. Pushes the badge primitives
 * onto `scene` and returns the placement tally.
 */
function placeStations(
  pois: PlacedPoi[],
  clip: RectMm,
  labelStyle: LabelStyle,
  scene: Scene,
  railLines: PointMm[][],
): { stations: LegendEntry[]; placed: number; dropped: number } {
  // 'none' means no labels anywhere — stations included — so the map stays
  // undisturbed (no badge boxes knocked into it).
  if (pois.length === 0 || labelStyle === 'none') return { stations: [], placed: 0, dropped: 0 };

  // Fold each cluster / duplicate of a station into one badge, anchored onto the
  // rail line it serves (and snapped on when it sits just off it).
  const stationsPois = mergePois(pois, { lines: railLines });
  const named = stationsPois.filter((p) => p.name).map((p) => p.name as string);
  const codeByName = new Map<string, string>();
  const cellByName = new Map<string, BrailleCell[]>();
  const stations: LegendEntry[] = [];

  if (labelStyle === 'acronym') {
    // 3-letter codes, uncontracted (a code reads against the legend, not as a word).
    for (const e of buildLegend(named)) {
      stations.push(e);
      codeByName.set(e.name, e.code);
      cellByName.set(e.name, basicTranslator.translate(e.code.toLowerCase()));
    }
  } else if (labelStyle === 'index') {
    // One index cell per station, in its own a–z… sequence. Past the 63-cell
    // limit a station still gets a bare-marker badge (like 'none'), so its
    // location is shown even though it has no code — not counted as "dropped".
    [...new Set(named)].forEach((name, i) => {
      if (i >= MAX_INDEX) return;
      stations.push({ code: indexLabel(i), name });
      codeByName.set(name, indexLabel(i));
      cellByName.set(name, [indexCell(i)]);
    });
  }
  // A named station carries its code; an unnamed one still gets a bare-marker
  // badge so its location shows (in 'none' mode we returned above, drawing none).

  const inputs: PoiInput[] = stationsPois.map((p) => ({
    name: p.name,
    point: p.point,
    code: (p.name && codeByName.get(p.name)) || '',
    cells: (p.name && cellByName.get(p.name)) || [],
  }));
  const { badges, dropped } = placePoiBadges(inputs, clip);
  scene.primitives.push(...poiBadgePrimitives(badges));
  return { stations, placed: badges.length, dropped: dropped.length };
}

/** Render the full multi-page tactile test-sheet gallery — no network. */
export async function renderTestSheets(): Promise<Uint8Array> {
  return renderPdfPages(buildTestSheets());
}
