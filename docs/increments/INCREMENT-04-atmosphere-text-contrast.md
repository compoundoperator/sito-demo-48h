# Increment 04 — Atmosphere-card text contrast (worst case)

Status: implemented on local branch `claude/atmosphere-text-contrast`, created from `5d29a88` and stacked on Increment 03. One local commit. Not pushed, not merged, not deployed.

## Governance record

- OG DOC LIFECYCLE remains suspended, and the R1-17 derogation authorised by Domizio still applies.
  - The session ran with `--settings {"disableAllHooks":true}`.
  - No OG, Graphify, refresh, sync or Obsidian writeback was invoked.
  - This record must be copied into the canonical vault note when OG updates resume.
- Scope: synthetic development and testing only, on fictional fixtures. No real client data, no external service, no publication, no reinstall.
- Scope decision (Domizio): the 0-failure gate also covers the three visual directions. Their `layer.css` files therefore change (colour only), so the variants are no longer byte-identical.

## Problem

The text of the "atmosfera" cards is drawn over a `::before` gradient (`linear-gradient(200deg, var(--tone-a), var(--tone-b))` at opacity 0.94). The paragraph text has opacity 0.92, and the beauty `default` theme adds a white SVG blob at 16 % on top. Up to Increment 03 this text was **not certified**, because the rendered sweep cannot measure text over a gradient.

Measured before any change with the method below: **27 functional failures**, all on atmosphere text.

| Build | Worst case before |
|---|---|
| `luce-beauty-studio` (beauty default) | 2.84:1 |
| `trusted-classic` | 3.99:1 |
| `modern-premium` | 3.89:1 |
| `distinctive-bold` | 4.17:1 |

## Worst-case measurement method

Applied to every visible text element that is not on a solid background, in 4 standard builds + 3 variants, at 1440 × 900 and 390 × 844 (DPR 1, reduced motion), before and after:
- **B1, analytic:** the text colour, with its alpha × element opacities up to the gradient host, is compared with **every colour stop of every gradient layer** of the host (own `background-image`, `::before`, `::after`, each with its opacity). Each stop is composited over the solid colour beneath the host.
- **B2, pixel:** the element's text is made transparent and the fixed overlays are hidden. **Every rendered pixel** inside each text line box is read from a screenshot and compared with the text colour, alpha-blended per pixel. This includes the blob and every overlapping layer.
- **Result = min(B1, B2).** Threshold 4.5:1, or 3:1 for large text. An element that cannot be measured is UNMEASURED, never PASS.
- **Decorative text** (inside `aria-hidden` containers, such as the hero visual label and the review avatar initials) is measured the same way but reported as "decorative — WCAG 1.4.3 not applicable". It never counts in the WCAG result.
- **Layout signature:** SHA-256 of the box of every element in `<body>`. It must be identical before and after, which proves the change is colour-only.

## Fix (colour only)

| File | Change |
|---|---|
| `templates/beauty-wellness-v1/presets/default/layer.css` | Darker gradient tones per card (`--tone-a`/`--tone-b` → terracotta-deep/darkest, tone2-b/ink, sage-deep/tone3-b), text `var(--color-surface)`, `.atmosfera-card p { opacity: 1 }` |
| `templates/beauty-wellness-v1/presets/modern-premium/layer.css` | The same darker tone pairs (its own tokens), plus the text and opacity rules |
| `templates/beauty-wellness-v1/presets/trusted-classic/layer.css`, `distinctive-bold/layer.css` | Text `var(--color-surface)` and `.atmosfera-card p { opacity: 1 }` only |
| `scripts/variants.test.js` | Standard regression against inc04; exact delta inc04 vs inc03 (the 2 beauty `style.css`). The default-layer allowlist accepts only colour declarations (`color`, `--tone-a`/`--tone-b` on the atmosphere cards, `opacity: 1` on their paragraph). New token-level test: atmosphere text ≥ 4.5:1 against every gradient stop, for default and the three directions. |
| `fixtures/baselines/standard-build-inc04.json` (new) | The new baseline (`derived_from: standard-build-inc03.json`) |

- Each layer file was checked byte for byte: its `5d29a88` version followed only by the authorised INCREMENT-04 block. No pre-existing rule was modified, removed or reordered.
- Exact output delta:
  - standard builds: only `luce-beauty-studio/css/style.css` and `minimal-beauty-demo/css/style.css` change, and the other 86 files are identical;
  - variants: only the 3 directions' `css/style.css` change, and the portal and every other file are identical.
