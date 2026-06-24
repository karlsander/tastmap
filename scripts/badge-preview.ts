// Visual smoke test for Single Character Index badges (no network).
// Builds a synthetic scene — a cross-hatched area + a few roads — places badges
// via the real placeRoadBadges/badgePrimitives, and renders a PDF so we can see
// that the badge breaks the road line and clears the texture beneath it.
// Run with: npx vite-node scripts/badge-preview.ts
import { writeFileSync } from 'node:fs';
import { badgePrimitives, crossHatchFill, indexCell, placeRoadBadges, renderPdf, segment } from '../src/core/index';
import type { DrawnLine } from '../src/core/scene/build';
import type { Primitive, Scene } from '../src/core/scene/types';

const W = 120;
const H = 120;
const clip = { minX: 5, minY: 5, maxX: W - 5, maxY: H - 5 };

const roads: DrawnLine[] = [
  { name: 'Greifswalder Straße', points: [{ x: 40, y: 8 }, { x: 40, y: 112 }] },
  { name: 'Danziger Straße', points: [{ x: 8, y: 35 }, { x: 112, y: 35 }] },
  { name: 'Marienburger Straße', points: [{ x: 80, y: 8 }, { x: 80, y: 60 }, { x: 112, y: 90 }] },
];

const cellByName = new Map(roads.map((r, i) => [r.name as string, indexCell(i)]));
const { badges, dropped } = placeRoadBadges(roads, clip, cellByName);
console.log(`placed ${badges.length}, dropped ${dropped.length}: ${dropped.join(', ') || '—'}`);
for (const b of badges) console.log(`  ${b.name}: centre (${b.anchor.x.toFixed(1)}, ${b.anchor.y.toFixed(1)})`);

const texture = crossHatchFill(clip, { angleDeg: 45, spacingMm: 3, widthMm: 0.3 });
const strokes: Primitive[] = roads.flatMap((r) => {
  const out: Primitive[] = [];
  for (let i = 1; i < r.points.length; i++) out.push(segment(r.points[i - 1], r.points[i], 1.2));
  return out;
});

const scene: Scene = {
  widthMm: W,
  heightMm: H,
  primitives: [...texture, ...strokes, ...badgePrimitives(badges)],
};

const pdf = await renderPdf(scene);
writeFileSync('/tmp/tastmap-badge-preview.pdf', pdf);
console.log(`wrote /tmp/tastmap-badge-preview.pdf (${pdf.byteLength} bytes)`);
