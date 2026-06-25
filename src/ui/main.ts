import './styles.css';
import {
  DEFAULT_MARGIN_MM,
  generateMap,
  renderTestSheets,
  renderedBBox,
  standard,
  styles,
  type MapParams,
  type Orientation,
  type PaperSize,
  type LabelStyle,
  type LegendEntry,
  type RoadLength,
  type Translator,
  type TrimmedStreet,
} from '../core';
import { geocode } from './geocode';
import { createPicker } from './picker';

// Winsviertel, Prenzlauer Berg — our standing test area: dense, heavily
// micro-mapped Berlin grid that exercises the symbology hard. Tuned so the
// A4@1:5000 footprint frames the whole Kiez — a known-good working area.
const DEFAULT_CENTER = { lng: 13.427263, lat: 52.534571 };

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

const form = el<HTMLFormElement>('map-form');
const searchInput = el<HTMLInputElement>('search');
const searchBtn = el<HTMLButtonElement>('searchbtn');
const scaleInput = el<HTMLInputElement>('scale');
const marginInput = el<HTMLInputElement>('margin');
const titleInput = el<HTMLInputElement>('title');
const paperSelect = el<HTMLSelectElement>('paper');
const orientationSelect = el<HTMLSelectElement>('orientation');
const styleSelect = el<HTMLSelectElement>('style');
const labelStyleSelect = el<HTMLSelectElement>('label-style');
const trimCheckbox = el<HTMLInputElement>('trim');
const statusEl = el<HTMLParagraphElement>('status');
const roadsEl = el<HTMLUListElement>('roads');
const stationsEl = el<HTMLUListElement>('stations');
const stationsHeading = el<HTMLParagraphElement>('stations-heading');
const trimmedEl = el<HTMLUListElement>('trimmed');
const trimmedHeading = el<HTMLParagraphElement>('trimmed-heading');
const downloadEl = el<HTMLAnchorElement>('download');
const previewEl = el<HTMLIFrameElement>('preview');
const generateBtn = el<HTMLButtonElement>('generate');
const testSheetsBtn = el<HTMLButtonElement>('testsheets');

// Populate the style dropdown from the registry.
for (const spec of Object.values(styles)) {
  const opt = document.createElement('option');
  opt.value = spec.id;
  opt.textContent = spec.name;
  styleSelect.append(opt);
}
styleSelect.value = standard.id;

const picker = createPicker(el('picker'), DEFAULT_CENTER);

function orientation(): Orientation {
  return orientationSelect.value as Orientation;
}

function readMargin(): number {
  const m = parseFloat(marginInput.value);
  return Number.isFinite(m) && m >= 0 ? m : DEFAULT_MARGIN_MM;
}

