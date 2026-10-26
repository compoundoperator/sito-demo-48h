# Increment 03 — Standard-build contrast fix

Status: implemented on local branch `claude/standard-contrast-fix`, created from `5242bd5` and stacked on Increment 02. One local commit. Not pushed, not merged, not deployed.

## Governance record

- OG DOC LIFECYCLE remains suspended, and the R1-17 derogation authorised by Domizio still applies.
  - The session ran with `--settings {"disableAllHooks":true}`.
  - No OG, Graphify, refresh, sync or Obsidian writeback was invoked.
  - This record must be copied into the canonical vault note when OG updates resume.
- Scope: synthetic development and testing only, on fictional fixtures. No real client data, no external service, no publication, no reinstall.

## Problem

The INCREMENT-02 Verification listed 12 pre-existing rendered-contrast failures in the 4 standard builds (desktop + mobile). Increment 03 measured them again before any change, and they were exactly those 12.
- Every one is the accent `<span>` of the wordmark (`renderWordmark`, `templates/shared/render/common.js`). It is coloured by `templates/shared/css/base.css` (`.wordmark span { color: var(--color-accent-base) }`).

| Family `default` | Header (on `--color-bg`) | Footer (on `--color-ink`) |
|---|---|---|
| `beauty-wellness-v1` (`luce-beauty-studio`, `minimal-beauty-demo`) | `#c1653a` = 3.77:1 ❌ | `#c1653a` = 3.88:1 ❌ |
| `trades-v1` (`impianti-elettrici-demo-alfa`, `minimal-trades-demo`) | `#2f6690` ≈ 5.7:1 ✅ | `#2f6690` = 2.37:1 ❌ |

## Fix (colour only, no layout)

| File | Change |
|---|---|
| `templates/beauty-wellness-v1/presets/default/layer.css` (new) | `.wordmark span { color: var(--color-accent) }` and `.site-footer .wordmark span { color: var(--color-gold) }` |
| `templates/trades-v1/presets/default/layer.css` (new) | `.site-footer .wordmark span { color: var(--color-gold) }` |
| `scripts/variants.test.js` | The standard regression now checks against the inc03 baseline. New exact-delta check: inc03 vs inc02 differ only in the 4 `style.css`, and the inc02 vs 01b251e check is kept. New test: the default layers declare **only `color`**, and the wordmark accent reaches ≥ 4.5:1 in the header and the footer for each family `default`. |
| `fixtures/baselines/standard-build-inc03.json` (new) | The new baseline; provenance below. |

Why a `default` layer, and not `base.css`, `theme.css` or the tokens:
- the layer is appended only for the `default` preset, so the 3 visual directions stay byte-identical;
- no token changes, so `--color-accent-base` keeps driving nav underlines, button borders, FAQ markers and hero art exactly as before.

## Declared delta and baseline provenance

- Only `css/style.css` changes, in each of the 4 standard builds. The other 84 files are byte-identical to `standard-build-inc02.json`.
- Each `style.css` is the inc02 file plus the appended block `/* --- templates/<family>/presets/default/layer.css --- */` with the layer's content. Proof: stripping that exact suffix reproduces the inc02 SHA-256.
- `fixtures/baselines/standard-build-inc03.json` records:
  - `derived_from: standard-build-inc02.json`;
  - `code_state`: 5242bd5 plus the two default layers, in the same commit;
  - `expected_delta`: the 4 `style.css` files.
- `standard-build-01b251e.json` and `standard-build-inc02.json` are unchanged.
- The variants and the portal are byte-identical before and after, compared against a snapshot taken before the change.

## Verification

<!-- INC03-VERIFICATION:BEGIN -->
Results from the real verification batch on macOS arm64. `npm test` ran on the default Node; Playwright steps ran on Node 22 (`node@22`, keg-only) with Chromium 1194. Nothing was reinstalled.

| Check | Result |
|---|---|
| `npm test` (full suite, incl. `css-integrity.test.js`) | tests 251, pass 250, fail 0, skipped 1 |
| `npm run validate` on all 4 fixtures | passed |
| Exact delta vs `standard-build-inc02.json` | changed: impianti-elettrici-demo-alfa/css/style.css, luce-beauty-studio/css/style.css, minimal-beauty-demo/css/style.css, minimal-trades-demo/css/style.css; identical: 84 files; each style.css = inc02 + appended default layer only (inc02 SHA-256 reproduced) |
| Baselines `standard-build-01b251e.json` and `standard-build-inc02.json` | unchanged (`git diff --quiet`) |
| New baseline | `fixtures/baselines/standard-build-inc03.json` written only after the delta gate |
| Variants + portal | SNAPSHOT=IDENTICAL 67 files (byte-identical before/after) |
| Rendered contrast, 4 standard + 3 variants, 1440 and 390 px | `MEASURE_AFTER=PASS`: **0 failures** on every measured text element; 0 console errors |
| Text over gradients | **not certified**: not measurable by the sweep; listed below, never counted as passed |
| `npm run qa` on 4 standard builds, 3 variants, portal (390/768/1024/1440, overflow, hidden content, no-JS, print) | passed |
| `verify-variants.js` / `ci-integration-check.js` | passed / passed |

