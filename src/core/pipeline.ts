import { getPageDimensions } from './geo/paper';
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
  overpassEndpoint?: string;
  signal?: AbortSignal;
}

export interface MapResult {
  pdf: Uint8Array;
  /** Number of features that survived classification. */
  featureCount: number;
}

/** Fetch slightly beyond the page so edge features aren't cut off mid-render. */
const COVERAGE_PADDING = 1.15;

export interface CoverageParams {
  center: LngLat;
  scaleDenominator: number;
  paper: PaperSize;
  orientation: Orientation;
}

/** Geographic box covered by the page at the given scale (padding 1.0 = exact page). */
export function coverageBBox(p: CoverageParams, padding = COVERAGE_PADDING): BBox {
  const dim = getPageDimensions(p.paper, p.orientation);
  const halfWidthM = (groundMeters(dim.widthMm, p.scaleDenominator) / 2) * padding;
  const halfHeightM = (groundMeters(dim.heightMm, p.scaleDenominator) / 2) * padding;
  return bboxFromCenter(p.center, halfWidthM, halfHeightM);
}

/** Full pipeline: params → Overpass → features → scene → PDF bytes. */
export async function generateMap(params: MapParams): Promise<MapResult> {
  const dim = getPageDimensions(params.paper, params.orientation);
  const bbox = coverageBBox(params);

  const res = await fetchOverpass(bbox, params.style.sourceKeys, {
    endpoint: params.overpassEndpoint,
    signal: params.signal,
  });

  const features = normalize(res);
  const projector = makeProjector(params.center, params.scaleDenominator, dim);
  const classified = classify(features, params.style);
  const scene = buildScene(classified, projector);
  const pdf = await renderPdf(scene);

  return { pdf, featureCount: classified.length };
}
