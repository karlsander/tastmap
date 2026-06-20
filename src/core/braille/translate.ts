/** A braille cell as the set of raised dot numbers (1..6):
 *    1 4
 *    2 5
 *    3 6
 */
export type BrailleCell = number[];

// Uncontracted German basic braille (Basisschrift).
// PLACEHOLDER: production should use liblouis with the German tables
// (de-g1 Vollschrift / de-g2 Kurzschrift, selectable). The Translator interface
// below is what liblouis will implement so callers don't change.
const LETTERS: Record<string, BrailleCell> = {
  a: [1], b: [1, 2], c: [1, 4], d: [1, 4, 5], e: [1, 5], f: [1, 2, 4],
  g: [1, 2, 4, 5], h: [1, 2, 5], i: [2, 4], j: [2, 4, 5], k: [1, 3],
  l: [1, 2, 3], m: [1, 3, 4], n: [1, 3, 4, 5], o: [1, 3, 5], p: [1, 2, 3, 4],
  q: [1, 2, 3, 4, 5], r: [1, 2, 3, 5], s: [2, 3, 4], t: [2, 3, 4, 5],
  u: [1, 3, 6], v: [1, 2, 3, 6], w: [2, 4, 5, 6], x: [1, 3, 4, 6],
  y: [1, 3, 4, 5, 6], z: [1, 3, 5, 6],
  'ä': [3, 4, 5], 'ö': [2, 4, 6], 'ü': [1, 2, 5, 6], 'ß': [2, 3, 4, 6],
  ' ': [],
};

const DIGITS: Record<string, BrailleCell> = {
  '1': [1], '2': [1, 2], '3': [1, 4], '4': [1, 4, 5], '5': [1, 5],
  '6': [1, 2, 4], '7': [1, 2, 4, 5], '8': [1, 2, 5], '9': [2, 4], '0': [2, 4, 5],
};

/** Number sign — precedes a run of digits. */
const NUMBER_SIGN: BrailleCell = [3, 4, 5, 6];

export interface Translator {
  translate(text: string): BrailleCell[];
}

/** Simple uncontracted translator. Swap for liblouis in production. */
export const basicTranslator: Translator = {
  translate(text: string): BrailleCell[] {
    const cells: BrailleCell[] = [];
    let numberMode = false;
    for (const ch of text.toLowerCase()) {
      if (ch in DIGITS) {
        if (!numberMode) {
          cells.push([...NUMBER_SIGN]);
          numberMode = true;
        }
        cells.push([...DIGITS[ch]]);
        continue;
      }
      numberMode = false;
      cells.push(ch in LETTERS ? [...LETTERS[ch]] : []);
    }
    return cells;
  },
};
