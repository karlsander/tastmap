import { buildCalibrationScene, type CalibrationParams } from './calibration';
import { printableRect } from './geo/clip';
import { DEFAULT_MARGIN_MM, getPageDimensions, getPrintableArea, uniformMargins } from './geo/paper';
import { bboxFromCenter, groundMeters, makeProjector } from './geo/projection';
import type { BBox, LngLat, Orientation, PaperSize } from './geo/types';
import { fetchOverpass } from './osm/overpass';
import { normalize } from './osm/normalize';
import { renderPdf } from './pdf/render';
import { buildScene } from './scene/build';
import { classify } from './style/classify';
import type { StyleSpec } from './style/types';

export interface MapParams {
  center: LngLat;
  scaleDenominator: number;
  paper: PaperSize;
  orientation: Orientation;
  style: StyleSpec;
  /** Uniform printable margin in millimetres. Defaults to {@link DEFAULT_MARGIN_MM}. */
  marginMm?: number;
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
}

/** Fetch slightly beyond the page so edge features aren't cut off mid-render. */
const COVERAGE_PADDING = 1.15;

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
  const scene = buildScene(classified, projector, printableRect(dim, margins));
  const pdf = await renderPdf(scene);

  return { pdf, featureCount: classified.length, strokeCount: scene.primitives.length };
}

/** Render the calibration sheet to PDF bytes — no network, purely local. */
export async function renderCalibration(params: CalibrationParams): Promise<Uint8Array> {
  return renderPdf(buildCalibrationScene(params));
}
