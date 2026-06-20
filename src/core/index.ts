// Public surface of the framework-agnostic core.
export * from './geo/types';
export { getPageDimensions, getPrintableArea, uniformMargins } from './geo/paper';
export { generateMap, coverageBBox } from './pipeline';
export type { MapParams, MapResult, CoverageParams } from './pipeline';
export { styles, streetOverview } from './style/defaultStyle';
export type { StyleSpec } from './style/types';
