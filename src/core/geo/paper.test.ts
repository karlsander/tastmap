import { describe, expect, it } from 'vitest';
import { getPageDimensions, getPrintableArea, uniformMargins } from './paper';

describe('paper', () => {
  it('A4 portrait', () => {
    expect(getPageDimensions('A4', 'portrait')).toEqual({ widthMm: 210, heightMm: 297 });
  });

  it('A4 landscape swaps width/height', () => {
    expect(getPageDimensions('A4', 'landscape')).toEqual({ widthMm: 297, heightMm: 210 });
  });

  it('A3 portrait', () => {
    expect(getPageDimensions('A3', 'portrait')).toEqual({ widthMm: 297, heightMm: 420 });
  });

  it('printable area subtracts margins', () => {
    const dim = getPageDimensions('A4', 'portrait');
    expect(getPrintableArea(dim, uniformMargins(10))).toEqual({ widthMm: 190, heightMm: 277 });
  });
});
