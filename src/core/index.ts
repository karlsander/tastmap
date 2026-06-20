// Public surface of the framework-agnostic core.
export * from './geo/types';
export { DEFAULT_MARGIN_MM, getPageDimensions, getPrintableArea, uniformMargins } from './geo/paper';
export { clipPolylineToRect, printableRect } from './geo/clip';
export { crossHatchFill, dotFill, hatchFill, rectOutline } from './scene/textures';
export { beadedPath, ladderPath, parallelPair, scatterFill, segment, wavyFill, wavyPath } from './scene/lines';
export { renderPdf, renderPdfPages } from './pdf/render';
export { buildCalibrationScene } from './calibration';
export type { CalibrationParams } from './calibration';
export { buildTestSheets } from './testsheets';
export { generateMap, coverageBBox, renderedBBox, renderCalibration, renderTestSheets } from './pipeline';
export type { MapParams, MapResult, CoverageParams } from './pipeline';
export { styles, streetOverview } from './style/defaultStyle';
export type { StyleSpec } from './style/types';
