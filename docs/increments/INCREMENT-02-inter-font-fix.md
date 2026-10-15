# Increment 02 — Inter font fix in the standard build

Status: implemented on local branch `claude/standard-inter-font-fix`, created from `c8273d0` and stacked on Increment 01's `claude/visual-directions-v1`. One local commit. Not pushed, not merged, not deployed.

## Governance record

- OG DOC LIFECYCLE remains suspended, and the R1-17 derogation authorised by Domizio still applies.
  - The session ran with `--settings {"disableAllHooks":true}`.
  - No OG, Graphify, refresh, sync or Obsidian writeback was invoked.
  - This record must be copied into the canonical vault note when OG updates resume.
- Scope: synthetic development and testing only, on fictional fixtures. No real client data, no external service, no publication.

## Problem

Inter, the bundled body font, was never loaded in any standard build.
- The header comment of `templates/shared/css/base.css` (line 5) contained the text `templates/` + `*` + `/presets/` + `*` + `/tokens.css`.
- In CSS a comment ends at the first `*` + `/`, so the comment closed in the middle of that path.
- The leftover word `presets` became the prelude of the next rule, which the browser read as `presets @font-face { … }`, an invalid rule, and discarded.
- As a result, every standard page rendered its body text in the system sans-serif. Fraunces was unaffected.
- This was measured with Playwright before the fix: there was no Inter `FontFace`, no request for `inter-latin-variable.woff2`, and no Inter in the platform fonts of body text, in all 4 standard builds.

## Fix

| File | Change |
|---|---|
| `templates/shared/css/base.css` | Line 5, comment text only: the glob path became `templates/<famiglia>/presets/<preset>/tokens.css`. No CSS rule changed. |
| `templates/beauty-wellness-v1/presets/{trusted-classic,modern-premium,distinctive-bold}/layer.css` | Removed the temporary Inter `@font-face` workaround from Increment 01 and its note. The variants now get Inter from `base.css`. |
| `scripts/css-integrity.test.js` (new) | **Blocking** for every `templates/**/*.css`. It checks for comments closed early, at-rules swallowed by stray text, suspicious preludes, and `@font-face` rules that don't parse as rules. It also checks that `base.css` really declares both Inter and Fraunces, and runs a self-test against the historical defect. |
| `scripts/variants.test.js` | The standard-build regression now checks against the Increment 02 baseline, plus an executable check of the exact delta from the 01b251e baseline. Removed: the report-only comment diagnostic (superseded) and the `url()` exception for the workaround. |
| `fixtures/baselines/standard-build-inc02.json` (new) | The new baseline; provenance below. |

## Exact output delta and baseline provenance

- Only `css/style.css` changes, in each of the 4 standard builds: `impianti-elettrici-demo-alfa`, `luce-beauty-studio`, `minimal-beauty-demo`, `minimal-trades-demo`.
- The other 84 output files (HTML, JS, fonts, SVG, `_headers`) are byte-identical.
- In each `style.css` the only textual difference is the `base.css` comment line. Proof: putting the old line back reproduces exactly the SHA-256 recorded in the 01b251e baseline.
- `fixtures/baselines/standard-build-01b251e.json` is **unchanged**. It remains the genuine record of the `01b251e` code.
- `fixtures/baselines/standard-build-inc02.json` records:
  - `derived_from: standard-build-01b251e.json`;
  - `code_state`: c8273d0 plus this increment's `base.css` change, committed together with the file;
  - `expected_delta`: the 4 `style.css` paths.
- No output is attributed to `01b251e` that it did not produce.

## Verification

<!-- INC02-VERIFICATION:BEGIN -->
Results from the real verification batch on macOS arm64. `npm test` ran on the default Node; the Playwright steps ran on Node 22 (`node@22`, keg-only) with Chromium 1194. Nothing was reinstalled.

| Check | Result |
|---|---|
| `npm test` (full suite, includes the new blocking `css-integrity.test.js`) | tests 249, pass 248, fail 0, skipped 1 |
| `npm run validate` on all 4 fixtures | passed |
| Exact delta vs `standard-build-01b251e.json` | changed: impianti-elettrici-demo-alfa/css/style.css, luce-beauty-studio/css/style.css, minimal-beauty-demo/css/style.css, minimal-trades-demo/css/style.css; identical: 84 files; each style.css differs only by the base.css comment line (old SHA-256 reproduced) |
| New baseline | `fixtures/baselines/standard-build-inc02.json` written only after the delta gate passed |
| Playwright font proof (4 standard builds + 3 variants, 1440 and 390 px) | `MEASURE_AFTER=PASS`: Inter `.woff2` requested with HTTP 200, Inter FontFace `loaded`, CDP platform fonts of body text, buttons and nav are Inter, headings use their declared family; no console errors |
| Rendered contrast — gate | no NEW failure in any standard build compared with "before"; 0 failures in the 3 variants |
| Rendered contrast — standard builds | **not passed:** the pre-existing failures listed below are still present (pre-existing, not fixed in this increment) |
| `npm run qa` on the 4 standard builds, the 3 variants and the portal (desktop + mobile, overflow, hidden content, nav coverage, no-JS, print) | passed |
| `verify-variants.js` (computed styles, distinct directions, portal) | `VERIFY=PASS` |
| `node scripts/ci-integration-check.js` | passed, artefacts cleaned up |
| `noindex` / no absolute URL in variant and portal HTML | passed |

