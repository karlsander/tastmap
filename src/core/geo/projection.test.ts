import { describe, expect, it } from 'vitest';
import { groundMeters, makeProjector, metersFromCenter } from './projection';

const center = { lng: 8.7665, lat: 50.8021 };
const page = { widthMm: 210, heightMm: 297 };

describe('projection', () => {
  it('places the center at the middle of the page', () => {
    const proj = makeProjector(center, 1500, page);
    const p = proj.toPage(center);
    expect(p.x).toBeCloseTo(105, 6);
    expect(p.y).toBeCloseTo(148.5, 6);
  });

  it('maps ground metres to paper mm at the chosen scale', () => {
    // 1:1000 → 1 mm paper == 1 m ground.
    const proj = makeProjector(center, 1000, page);
    const offset = { lng: center.lng + 0.001, lat: center.lat };
    const { east } = metersFromCenter(center, offset);
    const p = proj.toPage(offset);
    expect(p.x - 105).toBeCloseTo(east, 6); // mmPerMeter == 1
    expect(p.y).toBeCloseTo(148.5, 6); // no north component
  });

  it('puts north above the centre (smaller y)', () => {
    const proj = makeProjector(center, 1000, page);
    const north = proj.toPage({ lng: center.lng, lat: center.lat + 0.001 });
    expect(north.y).toBeLessThan(148.5);
  });

  it('groundMeters reflects the scale denominator', () => {
    expect(groundMeters(190, 1500)).toBeCloseTo(285, 6);
    expect(groundMeters(100, 1000)).toBeCloseTo(100, 6);
  });
});
