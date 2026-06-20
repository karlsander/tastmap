import './styles.css';
import {
  DEFAULT_MARGIN_MM,
  generateMap,
  renderCalibration,
  renderTestSheets,
  renderedBBox,
  streetOverview,
  styles,
  type MapParams,
  type Orientation,
  type PaperSize,
} from '../core';
import { createPicker } from './picker';

// Marburg — fitting home of the braille standard we target.
const DEFAULT_CENTER = { lng: 8.7665, lat: 50.8021 };

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

const form = el<HTMLFormElement>('map-form');
const latInput = el<HTMLInputElement>('lat');
const lngInput = el<HTMLInputElement>('lng');
const scaleInput = el<HTMLInputElement>('scale');
const marginInput = el<HTMLInputElement>('margin');
const paperSelect = el<HTMLSelectElement>('paper');
const styleSelect = el<HTMLSelectElement>('style');
const statusEl = el<HTMLParagraphElement>('status');
const downloadEl = el<HTMLAnchorElement>('download');
const previewEl = el<HTMLIFrameElement>('preview');
const generateBtn = el<HTMLButtonElement>('generate');
const calibrateBtn = el<HTMLButtonElement>('calibrate');
const testSheetsBtn = el<HTMLButtonElement>('testsheets');

// Populate the style dropdown from the registry.
for (const spec of Object.values(styles)) {
  const opt = document.createElement('option');
  opt.value = spec.id;
  opt.textContent = spec.name;
  styleSelect.append(opt);
}
styleSelect.value = streetOverview.id;

latInput.value = DEFAULT_CENTER.lat.toFixed(5);
lngInput.value = DEFAULT_CENTER.lng.toFixed(5);

const picker = createPicker(el('picker'), DEFAULT_CENTER);

function orientation(): Orientation {
  const checked = form.querySelector<HTMLInputElement>('input[name="orientation"]:checked');
  return (checked?.value as Orientation) ?? 'portrait';
}

function readMargin(): number {
  const m = parseFloat(marginInput.value);
  return Number.isFinite(m) && m >= 0 ? m : DEFAULT_MARGIN_MM;
}

function readParams(): MapParams {
  return {
    center: { lat: parseFloat(latInput.value), lng: parseFloat(lngInput.value) },
    scaleDenominator: parseInt(scaleInput.value, 10),
    paper: paperSelect.value as PaperSize,
    orientation: orientation(),
    style: styles[styleSelect.value] ?? streetOverview,
    marginMm: readMargin(),
  };
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function refreshFootprint(): void {
  const p = readParams();
  if (Number.isNaN(p.center.lat) || Number.isNaN(p.center.lng) || !p.scaleDenominator) return;
  // Show the printable area (inside the margins) — what the reader actually gets.
  picker.setFootprint(
    renderedBBox(
      {
        center: p.center,
        scaleDenominator: p.scaleDenominator,
        paper: p.paper,
        orientation: p.orientation,
      },
      p.marginMm,
    ),
  );
}

// Marker drag/click → sync inputs, refresh footprint.
picker.onCenterChange((c) => {
  latInput.value = c.lat.toFixed(5);
  lngInput.value = c.lng.toFixed(5);
  refreshFootprint();
});

// Typed coordinates → move marker (no callback) and refresh.
for (const input of [latInput, lngInput]) {
  input.addEventListener('change', () => {
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) picker.setCenter({ lat, lng });
    refreshFootprint();
  });
}

// Any setting that changes coverage → refresh footprint.
for (const ctl of [scaleInput, marginInput, paperSelect]) {
  ctl.addEventListener('change', refreshFootprint);
}
form.querySelectorAll('input[name="orientation"]').forEach((r) =>
  r.addEventListener('change', refreshFootprint),
);

let lastUrl: string | null = null;

/** Show a freshly generated PDF in the preview and wire up the download link. */
function showPdf(pdf: Uint8Array, downloadName: string): void {
  const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  previewEl.src = lastUrl;
  downloadEl.href = lastUrl;
  downloadEl.download = downloadName;
  downloadEl.hidden = false;
}

/** Run an async PDF producer while disabling the buttons and reporting status. */
async function withBusy(busyMessage: string, run: () => Promise<void>): Promise<void> {
  const buttons = [generateBtn, calibrateBtn, testSheetsBtn];
  for (const b of buttons) b.disabled = true;
  setStatus(busyMessage);
  try {
    await run();
  } catch (err) {
    setStatus('Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    for (const b of buttons) b.disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const params = readParams();
  if (Number.isNaN(params.center.lat) || Number.isNaN(params.center.lng)) {
    setStatus('Please choose a location.');
    return;
  }
  if (!params.scaleDenominator || params.scaleDenominator < 1) {
    setStatus('Please enter a valid scale.');
    return;
  }

  void withBusy('Fetching OpenStreetMap data and rendering…', async () => {
    const { pdf, featureCount, strokeCount } = await generateMap(params);
    showPdf(pdf, 'tastmap.pdf');
    setStatus(`Done — ${featureCount} features matched, ${strokeCount} strokes drawn.`);
  });
});

calibrateBtn.addEventListener('click', () => {
  void withBusy('Rendering calibration sheet…', async () => {
    const pdf = await renderCalibration({ paper: paperSelect.value as PaperSize, marginMm: readMargin() });
    showPdf(pdf, 'tastmap-calibration.pdf');
    setStatus('Done — calibration sheet. Print on Schwellpapier, fuse, then feel each row.');
  });
});

testSheetsBtn.addEventListener('click', () => {
  void withBusy('Rendering test-sheet gallery…', async () => {
    const pdf = await renderTestSheets();
    showPdf(pdf, 'tastmap-test-sheets.pdf');
    setStatus('Done — 2-page test gallery. Print both, fuse, and feel what works.');
  });
});

refreshFootprint();
