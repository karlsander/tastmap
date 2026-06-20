import './styles.css';
import {
  coverageBBox,
  generateMap,
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
const paperSelect = el<HTMLSelectElement>('paper');
const styleSelect = el<HTMLSelectElement>('style');
const statusEl = el<HTMLParagraphElement>('status');
const downloadEl = el<HTMLAnchorElement>('download');
const previewEl = el<HTMLIFrameElement>('preview');
const generateBtn = el<HTMLButtonElement>('generate');

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

function readParams(): MapParams {
  return {
    center: { lat: parseFloat(latInput.value), lng: parseFloat(lngInput.value) },
    scaleDenominator: parseInt(scaleInput.value, 10),
    paper: paperSelect.value as PaperSize,
    orientation: orientation(),
    style: styles[styleSelect.value] ?? streetOverview,
  };
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function refreshFootprint(): void {
  const p = readParams();
  if (Number.isNaN(p.center.lat) || Number.isNaN(p.center.lng) || !p.scaleDenominator) return;
  picker.setFootprint(
    coverageBBox(
      {
        center: p.center,
        scaleDenominator: p.scaleDenominator,
        paper: p.paper,
        orientation: p.orientation,
      },
      1.0,
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
for (const ctl of [scaleInput, paperSelect]) {
  ctl.addEventListener('change', refreshFootprint);
}
form.querySelectorAll('input[name="orientation"]').forEach((r) =>
  r.addEventListener('change', refreshFootprint),
);

let lastUrl: string | null = null;

form.addEventListener('submit', async (e) => {
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

  generateBtn.disabled = true;
  setStatus('Fetching OpenStreetMap data and rendering…');
  try {
    const { pdf, featureCount } = await generateMap(params);
    const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    previewEl.src = lastUrl;
    downloadEl.href = lastUrl;
    downloadEl.hidden = false;
    setStatus(`Done — ${featureCount} features rendered.`);
  } catch (err) {
    setStatus('Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    generateBtn.disabled = false;
  }
});

refreshFootprint();
