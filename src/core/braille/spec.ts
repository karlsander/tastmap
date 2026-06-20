/**
 * Marburg Medium tactile braille dimensions (DIN 32976), in millimetres.
 * These are physical constants of readable braille — labels MUST hit them, which
 * is why we draw dots ourselves rather than trusting a font's metrics.
 */
export const MARBURG_MEDIUM = {
  dotDiameterMm: 1.5,
  /** Dot spacing within a cell, both axes. */
  dotPitchMm: 2.5,
  /** Distance between the same dot of two adjacent cells. */
  cellPitchMm: 6.0,
  /** Distance between the same dot of two adjacent lines. */
  linePitchMm: 10.0,
} as const;
