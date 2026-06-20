import { describe, expect, it } from 'vitest';
import { cellsWidthMm, dotOffset, layoutCells } from './dots';
import { MARBURG_MEDIUM } from './spec';
import { basicTranslator } from './translate';

describe('braille dot geometry', () => {
  it('positions dots 1-6 in the 2x3 cell grid', () => {
    expect(dotOffset(1)).toEqual({ x: 0, y: 0 });
    expect(dotOffset(2)).toEqual({ x: 0, y: 2.5 });
    expect(dotOffset(3)).toEqual({ x: 0, y: 5 });
    expect(dotOffset(4)).toEqual({ x: 2.5, y: 0 });
    expect(dotOffset(5)).toEqual({ x: 2.5, y: 2.5 });
    expect(dotOffset(6)).toEqual({ x: 2.5, y: 5 });
  });

  it('advances successive cells by the cell pitch', () => {
    const dots = layoutCells([[1], [1]], { x: 0, y: 0 });
    expect(dots).toHaveLength(2);
    expect(dots[1].center.x).toBeCloseTo(MARBURG_MEDIUM.cellPitchMm, 6);
  });

  it('computes the on-paper width of a cell run', () => {
    expect(cellsWidthMm(0)).toBe(0);
    expect(cellsWidthMm(1)).toBeCloseTo(4.0, 6); // dotPitch 2.5 + diameter 1.5
  });
});

describe('braille translation', () => {
  it('maps the basic alphabet', () => {
    expect(basicTranslator.translate('a')).toEqual([[1]]);
    expect(basicTranslator.translate('cab')).toEqual([[1, 4], [1], [1, 2]]);
  });

  it('prefixes a run of digits with the number sign', () => {
    expect(basicTranslator.translate('1')).toEqual([[3, 4, 5, 6], [1]]);
  });

  it('handles German umlauts', () => {
    expect(basicTranslator.translate('ä')).toEqual([[3, 4, 5]]);
  });
});