Fonts per build. Columns: before = Inter requested / body uses Inter (desktop); after = Inter requested (desktop+mobile), body, button, nav, h1 with its declared family; contrast failures (desktop+mobile, before → after):

| Build | Before | After: requested | Body | Button | Nav | h1 | Contrast |
|---|---|---|---|---|---|---|---|
| `impianti-elettrici-demo-alfa` | **no** / **no** | yes | yes | yes | yes | Fraunces yes | 1+1 → 1+1 |
| `luce-beauty-studio` | **no** / **no** | yes | yes | yes | yes | Fraunces yes | 2+2 → 2+2 |
| `minimal-beauty-demo` | **no** / **no** | yes | yes | yes | yes | Fraunces yes | 2+2 → 2+2 |
| `minimal-trades-demo` | **no** / **no** | yes | yes | yes | yes | Fraunces yes | 1+1 → 1+1 |
| `variant-trusted-classic` | n/a (variant) | yes | yes | yes | yes | Fraunces yes | – → 0+0 |
| `variant-modern-premium` | n/a (variant) | yes | yes | yes | yes | Fraunces yes | – → 0+0 |
| `variant-distinctive-bold` | n/a (variant) | yes | yes | yes | yes | Inter yes | – → 0+0 |

Pre-existing rendered contrast failures in the standard builds, measured BEFORE the fix. They are **not fixed** by this increment and must not be read as passed:

- `impianti-elettrici-demo-alfa` (desktop): `<span>` "Elettrici Demo Alfa": 2.37:1, required 4.5:1. Pre-existing, not fixed.
- `impianti-elettrici-demo-alfa` (mobile): `<span>` "Elettrici Demo Alfa": 2.37:1, required 4.5:1. Pre-existing, not fixed.
- `luce-beauty-studio` (desktop): `<span>` "Beauty Studio": 3.77:1, required 4.5:1. Pre-existing, not fixed.
- `luce-beauty-studio` (desktop): `<span>` "Beauty Studio": 3.88:1, required 4.5:1. Pre-existing, not fixed.
- `luce-beauty-studio` (mobile): `<span>` "Beauty Studio": 3.77:1, required 4.5:1. Pre-existing, not fixed.
- `luce-beauty-studio` (mobile): `<span>` "Beauty Studio": 3.88:1, required 4.5:1. Pre-existing, not fixed.
- `minimal-beauty-demo` (desktop): `<span>` "Minimal Demo": 3.77:1, required 4.5:1. Pre-existing, not fixed.
- `minimal-beauty-demo` (desktop): `<span>` "Minimal Demo": 3.88:1, required 4.5:1. Pre-existing, not fixed.
- `minimal-beauty-demo` (mobile): `<span>` "Minimal Demo": 3.77:1, required 4.5:1. Pre-existing, not fixed.
- `minimal-beauty-demo` (mobile): `<span>` "Minimal Demo": 3.88:1, required 4.5:1. Pre-existing, not fixed.
- `minimal-trades-demo` (desktop): `<span>` "Minimal Trades Demo": 2.37:1, required 4.5:1. Pre-existing, not fixed.
- `minimal-trades-demo` (mobile): `<span>` "Minimal Trades Demo": 2.37:1, required 4.5:1. Pre-existing, not fixed.

Deliverables for human review (local, gitignored): `qa-output/inc02/{before,after}/<build>-hero-{desktop,mobile}.png`, `qa-output/inc02/{before,after}.json`, plus the standard QA screenshots under `qa-output/<slug>/` and `qa-output/variants/`.
The screenshots were generated by the batch; human visual review is still pending.
<!-- INC02-VERIFICATION:END -->

## Limits

- Inter's metrics differ from the system font previously used by accident, so line breaks change on standard pages. QA found no overflow or compression; the before/after screenshots are for human review.
- Rendered contrast failures that already existed in the standard builds (1–2 per site) are **pre-existing and not fixed**. They are listed one by one in the Verification section. The gate for this increment only requires that no new ones appear; it does not mean contrast passes on the standard builds.
- macOS only; Linux CI was not run, because no push is authorised.

## Next step

Unchanged from Increment 01: protected preview → automatic feedback → revisions → finalisation and delivery → orchestrator.
