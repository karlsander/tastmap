import { basicTranslator, type BrailleCell, type Translator } from './braille/translate';
import { printableRect } from './geo/clip';
import { DEFAULT_MARGIN_MM, getPageDimensions, getPrintableArea, uniformMargins } from './geo/paper';
import { bboxFromCenter, groundMeters, makeProjector } from './geo/projection';
import type { BBox, LngLat, Orientation, PaperSize, RectMm } from './geo/types';
import { buildFurniture } from './furniture';
import { fetchOverpass } from './osm/overpass';
import { normalize } from './osm/normalize';
import { renderPdf, renderPdfPages } from './pdf/render';
import { roadLengths, type RoadLength } from './roads';
import { buildScene, type TrimmedStreet } from './scene/build';
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
  /** Braille translator for the furniture (default: uncontracted placeholder; swap for liblouis). */
  translator?: Translator;
  /** Title shown in the furniture band (ink + braille). Defaults to "1:N". */
  title?: string;
  /** Douglas–Peucker simplification tolerance (page mm); defaults applied in buildScene. */
  simplifyToleranceMm?: number;
  /** Drop short, unconnected street snippets clipped off at the page edge. */
  trimEdgeSnippets?: boolean;
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
  });

  const features = normalize(res);
  const projector = makeProjector(params.center, params.scaleDenominator, dim);
  const classified = classify(features, params.style);
  const translate = (s: string): BrailleCell[] => (params.translator ?? basicTranslator).translate(s);

  // Reserve a band at the top of the printable area for map furniture; the
  // map clips to the area below it.
  const printable = printableRect(dim, margins);
  const clip: RectMm = { ...printable, minY: printable.minY + FURNITURE_BAND_MM };
  const { scene, trimmed } = buildScene(classified, projector, clip, {
    simplifyToleranceMm: params.simplifyToleranceMm,
    trimEdgeSnippets: params.trimEdgeSnippets,
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
  const pdf = await renderPdf(scene);
  return { pdf, featureCount: classified.length, strokeCount, roads, trimmed };
}

/** Render the full multi-page tactile test-sheet gallery — no network. */
export async function renderTestSheets(): Promise<Uint8Array> {
  return renderPdfPages(buildTestSheets());
}
