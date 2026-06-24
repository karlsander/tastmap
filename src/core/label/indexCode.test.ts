import { describe, expect, it } from 'vitest';
import { basicTranslator } from '../braille/translate';
import { INDEX_CELLS, MAX_INDEX, indexCell, indexLabel } from './indexCode';

const mask = (cell: number[]): number => cell.reduce((m, d) => m | (1 << (d - 1)), 0);

describe('single-character index alphabet', () => {
  it('has 63 cells — every non-blank 6-dot pattern', () => {
    expect(INDEX_CELLS).toHaveLength(63);
    expect(MAX_INDEX).toBe(63);
  });

  it('starts with the 26 latin letters a–z', () => {
    const letters = [...'abcdefghijklmnopqrstuvwxyz'].map((ch) => basicTranslator.translate(ch)[0]);
    expect(INDEX_CELLS.slice(0, 26)).toEqual(letters);
  });

  it('is all distinct, non-empty cells', () => {
    const masks = INDEX_CELLS.map((c) => mask([...c]));
    expect(new Set(masks).size).toBe(63);
    expect(masks).not.toContain(0); // never the blank cell
  });

  it('labels the first 26 as latin letters, the rest as braille glyphs', () => {
    expect(indexLabel(0)).toBe('a');
    expect(indexLabel(25)).toBe('z');
    const glyph = indexLabel(26);
    expect(glyph.codePointAt(0)).toBeGreaterThanOrEqual(0x2800);
    expect(glyph.codePointAt(0)).toBeLessThanOrEqual(0x283f);
  });

  it('indexCell returns a defensive copy', () => {
    const c = indexCell(0);
    c.push(99);
    expect(indexCell(0)).toEqual([1]); // 'a' unchanged
  });
});