- Baselines 01b251e, inc02 and inc03 are unchanged.

## Verification

<!-- INC04-VERIFICATION:BEGIN -->
Results from the real verification batch on macOS arm64. `npm test` ran on the default Node; Playwright steps ran on Node 22 (`node@22`, keg-only) with Chromium 1194. Nothing was reinstalled.

| Check | Result |
|---|---|
| `npm test` (full suite, incl. `css-integrity.test.js` and the new atmosphere token test) | tests 253, pass 252, fail 0, skipped 1 |
| `npm run validate` on all 4 fixtures | passed |
| Layer content + exact output delta | LAYERS=EXACT (4/4); standard changed: luce-beauty-studio/css/style.css, minimal-beauty-demo/css/style.css; identical: 86 files; variants changed: distinctive-bold/css/style.css, modern-premium/css/style.css, trusted-classic/css/style.css; identical: 64 files; every changed style.css differs only by its layer block (previous SHA-256 reproduced) |
| Baselines 01b251e, inc02, inc03 | unchanged (`git diff --quiet`) |
| New baseline | `fixtures/baselines/standard-build-inc04.json` written only after the delta gate |
| **Functional content: WCAG 1.4.3** (solid sweep + worst case B1 every gradient stop / B2 every real pixel), 4 standard + 3 variants, 1440 and 390 px | `MEASURE_AFTER=PASS`: **0 failures**, 48 worst-case elements measured, none unmeasured |
| **Decorative content** (inside `aria-hidden` containers) | measured with the same method, **exempt**: labelled "decorative — WCAG 1.4.3 not applicable" (or UNMEASURED DECORATIVE), never counted as passed or failed |
| Layout | signature identical before/after on all 14 target/views (colour-only change proved) |
| `npm run qa` on 4 standard builds, 3 variants, portal (390/768/1024/1440, overflow, hidden content, no-JS, print) | passed |
| `verify-variants.js` / `ci-integration-check.js` | passed / passed |

### Functional content (WCAG result)

| Build | View | Solid failures (before → after) | Worst-case elements | Worst-case not passing (before → after) | Decorative (exempt) | Layout |
|---|---|---|---|---|---|---|
| `impianti-elettrici-demo-alfa` | desktop | 0 → 0 | 0 | 0 → 0 | 4 | identical |
| `impianti-elettrici-demo-alfa` | mobile | 0 → 0 | 0 | 0 → 0 | 4 | identical |
| `luce-beauty-studio` | desktop | 0 → 0 | 6 | 4 → 0 | 4 | identical |
| `luce-beauty-studio` | mobile | 0 → 0 | 6 | 6 → 0 | 4 | identical |
| `minimal-beauty-demo` | desktop | 0 → 0 | 0 | 0 → 0 | 1 | identical |
| `minimal-beauty-demo` | mobile | 0 → 0 | 0 | 0 → 0 | 1 | identical |
| `minimal-trades-demo` | desktop | 0 → 0 | 0 | 0 → 0 | 1 | identical |
| `minimal-trades-demo` | mobile | 0 → 0 | 0 | 0 → 0 | 1 | identical |
| `variant-trusted-classic` | desktop | 0 → 0 | 6 | 3 → 0 | 4 | identical |
| `variant-trusted-classic` | mobile | 0 → 0 | 6 | 3 → 0 | 4 | identical |
| `variant-modern-premium` | desktop | 0 → 0 | 6 | 3 → 0 | 4 | identical |
| `variant-modern-premium` | mobile | 0 → 0 | 6 | 6 → 0 | 4 | identical |
| `variant-distinctive-bold` | desktop | 0 → 0 | 6 | 1 → 0 | 4 | identical |
| `variant-distinctive-bold` | mobile | 0 → 0 | 6 | 1 → 0 | 4 | identical |

Atmosphere text, worst case (ratio = min of analytic and pixel):

