import { basicTranslator, type BrailleCell } from '../braille/translate';

/**
 * The "Single Character Index" alphabet: a sequence of *single* braille cells,
 * one per labelled street, that carry no linguistic meaning — they are just
 * distinct marks keyed to the legend (like map grid letters).
 *
 * Order: the 26 latin letters a–z first (their standard braille patterns), then
 * every remaining non-blank 6-dot pattern in ascending dot-mask order. A braille
 * cell has 6 dots, so 2^6 = 64 patterns; the 64th is the blank cell, useless as a
 * visible/tactile mark, leaving 63 usable single-cell indices.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** Pack a cell's raised dots (1..6) into a bit per dot — its Unicode-braille low byte. */
const cellToMask = (cell: BrailleCell): number => cell.reduce((m, d) => m | (1 << (d - 1)), 0);
/** Inverse of {@link cellToMask}: dot numbers raised by `mask`, ascending. */
const maskToCell = (mask: number): BrailleCell => [1, 2, 3, 4, 5, 6].filter((d) => (mask & (1 << (d - 1))) !== 0);

function buildIndexCells(): BrailleCell[] {
  // Take the letter patterns from the same translator the rest of the map uses,
  // so the index cells are exactly the cells a reader already knows as a–z.
  const letters = [...ALPHABET].map((ch) => basicTranslator.translate(ch)[0]);
  const used = new Set(letters.map(cellToMask));
  const rest: BrailleCell[] = [];
  for (let mask = 1; mask <= 63; mask++) if (!used.has(mask)) rest.push(maskToCell(mask));
  return [...letters, ...rest];
}

/** All 63 single-cell indices, a–z then the remaining dot patterns. */
export const INDEX_CELLS: readonly BrailleCell[] = buildIndexCells();

/** How many distinct single-cell indices exist (63). Streets beyond this can't
 *  be given a single-character badge. */
export const MAX_INDEX = INDEX_CELLS.length;

/** The braille cell for the i-th index (0-based). */
export function indexCell(i: number): BrailleCell {
  return [...INDEX_CELLS[i]];
}

/**
 * A human-readable token for the on-screen legend: the latin letter for the
 * first 26 indices, otherwise the Unicode braille glyph for the cell so a
 * sighted helper can match the emboss directly.
 */
export function indexLabel(i: number): string {
  if (i < 26) return ALPHABET[i];
  return String.fromCodePoint(0x2800 + cellToMask(INDEX_CELLS[i]));
}
