// Batch-generate everything for a print run: the synthetic test-sheet gallery
// (no network) plus a few real-area road maps with distinct street patterns.
// Run with: npx vite-node scripts/testsheets.ts
import { writeFileSync } from 'node:fs';
import { generateMap, renderTestSheets, streetOverview } from '../src/core/index';

const OUT_DIR = '/tmp';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// 1. Synthetic gallery — the tactile design experiments.
const gallery = await renderTestSheets();
writeFileSync(`${OUT_DIR}/tastmap-test-sheets.pdf`, gallery);
console.log(`wrote tastmap-test-sheets.pdf (${gallery.byteLength} bytes)`);

// 2. Real areas with different street patterns, to feel how real data reads.
const AREAS = [
  { name: 'marburg-altstadt', center: { lng: 8.7665, lat: 50.809 }, scale: 2000 },
  { name: 'mannheim-grid', center: { lng: 8.466, lat: 49.488 }, scale: 4000 },
  { name: 'suburb-residential', center: { lng: 8.79, lat: 50.82 }, scale: 3000 },
];

for (const a of AREAS) {
  try {
    const { pdf, featureCount, strokeCount } = await generateMap({
      center: a.center,
      scaleDenominator: a.scale,
      paper: 'A4',
      orientation: 'portrait',
      style: streetOverview,
    });
    writeFileSync(`${OUT_DIR}/tastmap-area-${a.name}.pdf`, pdf);
    console.log(`${a.name}: ${featureCount} matched, ${strokeCount} drawn (1:${a.scale})`);
  } catch (err) {
    console.log(`${a.name}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
  }
  await sleep(1500); // be gentle with public Overpass
}

console.log('done — files in ' + OUT_DIR);
