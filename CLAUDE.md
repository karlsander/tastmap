# CLAUDE.md

Tactile-map generator: OpenStreetMap → printable A4/A3 **PDF** for swell paper
(Schwellpapier). Browser-based, must itself be accessible. See `README.md` for the
full picture; this file is the working brief.

## Mental model

- Target medium is **1-bit and physical**: black swells ~0.5 mm, white stays flat.
  Areas need **textures, never grey/solid fills**. Lines have widths in **mm**.
  Tactile resolution is coarse (~2–3 mm) → generalize and exaggerate.
- Everything downstream of projection works in **page millimetres**, top-left
  origin, y-down. Only `core/pdf/render` flips to PDF's bottom-left/y-up/points.
- Output is **PDF only**; the browser just shows it. There is intentionally no
  separate visual-preview renderer to keep in sync.

## Conventions

- `core/` is **pure and framework-agnostic** — no DOM, no Leaflet, no UI imports.
  It is the unit-tested part. `ui/` may import `core`, never the reverse.
- The OSM→symbology mapping lives in **declarative style specs** (`core/style`),
  not in the render code, so we can iterate on tactile appearance fast.
- The **scene** model (`core/scene/types`) is the canonical render target; assert
  on it in tests rather than parsing PDF bytes.
- Braille dot spacing is **Marburg Medium / DIN 32976** (`core/braille/spec`).
  Draw dots ourselves; never trust a font for physical spacing. Translation is a
  pluggable `Translator` — swap the placeholder for **liblouis** (German tables).

## Commands

```bash
npm run dev | test | typecheck | build
```

## Known TODOs (load-bearing)

Generalization (simplify + min separation), area textures (helpers exist in
`core/scene/textures` — wire into `buildScene` via `AreaSymbology`), braille
labels + keyed legend, scale bar / north / title.
Line widths in `core/style/defaultStyle.ts` are **unvalidated guesses** until
tested on a real Schwellpapierkopierer — the **calibration sheet**
(`core/calibration`, "Calibration sheet" button) exists to drive that tuning.

Done: clipping + margins (`core/geo/clip`); calibration sheet; ink text in the
PDF backend (pdf-lib StandardFonts); multi-page PDFs (`renderPdfPages`); a
tactile line/area vocabulary (`core/scene/lines` — wavy, beaded, ladder,
parallel-pair, scatter); a condensed **2-page test-sheet gallery**
(`core/testsheets` — p1 lines+patterns, p2 map; "Test sheets" button,
`scripts/testsheets.ts`) — packed, low-text (swell paper is expensive) — for
print-run evaluation of every
candidate width/texture/symbol; feed its results back into `defaultStyle.ts`
and real symbology (`lines`/`textures` are the building blocks to select from).
