import { describe, expect, it } from 'vitest';
import { buildTestSheets } from './testsheets';

describe('buildTestSheets', () => {
  const sheets = buildTestSheets();

  it('produces a multi-page A4 portrait gallery', () => {
    expect(sheets.length).toBe(3);
    for (const s of sheets) {
      expect(s.widthMm).toBe(210);
      expect(s.heightMm).toBe(297);
      expect(s.primitives.length).toBeGreaterThan(0);
    }
  });

  it('keeps every primitive inside the page on every sheet', () => {
    sheets.forEach((scene, i) => {
      for (const p of scene.primitives) {
        const pts =
          p.kind === 'path' ? p.points : p.kind === 'dot' ? [p.center] : [p.origin];
        for (const pt of pts) {
          expect(pt.x, `sheet ${i + 1} x`).toBeGreaterThanOrEqual(0);
          expect(pt.x, `sheet ${i + 1} x`).toBeLessThanOrEqual(scene.widthMm);
          expect(pt.y, `sheet ${i + 1} y`).toBeGreaterThanOrEqual(0);
          expect(pt.y, `sheet ${i + 1} y`).toBeLessThanOrEqual(scene.heightMm);
        }
      }
    });
  });

  it('labels every sheet with ink text', () => {
    for (const s of sheets) {
      expect(s.primitives.some((p) => p.kind === 'text')).toBe(true);
    }
  });
});
