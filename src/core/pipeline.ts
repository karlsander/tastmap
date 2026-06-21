import { buildCalibrationScene, type CalibrationParams } from './calibration';
import { basicTranslator, type BrailleCell, type Translator } from './braille/translate';
import { printableRect } from './geo/clip';
import { DEFAULT_MARGIN_MM, getPageDimensions, getPrintableArea, uniformMargins } from './geo/paper';
import { bboxFromCenter, groundMeters, makeProjector } from './geo/projection';
import type { BBox, LngLat, Orientation, PaperSize, RectMm } from './geo/types';
import { buildFurniture } from './furniture';
import { buildLegendScenes, collectLabelCandidates, placeLabels } from './label';
import { fetchOverpass } from './osm/overpass';
import { normalize } from './osm/normalize';
import { renderPdf, renderPdfPages } from './pdf/render';
import { buildScene } from './scene/build';
import type { Scene } from './scene/types';
import { classify } from './style/classify';
import type { StyleSpec } from './style/types';
import { buildTestSheets } from './testsheets';

export interface MapParams {
  center: LngLat;
  scaleDenominator: number;
  paper: PaperSize;
  orientation: Orientation;
  style: StyleSpec;
  /** Uniform printable margin in millimetres. Defaults to {@link DEFAULT_MARGIN_MM}. */
  marginMm?: number;
  /** Place keyed braille labels + a legend page. Default true. */
  labels?: boolean;
  /** Braille translator (default: uncontracted placeholder; swap for liblouis). */
  translator?: Translator;
  /** Cap on placed labels to keep the map legible. */
  maxLabels?: number;
  /** Title shown in the furniture band (ink + braille). Defaults to "1:N". */
  title?: string;
  /** Douglas–Peucker simplification tolerance (page mm); defaults applied in buildScene. */
  simplifyToleranceMm?: number;
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
  /** Keyed braille labels placed on the map. */
  labelCount: number;
  /** Total PDF pages (map + any legend pages). */
  pageCount: number;
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
  });

  const features = normalize(res);
  const projector = makeProjector(params.center, params.scaleDenominator, dim);
  const classified = classify(features, params.style);
  const translate = (s: string): BrailleCell[] => (params.translator ?? basicTranslator).translate(s);

  // Reserve a band at the bottom of the printable area for map furniture; the
  // map (and its labels) clip to the area above it.
  const printable = printableRect(dim, margins);
  const clip: RectMm = { ...printable, maxY: printable.maxY - FURNITURE_BAND_MM };
  const scene = buildScene(classified, projector, clip, { simplifyToleranceMm: params.simplifyToleranceMm });
  const strokeCount = scene.primitives.length;

  let labelCount = 0;
  let legendPages: Scene[] = [];
  if (params.labels !== false) {
    const candidates = collectLabelCandidates(classified, projector, clip);
    const { placed } = placeLabels(candidates, clip, translate, params.maxLabels);
    for (const pl of placed) scene.primitives.push(...pl.dots);
    legendPages = buildLegendScenes(placed, params.paper, params.marginMm ?? DEFAULT_MARGIN_MM, translate);
    labelCount = placed.length;
  }

  scene.primitives.push(
    ...buildFurniture(
      { minX: printable.minX, minY: printable.maxY - FURNITURE_BAND_MM, maxX: printable.maxX, maxY: printable.maxY },
      { scaleDenominator: params.scaleDenominator, title: params.title ?? '', translate },
    ),
  );

  const pdf = await renderPdfPages([scene, ...legendPages]);
  return { pdf, featureCount: classified.length, strokeCount, labelCount, pageCount: 1 + legendPages.length };
}

/** Render the calibration sheet to PDF bytes — no network, purely local. */
export async function renderCalibration(params: CalibrationParams): Promise<Uint8Array> {
  return renderPdf(buildCalibrationScene(params));
}

/** Render the full multi-page tactile test-sheet gallery — no network. */
export async function renderTestSheets(): Promise<Uint8Array> {
  return renderPdfPages(buildTestSheets());
}