| Build | View | Element | Before | After: analytic | After: pixel | After: worst |
|---|---|---|---|---|---|---|
| `luce-beauty-studio` | desktop | h3 "Luce naturale" | 3.45 (PASS) | 5.5 | 6.05 | **5.5** PASS (required 3) |
| `luce-beauty-studio` | desktop | p "Ambienti luminosi durante il giorno, per" | 3.17 (FAIL) | 5.5 | 6.14 | **5.5** PASS (required 4.5) |
| `luce-beauty-studio` | desktop | h3 "Materiali caldi" | 3.5 (PASS) | 7.12 | 9.36 | **7.12** PASS (required 3) |
| `luce-beauty-studio` | desktop | p "Legno chiaro, tessuti naturali e dettagl" | 3.23 (FAIL) | 7.12 | 9.55 | **7.12** PASS (required 4.5) |
| `luce-beauty-studio` | desktop | h3 "Cura nei dettagli" | 2.84 (FAIL) | 5.09 | 3.78 | **3.78** PASS (required 3) |
| `luce-beauty-studio` | desktop | p "Dal profumo dell'ambiente alla scelta de" | 2.85 (FAIL) | 5.09 | 5.32 | **5.09** PASS (required 4.5) |
| `luce-beauty-studio` | mobile | h3 "Luce naturale" | 3.45 (FAIL) | 5.5 | 6.17 | **5.5** PASS (required 4.5) |
| `luce-beauty-studio` | mobile | p "Ambienti luminosi durante il giorno, per" | 3.17 (FAIL) | 5.5 | 6.14 | **5.5** PASS (required 4.5) |
| `luce-beauty-studio` | mobile | h3 "Materiali caldi" | 3.5 (FAIL) | 7.12 | 9.85 | **7.12** PASS (required 4.5) |
| `luce-beauty-studio` | mobile | p "Legno chiaro, tessuti naturali e dettagl" | 3.23 (FAIL) | 7.12 | 9.55 | **7.12** PASS (required 4.5) |
| `luce-beauty-studio` | mobile | h3 "Cura nei dettagli" | 3.07 (FAIL) | 5.09 | 5.32 | **5.09** PASS (required 4.5) |
| `luce-beauty-studio` | mobile | p "Dal profumo dell'ambiente alla scelta de" | 2.85 (FAIL) | 5.09 | 5.32 | **5.09** PASS (required 4.5) |
| `variant-trusted-classic` | desktop | h3 "Luce naturale" | 5.48 (PASS) | 5.98 | 6.7 | **5.98** PASS (required 4.5) |
| `variant-trusted-classic` | desktop | p "Ambienti luminosi durante il giorno, per" | 4.93 (PASS) | 5.98 | 6.68 | **5.98** PASS (required 4.5) |
| `variant-trusted-classic` | desktop | h3 "Materiali caldi" | 4.61 (PASS) | 5.02 | 6.24 | **5.02** PASS (required 4.5) |
| `variant-trusted-classic` | desktop | p "Legno chiaro, tessuti naturali e dettagl" | 4.19 (FAIL) | 5.02 | 6.14 | **5.02** PASS (required 4.5) |
| `variant-trusted-classic` | desktop | h3 "Cura nei dettagli" | 4.38 (FAIL) | 4.77 | 5.43 | **4.77** PASS (required 4.5) |
| `variant-trusted-classic` | desktop | p "Dal profumo dell'ambiente alla scelta de" | 3.99 (FAIL) | 4.77 | 5.43 | **4.77** PASS (required 4.5) |
| `variant-trusted-classic` | mobile | h3 "Luce naturale" | 5.48 (PASS) | 5.98 | 6.79 | **5.98** PASS (required 4.5) |
| `variant-trusted-classic` | mobile | p "Ambienti luminosi durante il giorno, per" | 4.93 (PASS) | 5.98 | 6.7 | **5.98** PASS (required 4.5) |
| `variant-trusted-classic` | mobile | h3 "Materiali caldi" | 4.61 (PASS) | 5.02 | 6.31 | **5.02** PASS (required 4.5) |
| `variant-trusted-classic` | mobile | p "Legno chiaro, tessuti naturali e dettagl" | 4.19 (FAIL) | 5.02 | 6.14 | **5.02** PASS (required 4.5) |
| `variant-trusted-classic` | mobile | h3 "Cura nei dettagli" | 4.38 (FAIL) | 4.77 | 5.44 | **4.77** PASS (required 4.5) |
| `variant-trusted-classic` | mobile | p "Dal profumo dell'ambiente alla scelta de" | 3.99 (FAIL) | 4.77 | 5.43 | **4.77** PASS (required 4.5) |
| `variant-modern-premium` | desktop | h3 "Luce naturale" | 4.29 (PASS) | 6.11 | 7.21 | **6.11** PASS (required 3) |
| `variant-modern-premium` | desktop | p "Ambienti luminosi durante il giorno, per" | 3.91 (FAIL) | 6.11 | 7.29 | **6.11** PASS (required 4.5) |
| `variant-modern-premium` | desktop | h3 "Materiali caldi" | 4.27 (PASS) | 9.18 | 12.3 | **9.18** PASS (required 3) |
| `variant-modern-premium` | desktop | p "Legno chiaro, tessuti naturali e dettagl" | 3.89 (FAIL) | 9.18 | 12.31 | **9.18** PASS (required 4.5) |
| `variant-modern-premium` | desktop | h3 "Cura nei dettagli" | 4.41 (PASS) | 6.21 | 7.08 | **6.21** PASS (required 3) |
| `variant-modern-premium` | desktop | p "Dal profumo dell'ambiente alla scelta de" | 4.02 (FAIL) | 6.21 | 7.08 | **6.21** PASS (required 4.5) |
| `variant-modern-premium` | mobile | h3 "Luce naturale" | 4.29 (FAIL) | 6.11 | 7.29 | **6.11** PASS (required 4.5) |
| `variant-modern-premium` | mobile | p "Ambienti luminosi durante il giorno, per" | 3.91 (FAIL) | 6.11 | 7.29 | **6.11** PASS (required 4.5) |
| `variant-modern-premium` | mobile | h3 "Materiali caldi" | 4.27 (FAIL) | 9.18 | 12.3 | **9.18** PASS (required 4.5) |
| `variant-modern-premium` | mobile | p "Legno chiaro, tessuti naturali e dettagl" | 3.89 (FAIL) | 9.18 | 12.31 | **9.18** PASS (required 4.5) |
| `variant-modern-premium` | mobile | h3 "Cura nei dettagli" | 4.41 (FAIL) | 6.21 | 7.08 | **6.21** PASS (required 4.5) |
| `variant-modern-premium` | mobile | p "Dal profumo dell'ambiente alla scelta de" | 4.02 (FAIL) | 6.21 | 7.08 | **6.21** PASS (required 4.5) |
| `variant-distinctive-bold` | desktop | h3 "Luce naturale" | 5.15 (PASS) | 5.46 | 6.15 | **5.46** PASS (required 3) |
| `variant-distinctive-bold` | desktop | p "Ambienti luminosi durante il giorno, per" | 4.56 (PASS) | 5.46 | 6.15 | **5.46** PASS (required 4.5) |
| `variant-distinctive-bold` | desktop | h3 "Materiali caldi" | 8.03 (PASS) | 8.52 | 10.16 | **8.52** PASS (required 3) |
| `variant-distinctive-bold` | desktop | p "Legno chiaro, tessuti naturali e dettagl" | 7.08 (PASS) | 8.52 | 10.13 | **8.52** PASS (required 4.5) |
| `variant-distinctive-bold` | desktop | h3 "Cura nei dettagli" | 4.62 (PASS) | 4.9 | 5.5 | **4.9** PASS (required 3) |
| `variant-distinctive-bold` | desktop | p "Dal profumo dell'ambiente alla scelta de" | 4.17 (FAIL) | 4.9 | 5.57 | **4.9** PASS (required 4.5) |
| `variant-distinctive-bold` | mobile | h3 "Luce naturale" | 5.15 (PASS) | 5.46 | 6.2 | **5.46** PASS (required 3) |
| `variant-distinctive-bold` | mobile | p "Ambienti luminosi durante il giorno, per" | 4.56 (PASS) | 5.46 | 6.15 | **5.46** PASS (required 4.5) |
| `variant-distinctive-bold` | mobile | h3 "Materiali caldi" | 8.03 (PASS) | 8.52 | 10.31 | **8.52** PASS (required 3) |
| `variant-distinctive-bold` | mobile | p "Legno chiaro, tessuti naturali e dettagl" | 7.08 (PASS) | 8.52 | 10.16 | **8.52** PASS (required 4.5) |
| `variant-distinctive-bold` | mobile | h3 "Cura nei dettagli" | 4.62 (PASS) | 4.9 | 5.58 | **4.9** PASS (required 3) |
| `variant-distinctive-bold` | mobile | p "Dal profumo dell'ambiente alla scelta de" | 4.17 (FAIL) | 4.9 | 5.58 | **4.9** PASS (required 4.5) |