function readParams(): MapParams {
  return {
    center: picker.getCenter(),
    scaleDenominator: parseInt(scaleInput.value, 10),
    paper: paperSelect.value as PaperSize,
    orientation: orientation(),
    style: styles[styleSelect.value] ?? standard,
    labelStyle: labelStyleSelect.value as LabelStyle,
    marginMm: readMargin(),
    title: titleInput.value.trim() || 'Winsviertel',
    trimEdgeSnippets: trimCheckbox.checked,
  };
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

// --- URL state: every input lives in the query string, so a refresh restores the
// settings and any configuration can be opened directly by link (no clicking the
// form). Programmatic value changes (applyUrlState, picker.setCenter) don't fire
// input/change events, so writing the URL from those listeners can't loop. ---
const CENTER_PRECISION = 6;

function syncUrlState(): void {
  const c = picker.getCenter();
  const p = new URLSearchParams();
  p.set('lat', c.lat.toFixed(CENTER_PRECISION));
  p.set('lng', c.lng.toFixed(CENTER_PRECISION));
  p.set('scale', scaleInput.value);
  p.set('paper', paperSelect.value);
  p.set('orient', orientationSelect.value);
  p.set('margin', marginInput.value);
  p.set('style', styleSelect.value);
  p.set('label', labelStyleSelect.value);
  p.set('trim', trimCheckbox.checked ? '1' : '0');
  if (titleInput.value.trim()) p.set('title', titleInput.value.trim());
  if (searchInput.value.trim()) p.set('q', searchInput.value.trim());
  history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
}

/** Apply settings from the query string to the form + picker. Returns true when
 *  the URL carried any config (so the caller can render it straight away). */
function applyUrlState(): boolean {
  const p = new URLSearchParams(location.search);
  if ([...p.keys()].length === 0) return false;
  const setSelect = (sel: HTMLSelectElement, key: string): void => {
    const v = p.get(key);
    if (v != null && [...sel.options].some((o) => o.value === v)) sel.value = v;
  };
  const setInput = (inp: HTMLInputElement, key: string): void => {
    const v = p.get(key);
    if (v != null) inp.value = v;
  };
  setInput(scaleInput, 'scale');
  setInput(marginInput, 'margin');
  setInput(titleInput, 'title');
  setInput(searchInput, 'q');
  setSelect(paperSelect, 'paper');
  setSelect(orientationSelect, 'orient');
  setSelect(styleSelect, 'style');
  setSelect(labelStyleSelect, 'label');
  if (p.get('trim') != null) trimCheckbox.checked = p.get('trim') === '1';
  const lat = parseFloat(p.get('lat') ?? '');
  const lng = parseFloat(p.get('lng') ?? '');
  if (Number.isFinite(lat) && Number.isFinite(lng)) picker.setCenter({ lat, lng });
  return true;
}

/** Render the combined legend + length list (code — name — length), longest
 *  first; clears when empty. The code prefix is the label legend — the on-paper
 *  map carries the codes/badges, so this list is where the mapping lives. */
function showRoads(roads: RoadLength[], legend: LegendEntry[]): void {
  const codeByName = new Map(legend.map((e) => [e.name, e.code]));
  roadsEl.replaceChildren();
  for (const r of roads) {
    const code = codeByName.get(r.name);
    const li = document.createElement('li');
    li.textContent = `${code ? `${code} — ` : ''}${r.name} — ${Math.round(r.lengthM)} m`;
    roadsEl.append(li);
  }
}

/** Render the station key (code — name), longest list first; hides when empty. */
function showStations(stations: LegendEntry[]): void {
  stationsHeading.hidden = stations.length === 0;
  stationsHeading.textContent = `Stations (${stations.length}):`;
  stationsEl.replaceChildren();
  for (const s of stations) {
    const li = document.createElement('li');
    li.textContent = `${s.code} — ${s.name}`;
    stationsEl.append(li);
  }
}

/** Render the list of streets removed by trimming; hides its heading when none. */
function showTrimmed(trimmed: TrimmedStreet[]): void {
  trimmedHeading.hidden = trimmed.length === 0;
  trimmedHeading.textContent = `Trimmed streets (${trimmed.length}):`;
  trimmedEl.replaceChildren();
  for (const t of trimmed) {
    const li = document.createElement('li');
    li.textContent = `${t.name ?? 'unnamed'} — ${Math.round(t.lengthM)} m`;
    trimmedEl.append(li);
  }
}

function refreshFootprint(): void {
  const p = readParams();
  if (!p.scaleDenominator) return;
  // Show the printable area (inside the margins) — what the reader actually gets.
  picker.setFootprint(
    renderedBBox(
      { center: p.center, scaleDenominator: p.scaleDenominator, paper: p.paper, orientation: p.orientation },
      p.marginMm,
    ),
  );
}

picker.onCenterChange(() => {
  refreshFootprint();
  syncUrlState();
});

// Any setting that changes coverage → refresh footprint.
for (const ctl of [scaleInput, marginInput, paperSelect, orientationSelect]) {
  ctl.addEventListener('change', refreshFootprint);
}

// Persist every input to the URL on change (and live typing).
for (const ctl of [scaleInput, marginInput, titleInput, searchInput, paperSelect, orientationSelect, styleSelect, labelStyleSelect, trimCheckbox]) {
  ctl.addEventListener('input', syncUrlState);
  ctl.addEventListener('change', syncUrlState);
}

// --- Address search (geocode → recentre) ---
async function runSearch(): Promise<void> {
  const q = searchInput.value.trim();
  if (!q) return;
  searchBtn.disabled = true;
  setStatus(`Searching for “${q}”…`);
  try {
    const result = await geocode(q);
    if (!result) {
      setStatus(`No match for “${q}”.`);
      return;
    }
    picker.setCenter(result.center);
    refreshFootprint();
    syncUrlState();
    setStatus(`Location: ${result.displayName}`);
  } catch (err) {
    setStatus('Search error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    searchBtn.disabled = false;
  }
}
searchBtn.addEventListener('click', () => void runSearch());
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault(); // don't submit the form
    void runSearch();
  }
});

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
  const buttons = [generateBtn, testSheetsBtn];
  for (const b of buttons) b.disabled = true;
  showRoads([], []);
  showStations([]);
  showTrimmed([]);
  setStatus(busyMessage);
  try {
    await run();
  } catch (err) {
    setStatus('Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    for (const b of buttons) b.disabled = false;
  }
}

// Load the German braille engine lazily in the background (its WASM build +
// tables are a large chunk); until ready (or if it fails) maps use the built-in
// uncontracted placeholder translator.
let translator: Translator | undefined;
void import('./liblouis')
  .then((m) => m.loadLiblouisTranslator(1))
  .then((t) => {
    if (t) translator = t;
  });

function runGenerate(): void {
  const params = readParams();
  if (!params.scaleDenominator || params.scaleDenominator < 1) {
    setStatus('Please enter a valid scale.');
    return;
  }

  void withBusy('Fetching OpenStreetMap data and rendering…', async () => {
    const { pdf, strokeCount, roads, labelStyle, legend, labelsPlaced, labelsDropped, stations, stationsPlaced, stationsDropped, trimmed } =
      await generateMap({ ...params, translator });
    showPdf(pdf, 'tastmap.pdf');
    showRoads(roads, legend);
    showStations(stations);
    showTrimmed(trimmed);
    const braille = translator ? 'liblouis German' : 'placeholder braille';
    const placedNoun = labelStyle === 'index' ? 'index badges' : 'braille codes';
    const labelNote =
      labelStyle === 'none'
        ? 'No street labels'
        : `${labelsPlaced} ${placedNoun} placed${labelsDropped ? `, ${labelsDropped} didn't fit` : ''}`;
    const stationNote = stationsPlaced
      ? ` ${stationsPlaced} station badge${stationsPlaced === 1 ? '' : 's'}${stationsDropped ? `, ${stationsDropped} didn't fit` : ''}.`
      : '';
    setStatus(
      `Done — ${strokeCount} strokes (furniture braille: ${braille}). ${labelNote}.${stationNote} ${roads.length} named roads in this section:`,
    );
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  runGenerate();
});

testSheetsBtn.addEventListener('click', () => {
  void withBusy('Rendering test-sheet gallery…', async () => {
    const pdf = await renderTestSheets();
    showPdf(pdf, 'tastmap-test-sheets.pdf');
    setStatus('Done — 3-page test gallery. Print all, fuse, and feel what works.');
  });
});

// Restore settings from the URL, normalise it (fill in defaults), and — if the
// link carried a config — render it straight away, so opening a URL reproduces
// the map without touching the form.
const openedWithConfig = applyUrlState();
syncUrlState();
refreshFootprint();
if (openedWithConfig) runGenerate();
