import { describe, expect, it } from 'vitest';
import { decodeBrailleUnicode } from './decode';
import { makeLiblouisTranslator } from './liblouis';

describe('decodeBrailleUnicode', () => {
  it('extracts dots 1-6 from Unicode braille code points', () => {
    // U+2801 = dot 1; U+2803 = dots 1,2; U+280B = dots 1,2,4 ("f"); U+283F = dots 1-6
    expect(decodeBrailleUnicode('⠁')).toEqual([[1]]);
    expect(decodeBrailleUnicode('⠃')).toEqual([[1, 2]]);
    expect(decodeBrailleUnicode('⠋')).toEqual([[1, 2, 4]]);
    expect(decodeBrailleUnicode('⠿')).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it('renders the empty braille cell and spaces as blank cells', () => {
    expect(decodeBrailleUnicode('⠀')).toEqual([[]]);
    expect(decodeBrailleUnicode('a b')).toEqual([[], [], []]); // ASCII passthrough → blanks
  });
});

describe('makeLiblouisTranslator', () => {
  it('selects the German table for the requested grade', () => {
    const calls: string[] = [];
    const fake = (tableList: string): string => {
      calls.push(tableList);
      return '⠋'; // "f"
    };
    expect(makeLiblouisTranslator(fake, { grade: 1 }).translate('x')).toEqual([[1, 2, 4]]);
    expect(makeLiblouisTranslator(fake, { grade: 2 }).translate('x')).toEqual([[1, 2, 4]]);
    expect(calls[0]).toContain('de-de-g1.ctb');
    expect(calls[1]).toContain('de-de-g2.ctb');
    expect(calls[0]).toContain('unicode.dis');
  });
});
