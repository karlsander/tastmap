import { decodeBrailleUnicode } from './decode';
import type { BrailleCell, Translator } from './translate';

/** German braille grade: 1 = Vollschrift (full), 2 = Kurzschrift (contracted). */
export type LiblouisGrade = 1 | 2;

export interface LiblouisOptions {
  grade?: LiblouisGrade;
}

/** liblouis' translateString(tableList, text) → Unicode-braille string. */
export type TranslateString = (tableList: string, text: string) => string;

/**
 * Wrap a liblouis `translateString` into our {@link Translator}, producing
 * proper German braille (decoded to dot cells). Environment-agnostic: node and
 * the browser each inject their own bound `translateString`, so this stays pure
 * and unit-testable. `unicode.dis` makes liblouis emit Unicode braille, which
 * {@link decodeBrailleUnicode} turns into cells.
 */
export function makeLiblouisTranslator(translateString: TranslateString, options: LiblouisOptions = {}): Translator {
  const grade = options.grade ?? 1;
  const tableList = `tables/unicode.dis,tables/de-de-g${grade}.ctb`;
  return {
    translate(text: string): BrailleCell[] {
      return decodeBrailleUnicode(translateString(tableList, text));
    },
  };
}
