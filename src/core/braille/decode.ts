import type { BrailleCell } from './translate';

/**
 * Decode a Unicode-braille string (U+2800–U+28FF, as liblouis emits with the
 * `unicode.dis` display table) into our {@link BrailleCell} dot-number cells.
 * Each code point's low 6 bits are dots 1–6 (bit i → dot i+1). Anything else —
 * spaces, punctuation liblouis left as ASCII — becomes a blank cell, matching
 * how the placeholder translator treats gaps.
 */
export function decodeBrailleUnicode(s: string): BrailleCell[] {
  const cells: BrailleCell[] = [];
  for (const ch of s) {
    const n = (ch.codePointAt(0) ?? 0) - 0x2800;
    if (n < 0 || n > 0xff) {
      cells.push([]); // space / non-braille → blank cell
      continue;
    }
    const dots: number[] = [];
    for (let bit = 0; bit < 6; bit++) if (n & (1 << bit)) dots.push(bit + 1);
    cells.push(dots);
  }
  return cells;
}
