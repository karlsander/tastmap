# Tastmap

A browser tool that turns OpenStreetMap data into **tactile maps** for blind and
visually impaired users. You pick a location, scale, paper size, and style; it
produces a printable A4/A3 **PDF**. Printed onto swell paper (German
*Schwellpapier*) and run through a fuser (*Schwellpapierkopierer*), the black
content rises into a raised, touchable map.

> Status: proof of concept. The first vertical slice works end to end — pick an
> area → fetch roads → render a scaled, correctly-sized PDF. Textures, braille
> labels, and the legend are scaffolded but not yet wired into the map.

## The constraint that drives everything

Swell paper is a **1-bit physical medium**: black absorbs infrared and rises
~0.5 mm; white stays flat. Cartography decisions follow from that:

- **No greys, no halftones** for areas — different surfaces need distinct
  *textures* (hatch, dot grids), not shades.
- **Line widths are physical** (millimetres), calibrated to what reliably swells.
- **Tactile resolution is coarse** — features closer than ~2–3 mm read as one, so
  we deliberately generalize, exaggerate, and drop detail.
- **Braille is large and spec-bound** (Marburg Medium / DIN 32976: 2.5 mm dot
  pitch, 6 mm cell pitch), so labelling is a first-class layout problem.

No existing tile/style engine fits (they are raster, screen-DPI, grey-capable,
latitude-distorted). Hence a custom OSM → PDF pipeline.

## Pipeline

```
Select → Fetch → Normalize → Project → Classify → Generalize → Label → Scene → PDF
                                                                          └─ shown in <iframe> + Download
```

| Stage | Module | Notes |
| --- | --- | --- |
| Select | `ui/` | Leaflet map used **only** to pick the area, never for output |
| Fetch | `core/osm/overpass` | Overpass API, only the tag keys the style needs |
| Normalize | `core/osm/normalize` | Overpass `out geom` → typed features |
| Project | `core/geo/projection` | lng/lat → page **millimetres**; honest 1:N scale |
| Classify | `core/style` | declarative style spec maps tags → symbology |
| Generalize | `core/scene/build` | (TODO) simplify, min-size, clip, displace |
| Label | `core/braille` | (TODO) liblouis translate → dot layout → legend |
| Scene | `core/scene` | typed mm primitives — the canonical, testable model |
| PDF | `core/pdf/render` | pdf-lib, exact physical size, vector, all black |

## Key decisions

| Decision | Choice |
| --- | --- |
| Output | **PDF only**, shown in the browser's native viewer + Download. The visual preview is not a first-rate concern (users are blind); the PDF is the deliverable. |
| Renderer | One renderer (`pdf-lib`) over a thin, testable **scene** model. |
| Braille | **Computed dots** at exact Marburg Medium spec. `liblouis` (German tables) for translation in production; a simple uncontracted translator stands in for now. |
| Labels | **Keyed legend** primary (short braille keys on the map, names in a legend); direct/hybrid labels later. |
| Frontend | **Vanilla TS + Vite** — minimal, accessible by being basic; `core/` stays framework-agnostic. |

## Project layout

```
src/
  core/              framework-agnostic pipeline (pure TS, unit-tested)
    geo/             coordinates, projection, scale, paper sizes
    osm/             Overpass fetch + normalize
    style/           declarative style spec + classifier
    scene/           typed mm render model + builder
    braille/         Marburg Medium spec, translation, dot geometry
    pdf/             scene → PDF (pdf-lib)
    pipeline.ts      params → PDF orchestration
    index.ts         public surface of core
  ui/                semantic form, Leaflet picker, preview + download
index.html
```

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build
```

The PoC calls the public Overpass API and OSM tile servers directly from the
browser. Be gentle with them; for production we'll add caching and likely a
self-hosted Overpass or PBF extract behind the `core/osm` abstraction.

## Roadmap

- [x] Clip geometry to the printable area; apply margins.
- [x] Calibration sheet to tune line widths/textures to a specific fuser.
- [ ] Generalization: simplify, enforce minimum feature size & separation.
- [ ] Area features with tactile **textures** (hatch / dot grids) — fill
      helpers exist in `core/scene/textures`; wire into the area pipeline.
- [ ] Braille labels via liblouis + collision-aware placement.
- [ ] Keyed legend page (braille + ink).
- [ ] Scale bar, north indicator, title block (braille + ink).
- [ ] Sidewalk / crossing detail style.

## Attribution

Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).
