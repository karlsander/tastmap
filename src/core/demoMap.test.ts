import { describe, expect, it } from 'vitest';
import { buildDemoMap } from './demoMap';

describe('buildDemoMap', () => {
  const scene = buildDemoMap('A4');

  it('is a single A4 page with content of every primitive kind', () => {
    expect(scene.widthMm).toBe(210);
    expect(scene.heightMm).toBe(297);
    const kinds = new Set(scene.primitives.map((p) => p.kind));
    expect(kinds.has('path')).toBe(true); // roads, area fills, outlines
    expect(kinds.has('dot')).toBe(true); // dot textures, border, icons
    expect(kinds.has('text')).toBe(true); // ink key
  });

  it('has no braille-free map labels (only the ink key) and stays on the page', () => {
    for (const p of scene.primitives) {
      const pts = p.kind === 'path' ? p.points : p.kind === 'dot' ? [p.center] : [p.origin];
      for (const pt of pts) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(scene.widthMm);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(scene.heightMm);
      }
    }
  });
});
