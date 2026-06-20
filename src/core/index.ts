// Public surface of the framework-agnostic core.
export * from './geo/types';
export { DEFAULT_MARGIN_MM, getPageDimensions, getPrintableArea, uniformMargins } from './geo/paper';
export { clipPolylineToRect, printableRect } from './geo/clip';
export { generateMap, coverageBBox, renderedBBox } from './pipeline';
export type { MapParams, MapResult, CoverageParams } from './pipeline';
export { styles, streetOverview } from './style/defaultStyle';
export type { StyleSpec } from './style/types';