| Build | Failures before (desktop / mobile) | Failures after | Measured elements after | Uncertified (gradient) after |
|---|---|---|---|---|
| `impianti-elettrici-demo-alfa` | 1 / 1 | 0 / 0 | 90 / 83 | 0 / 0 |
| `luce-beauty-studio` | 2 / 2 | 0 / 0 | 116 / 109 | 6 / 6 |
| `minimal-beauty-demo` | 2 / 2 | 0 / 0 | 36 / 33 | 0 / 0 |
| `minimal-trades-demo` | 1 / 1 | 0 / 0 | 27 / 24 | 0 / 0 |
| `variant-trusted-classic` | 0 / 0 | 0 / 0 | 116 / 109 | 6 / 6 |
| `variant-modern-premium` | 0 / 0 | 0 / 0 | 116 / 109 | 6 / 6 |
| `variant-distinctive-bold` | 0 / 0 | 0 / 0 | 116 / 109 | 6 / 6 |

Fixed failures (all 12 declared before the change):

- `impianti-elettrici-demo-alfa` (desktop) footer · span · Elettrici Demo Alfa: 2.37:1 → fixed (0 failures after)
- `impianti-elettrici-demo-alfa` (mobile) footer · span · Elettrici Demo Alfa: 2.37:1 → fixed (0 failures after)
- `luce-beauty-studio` (desktop) header · span · Beauty Studio: 3.77:1 → fixed (0 failures after)
- `luce-beauty-studio` (desktop) footer · span · Beauty Studio: 3.88:1 → fixed (0 failures after)
- `luce-beauty-studio` (mobile) header · span · Beauty Studio: 3.77:1 → fixed (0 failures after)
- `luce-beauty-studio` (mobile) footer · span · Beauty Studio: 3.88:1 → fixed (0 failures after)
- `minimal-beauty-demo` (desktop) header · span · Minimal Demo: 3.77:1 → fixed (0 failures after)
- `minimal-beauty-demo` (desktop) footer · span · Minimal Demo: 3.88:1 → fixed (0 failures after)
- `minimal-beauty-demo` (mobile) header · span · Minimal Demo: 3.77:1 → fixed (0 failures after)
- `minimal-beauty-demo` (mobile) footer · span · Minimal Demo: 3.88:1 → fixed (0 failures after)
- `minimal-trades-demo` (desktop) footer · span · Minimal Trades Demo: 2.37:1 → fixed (0 failures after)
- `minimal-trades-demo` (mobile) footer · span · Minimal Trades Demo: 2.37:1 → fixed (0 failures after)

Uncertified text (over gradients, not measured, NOT passed):

- `luce-beauty-studio`: main · h3 · Luce naturale; main · p · Ambienti luminosi durante il giorno, per; main · h3 · Materiali caldi; main · p · Legno chiaro, tessuti naturali e dettagl; main · h3 · Cura nei dettagli; main · p · Dal profumo dell'ambiente alla scelta de
- `variant-trusted-classic`: main · h3 · Luce naturale; main · p · Ambienti luminosi durante il giorno, per; main · h3 · Materiali caldi; main · p · Legno chiaro, tessuti naturali e dettagl; main · h3 · Cura nei dettagli; main · p · Dal profumo dell'ambiente alla scelta de
- `variant-modern-premium`: main · h3 · Luce naturale; main · p · Ambienti luminosi durante il giorno, per; main · h3 · Materiali caldi; main · p · Legno chiaro, tessuti naturali e dettagl; main · h3 · Cura nei dettagli; main · p · Dal profumo dell'ambiente alla scelta de
- `variant-distinctive-bold`: main · h3 · Luce naturale; main · p · Ambienti luminosi durante il giorno, per; main · h3 · Materiali caldi; main · p · Legno chiaro, tessuti naturali e dettagl; main · h3 · Cura nei dettagli; main · p · Dal profumo dell'ambiente alla scelta de

Screenshots for human review (local, gitignored): `qa-output/inc03/{before,after}/<build>-{hero,footer}-{desktop,mobile}.png`, `qa-output/inc03/{before,after}.json`. Human visual review is still pending.
<!-- INC03-VERIFICATION:END -->

## Limits

- **Addressed in Increment 04** (`docs/increments/INCREMENT-04-atmosphere-text-contrast.md`): the atmosphere text is now measured in the worst case (every gradient stop plus every real pixel) and fixed in the default theme and the three directions. Original note: **Text over gradients is not certified.** The rendered sweep cannot compute contrast for text drawn over a gradient: the atmosphere cards and the hero visual label. Those elements are listed in the Verification section and are never counted as passed.
  - At token level, the atmosphere-card pairs of the beauty `default` preset are still below 4.5:1 (3.77, 3.87, 3.36, reported since Increment 01). They are not fixed here.
- macOS only; Linux CI was not run, because no push is authorised.

## Next step

Unchanged: protected preview → automatic feedback → revisions → finalisation and delivery → orchestrator.
