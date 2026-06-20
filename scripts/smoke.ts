// Headless end-to-end check: run the real pipeline against live Overpass and
// write a PDF. Run with: npx vite-node scripts/smoke.ts
import { writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { generateMap, streetOverview } from '../src/core/index';

const OUT = '/tmp/tastmap-smoke.pdf';
const PT_PER_MM = 72 / 25.4;

console.log('Fetching from Overpass and rendering…');
const t0 = performance.now();

const { pdf, featureCount, strokeCount } = await generateMap({
  center: { lng: 8.7665, lat: 50.8021 }, // Marburg
  scaleDenominator: 2500,
  paper: 'A4',
  orientation: 'portrait',
  style: streetOverview,
});

const ms = Math.round(performance.now() - t0);
writeFileSync(OUT, pdf);

// Load it back to confirm it is a valid PDF at the right physical size.
const doc = await PDFDocument.load(pdf);
const { width, height } = doc.getPage(0).getSize();

console.log(`ok in ${ms} ms`);
console.log(`features matched:  ${featureCount}`);
console.log(`strokes drawn:     ${strokeCount}`);
console.log(`pdf bytes:        ${pdf.byteLength}`);
console.log(`pages:            ${doc.getPageCount()}`);
console.log(
  `page size:        ${width.toFixed(1)} x ${height.toFixed(1)} pt ` +
    `(${(width / PT_PER_MM).toFixed(1)} x ${(height / PT_PER_MM).toFixed(1)} mm)`,
);
console.log(`written to:       ${OUT}`);
