import { describe, expect, it } from 'vitest';
import { buildCalibrationScene } from './calibration';
import type { Primitive } from './scene/types';

const kinds = (prims: Primitive[]): Set<string> => new Set(prims.map((p) => p.kind));

describe('buildCalibrationScene', () => {
  it('is a portrait page at exact paper size', () => {
    const scene = buildCalibrationScene({ paper: 'A4' });
    expect(scene.widthMm).toBe(210);
    expect(scene.heightMm).toBe(297);
  });

  it('forces portrait regardless of paper (A3)', () => {
    const scene = buildCalibrationScene({ paper: 'A3' });
    expect(scene.widthMm).toBe(297);
    expect(scene.heightMm).toBe(420);
  });

  it('exercises every render path: paths, dots (braille), and ink text', () => {
    const scene = buildCalibrationScene({ paper: 'A4' });
    expect(kinds(scene.primitives)).toEqual(new Set(['path', 'dot', 'text']));
  });

  it('keeps all content inside the page bounds', () => {
    const scene = buildCalibrationScene({ paper: 'A4' });
    for (const p of scene.primitives) {
      if (p.kind === 'path') {
        for (const pt of p.points) {
          expect(pt.x).toBeGreaterThanOrEqual(0);
          expect(pt.x).toBeLessThanOrEqual(scene.widthMm);
          expect(pt.y).toBeGreaterThanOrEqual(0);
          expect(pt.y).toBeLessThanOrEqual(scene.heightMm);
        }
      } else if (p.kind === 'dot') {
        expect(p.center.y).toBeLessThanOrEqual(scene.heightMm);
      } else {
        expect(p.origin.y).toBeLessThanOrEqual(scene.heightMm);
      }
    }
  });

  it('labels the line-width samples in millimetres', () => {
    const scene = buildCalibrationScene({ paper: 'A4' });
    const texts = scene.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text);
    expect(texts.some((t) => t.includes('1.50 mm'))).toBe(true);
    expect(texts.some((t) => t.toLowerCase().includes('braille'))).toBe(true);
  });
});