### Decorative content (measured, exempt from WCAG 1.4.3)

| Build | View | Element | Analytic | Pixel | Worst | Status |
|---|---|---|---|---|---|---|
| `impianti-elettrici-demo-alfa` | desktop | p "Spazio dedicato a una foto del lavoro sv" | 11.49 | 12.56 | 11.49 | decorative — WCAG 1.4.3 not applicable |
| `impianti-elettrici-demo-alfa` | desktop | div "M." | 8.25 | 8.25 | 8.25 | decorative — WCAG 1.4.3 not applicable |
| `impianti-elettrici-demo-alfa` | desktop | div "E." | 8.25 | 8.25 | 8.25 | decorative — WCAG 1.4.3 not applicable |
| `impianti-elettrici-demo-alfa` | desktop | div "D." | 8.25 | 8.25 | 8.25 | decorative — WCAG 1.4.3 not applicable |
| `impianti-elettrici-demo-alfa` | mobile | p "Spazio dedicato a una foto del lavoro sv" | 11.49 | 12.59 | 11.49 | decorative — WCAG 1.4.3 not applicable |
| `impianti-elettrici-demo-alfa` | mobile | div "M." | 8.25 | 8.25 | 8.25 | decorative — WCAG 1.4.3 not applicable |
| `impianti-elettrici-demo-alfa` | mobile | div "E." | 8.25 | 8.25 | 8.25 | decorative — WCAG 1.4.3 not applicable |
| `impianti-elettrici-demo-alfa` | mobile | div "D." | 8.25 | 8.25 | 8.25 | decorative — WCAG 1.4.3 not applicable |
| `luce-beauty-studio` | desktop | p "Spazio dedicato alla foto o illustrazion" | 12.73 | 13.71 | 12.73 | decorative — WCAG 1.4.3 not applicable |
| `luce-beauty-studio` | desktop | div "G." | 5.17 | 5.17 | 5.17 | decorative — WCAG 1.4.3 not applicable |
| `luce-beauty-studio` | desktop | div "M." | 5.17 | 5.17 | 5.17 | decorative — WCAG 1.4.3 not applicable |
| `luce-beauty-studio` | desktop | div "S." | 5.17 | 5.17 | 5.17 | decorative — WCAG 1.4.3 not applicable |
| `luce-beauty-studio` | mobile | p "Spazio dedicato alla foto o illustrazion" | 12.73 | 13.71 | 12.73 | decorative — WCAG 1.4.3 not applicable |
| `luce-beauty-studio` | mobile | div "G." | 5.17 | 5.17 | 5.17 | decorative — WCAG 1.4.3 not applicable |
| `luce-beauty-studio` | mobile | div "M." | 5.17 | 5.17 | 5.17 | decorative — WCAG 1.4.3 not applicable |
| `luce-beauty-studio` | mobile | div "S." | 5.17 | 5.17 | 5.17 | decorative — WCAG 1.4.3 not applicable |
| `minimal-beauty-demo` | desktop | p "Spazio dedicato alla foto o illustrazion" | 12.73 | 13.71 | 12.73 | decorative — WCAG 1.4.3 not applicable |
| `minimal-beauty-demo` | mobile | p "Spazio dedicato alla foto o illustrazion" | 12.73 | 13.71 | 12.73 | decorative — WCAG 1.4.3 not applicable |
| `minimal-trades-demo` | desktop | p "Spazio dedicato a una foto del lavoro sv" | 11.49 | 12.56 | 11.49 | decorative — WCAG 1.4.3 not applicable |
| `minimal-trades-demo` | mobile | p "Spazio dedicato a una foto del lavoro sv" | 11.49 | 12.59 | 11.49 | decorative — WCAG 1.4.3 not applicable |
| `variant-trusted-classic` | desktop | p "Spazio dedicato alla foto o illustrazion" | 14.06 | 13.98 | 13.98 | decorative — WCAG 1.4.3 not applicable |
| `variant-trusted-classic` | desktop | div "G." | 7.57 | 7.57 | 7.57 | decorative — WCAG 1.4.3 not applicable |
| `variant-trusted-classic` | desktop | div "M." | 7.57 | 7.57 | 7.57 | decorative — WCAG 1.4.3 not applicable |
| `variant-trusted-classic` | desktop | div "S." | 7.57 | 7.57 | 7.57 | decorative — WCAG 1.4.3 not applicable |
| `variant-trusted-classic` | mobile | p "Spazio dedicato alla foto o illustrazion" | 14.06 | 13.98 | 13.98 | decorative — WCAG 1.4.3 not applicable |
| `variant-trusted-classic` | mobile | div "G." | 7.57 | 7.57 | 7.57 | decorative — WCAG 1.4.3 not applicable |
| `variant-trusted-classic` | mobile | div "M." | 7.57 | 7.57 | 7.57 | decorative — WCAG 1.4.3 not applicable |
| `variant-trusted-classic` | mobile | div "S." | 7.57 | 7.57 | 7.57 | decorative — WCAG 1.4.3 not applicable |
| `variant-modern-premium` | desktop | p "Spazio dedicato alla foto o illustrazion" | 15.82 | 15.6 | 15.6 | decorative — WCAG 1.4.3 not applicable |
| `variant-modern-premium` | desktop | div "G." | 5.8 | 5.8 | 5.8 | decorative — WCAG 1.4.3 not applicable |
| `variant-modern-premium` | desktop | div "M." | 5.8 | 5.8 | 5.8 | decorative — WCAG 1.4.3 not applicable |
| `variant-modern-premium` | desktop | div "S." | 5.8 | 5.8 | 5.8 | decorative — WCAG 1.4.3 not applicable |
| `variant-modern-premium` | mobile | p "Spazio dedicato alla foto o illustrazion" | 15.82 | 15.6 | 15.6 | decorative — WCAG 1.4.3 not applicable |
| `variant-modern-premium` | mobile | div "G." | 5.8 | 5.8 | 5.8 | decorative — WCAG 1.4.3 not applicable |
| `variant-modern-premium` | mobile | div "M." | 5.8 | 5.8 | 5.8 | decorative — WCAG 1.4.3 not applicable |
| `variant-modern-premium` | mobile | div "S." | 5.8 | 5.8 | 5.8 | decorative — WCAG 1.4.3 not applicable |
| `variant-distinctive-bold` | desktop | p "Spazio dedicato alla foto o illustrazion" | 16.95 | 16.97 | 16.95 | decorative — WCAG 1.4.3 not applicable |
| `variant-distinctive-bold` | desktop | div "G." | 6.91 | 6.91 | 6.91 | decorative — WCAG 1.4.3 not applicable |
| `variant-distinctive-bold` | desktop | div "M." | 6.91 | 6.91 | 6.91 | decorative — WCAG 1.4.3 not applicable |
| `variant-distinctive-bold` | desktop | div "S." | 6.91 | 6.91 | 6.91 | decorative — WCAG 1.4.3 not applicable |
| `variant-distinctive-bold` | mobile | p "Spazio dedicato alla foto o illustrazion" | 16.95 | 16.97 | 16.95 | decorative — WCAG 1.4.3 not applicable |
| `variant-distinctive-bold` | mobile | div "G." | 6.91 | 6.91 | 6.91 | decorative — WCAG 1.4.3 not applicable |
| `variant-distinctive-bold` | mobile | div "M." | 6.91 | 6.91 | 6.91 | decorative — WCAG 1.4.3 not applicable |
| `variant-distinctive-bold` | mobile | div "S." | 6.91 | 6.91 | 6.91 | decorative — WCAG 1.4.3 not applicable |

Screenshots for human review (local, gitignored): `qa-output/inc04/{before,after}/<build>-{hero,atmosfera}-{desktop,mobile}.png`, `qa-output/inc04/{before,after}.json`. Human visual review is still pending.
<!-- INC04-VERIFICATION:END -->

## Limits

- Pixel sampling measures the real rendering at 1440 and 390 px in Chromium. Other widths and browsers render the same CSS but were not sampled.
- Decorative `aria-hidden` text is outside WCAG 1.4.3 and is only reported.
- macOS only; Linux CI was not run, because no push is authorised.

## Next step

Unchanged: protected preview → automatic feedback → revisions → finalisation and delivery → orchestrator.
