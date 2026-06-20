// Public surface of the framework-agnostic core.
export * from './geo/types';
export { DEFAULT_MARGIN_MM, getPageDimensions, getPrintableArea, uniformMargins } from './geo/paper';
export { clipPolylineToRect, printableRect } from './geo/clip';
export { crossHatchFill, dotFill, hatchFill, rectOutline } from './scene/textures';
export { buildCalibrationScene } from './calibration';
export type { CalibrationParams } from './calibration';
export { generateMap, coverageBBox, renderedBBox, renderCalibration } from './pipeline';
export type { MapParams, MapResult, CoverageParams } from './pipeline';
export { styles, streetOverview } from './style/defaultStyle';
export type { StyleSpec } from './style/types';
