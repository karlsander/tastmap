# AGENTS.md

Empirically validated facts for tactile output. Unlike guesses in code comments,
everything here was **felt on a real fused Schwellpapier print**. Treat these as
ground truth; the source of truth in code is `src/core/style/vocabulary.ts`.

See also `CLAUDE.md` (architecture / working brief) and `README.md`.

## Tactile line vocabulary (the 5 line types)

Validated on **print run 1 (2026-06-21)**. Use these for roads / paths / borders /
water / rail — don't invent ad-hoc widths. Encoded in `core/style/vocabulary.ts`
as `TACTILE_LINES`.

| Name | Spec | Notes |
| --- | --- | --- |
| **thin line** | solid 0.3 mm | thinnest still-followable line |
| **normal line** | solid 0.8 mm | default road/feature line |
| **thick line** | solid 2.0 mm | strong emphasis |
| **double line road** | two 0.5 mm lines, 1.5 mm gap | reads clearly as one traceable road; from the "separation 0.5 (gap)" sample labelled 1.5 |
| **dotted line** | round dots, 3 mm apart, r 0.6 | clearest dotted (test sample "d3") |
| **dashed line** | 3 mm dash / 1.5 mm gap | distinct from both dotted and solid (test sample "3/1.5") |

(Three solid widths + double + dotted + dashed.)

A **rail line** is being trialled as a 6th type (centre line + cross-ties, and a
ties-only variant) — see page 1 of the test sheets; not yet finalised.

## Area fill patterns (validated)

Encoded as `TACTILE_AREAS` in `core/style/vocabulary.ts`. Distinct under the
finger and usable even in small areas:

- **cross-hatch x2** (2 mm) and **dot grid 2.5** — two clear, all-purpose fills.
- **directional hatches at 2.5 mm** — horizontal / `/` / vertical / `\` — read as
  *directions* (the finger follows the grooves); good for conveying orientation.
- **Avoid solid fills**: they print but feel unpleasant (raise too much / too
  soft). For a "solid"-looking area use a **dense cross-hatch (x1 or x0.5)**
  instead (being trialled on test-sheet page 3).

## Key findings — print run 1 (2026-06-21)

- **Results were very good** — all tested line widths (0.2–2.0 mm) print and
  swell well.
- **Minimum usable width ≈ 0.3 mm.** 0.2 mm swells but is too thin to follow by
  finger → `MIN_LINE_WIDTH_MM = 0.3`. Don't emit lines thinner than this.
- Two close parallel lines are a strong, distinct way to render a single road
  ("double line road").
- Patterns: see "Area fill patterns" above.

## How to apply

- Pick road/path/border styles from `TACTILE_LINES`; keep every stroke ≥ 0.3 mm.
- `core/style/defaultStyle.ts` now maps: major → thick (2.0), minor → normal
  (0.8), paths → dashed (3/1.5). **The class → line-type mapping is provisional**
  — refine it after the next print.
- **Not yet wired into rendering:** `double` and `dotted` patterns exist in the
  vocabulary but `LineSymbology` / `core/scene/build` only render solid + dashed
  strokes today. Next step to make the full vocabulary usable: extend
  `LineSymbology` with a pattern (use `parallelPair` for double, `beadedPath` for
  dotted from `core/scene/lines`) and render it in `buildScene`.

## Calibration workflow

1. Generate the **Test sheets** (3 pages: lines / map / textures) and
   **Calibration sheet**; tick **Ghost text** to print the fuse-ready, label-free
   version (heated text turns to mush); keep the normal PDF as the key.
2. Fuse, feel, and record what reads → update `vocabulary.ts` and this file.
3. Open questions still on the test sheets to settle (all on p3 now): the **rail**
   line type; textured **landmass edges** (outline vs raw); **lines through
   textures** with a **2 mm clearing** (over h45 / x2 / dots2.5); **cross-hatch
   "solid"** density (x1 vs x0.5); **icon strength** (0.4/0.8/1.4 mm); plus min
   feature **separation** for generalization and braille dot legibility.
