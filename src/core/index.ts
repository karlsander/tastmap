// Public surface of the framework-agnostic core.
export * from './geo/types';
export { DEFAULT_MARGIN_MM, getPageDimensions, getPrintableArea, uniformMargins } from './geo/paper';
export { clipPolylineToRect, printableRect } from './geo/clip';
export { crossHatchFill, dotFill, filledPolygon, filledRect, hatchFill, rectOutline } from './scene/textures';
export { arcPoints, beadedPath, ladderAlongPath, ladderPath, parallelPair, scatterFill, segment, wavyFill, wavyPath } from './scene/lines';
export { mergeRailCorridors } from './scene/railMerge';
export type { RailMergeOptions } from './scene/railMerge';
export { icon, ICON_KINDS } from './scene/icons';
export type { IconKind } from './scene/icons';
export { clipTextureToPolygon, clipTextureToArea, clearTextureAroundLine, pointInPolygon, distPointToPolyline } from './scene/fill';
export { renderPdf, renderPdfPages } from './pdf/render';
export { basicTranslator } from './braille/translate';
export type { Translator } from './braille/translate';
export { decodeBrailleUnicode } from './braille/decode';
export { makeLiblouisTranslator } from './braille/liblouis';
export type { LiblouisGrade, LiblouisOptions, TranslateString } from './braille/liblouis';
export { collectLabelCandidates, placeLabels, buildLegendScenes, keyFor } from './label';
export { abbreviateName, buildLegend } from './label/abbreviate';
export type { LegendEntry } from './label/abbreviate';
export { placeRoadLabels, labelPrimitives, placeRoadBadges, badgePrimitives, mergePois, placePoiBadges, poiBadgePrimitives, POI_MERGE_DIST_MM, POI_SNAP_MM } from './label/place';
export type {
  RoadLabel,
  RoadLabelResult,
  RoadLabelOptions,
  RoadBadge,
  RoadBadgeResult,
  RoadBadgeOptions,
  PoiInput,
  PoiBadge,
  PoiBadgeResult,
  PoiBadgeOptions,
  MergePoiOptions,
} from './label/place';
export { INDEX_CELLS, MAX_INDEX, indexCell, indexLabel } from './label/indexCode';
export { buildFurniture, scaleBarDistance } from './furniture';
export { simplify } from './geo/simplify';
export { roadLengths } from './roads';
export type { RoadLength } from './roads';
export { buildTestSheets } from './testsheets';
export { generateMap, coverageBBox, renderedBBox, renderTestSheets } from './pipeline';
export type { MapParams, MapResult, CoverageParams, LabelStyle } from './pipeline';
export type { TrimmedStreet, PlacedPoi } from './scene/build';
export { styles, standard } from './style/defaultStyle';
export { TACTILE_LINES, TACTILE_AREAS, MIN_LINE_WIDTH_MM } from './style/vocabulary';
export type { TactileLine, TactileLineName, LinePattern, TactileArea, TactileAreaName, AreaFill } from './style/vocabulary';
export type { StyleSpec } from './style/types';
