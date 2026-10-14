# Increment 01 — Three visual directions + local comparison portal

Status: implemented on local feature branch `claude/visual-directions-v1`
(from `main` @ `01b251e94001aa832ff1814af3fb9d05c5d31fcf`). Not pushed,
not merged, not deployed.

This is a **first increment toward AUTO-02**. AUTO-02 is **not** complete,
and none of AUTO-01…07 is implemented by this change.

## Governance record

- **OG DOC LIFECYCLE**: temporarily suspended at the 2026-10-06 checkpoint
  (753/753 tests; Graphify reliability open; v0.1.7 not releasable).
  Landing Factory was restarted as the priority.
- **R1-17 derogation**: authorised by Domizio for this increment only.
  The session ran with `--settings {"disableAllHooks":true}` (verified
  from the live process arguments, not from persistent settings). No OG,
  Graphify, refresh, sync or Obsidian writeback was invoked. Persistent
  hook, permission, scheduler and OG configuration was not modified.
- **Pending writeback**: this record must also be copied into the
  canonical vault note when OG updates resume.
- **Scope**: synthetic development and testing only. Fictional data only
  (`businesses/luce-beauty-studio`, `TEMPLATE_DEMO` / `fictional_demo`).
  No real client data, no external service, no account, no push/merge/
  deploy, no publication of any URL.

## What was built

| Area | Change |
|---|---|
| Presets | `templates/beauty-wellness-v1/presets/{trusted-classic,modern-premium,distinctive-bold}/` — `tokens.css` (palette) + `layer.css` (structure) |
| Font cascade | Optional `presets/<id>/layer.css` concatenated **after** `base.css` + `theme.css`, so a preset can reassign `--font-display`/`--font-body`, the type scale, spacing and radii (previously `base.css` `:root` always overrode `tokens.css`). Local Inter/Fraunces only. |
| Registry | `templates/registry.json`: new presets in the allowlist, `variants` list, `preset_meta` (`label`, `summary`, `theme_color`) |
| Build | `scripts/build.js`: `resolveTemplate` returns `layerPath` + `themeColor`; `buildBusiness(dir, opts)` internal options `presetId`/`distDir`/`forceNoindex`; new `buildVariants()`; CLI flag `--variants` |
| Portal | `scripts/variants-portal.js`: self-contained noindex portal with desktop + mobile previews of each direction |
| Theme color | Both family renderers use `ctx.themeColor` (from the active preset) with their historical literal as fallback |
| QA | `scripts/qa-screenshots.js`: new `resolveQaTarget`; standard targets unchanged, `dist-variants/<slug>/<preset>` maps to `businesses/<slug>` and `qa-output/variants/<slug>/<preset>` |
| Tests | `scripts/variants.test.js` (15 tests) + baseline `fixtures/baselines/standard-build-01b251e.json`; canonical-path fix in `scripts/new-landing.test.js` |
| Ignore | `.gitignore`: `dist-variants/` |

### Usage

```bash
npm run build -- businesses/luce-beauty-studio --variants
# dist-variants/luce-beauty-studio/{trusted-classic,modern-premium,distinctive-bold}/
# dist-variants/luce-beauty-studio/index.html   (portal — local only, never publish)
npm run qa -- dist-variants/luce-beauty-studio/<preset>
```

### The three directions (same HTML, same fictional data)

- **trusted-classic** — reassuring, orderly, traditional. Fraunces 600
  headings on a moderate scale, Inter body; compact regular rhythm
  (5rem sections); centred section heads; 6px radii, rectangular CTAs
  with no lift; service cards with an accent top rule; no organic
  decoration; navy/cream palette used soberly. `theme-color #22496a`.
- **modern-premium** — generous space and editorial rhythm. Fraunces
  300 display up to 5.5rem with tight tracking; uppercase letter-spaced
  Inter labels; 10rem sections; ink-filled pill CTAs; borderless
  square editorial cards and hairline lists; asymmetric bottom-aligned
  hero with a tall 3:4 visual; warm neutrals + deep bronze.
  `theme-color #171513`.
- **distinctive-bold** — energetic and memorable. Inverted type roles
  (Inter 700 display, Fraunces for numerals, quotes and wordmark); hero
  h1 up to 6rem on a coloured band with a solid disc; 2px ink borders,
  hard offset shadows, zero radii; filled kicker labels; dark
  high-contrast "Perché noi" band; plum, magenta and amber, all
  AA-compliant. `theme-color #c2185b`.

## Verification

All results are from real runs on 2026-10-14, macOS arm64.
- `npm test` runs on the default Node, v26.11.1.
- Playwright steps run on Node v22.23.3: Homebrew `node@22`, keg-only, used only for Playwright. Chromium 1194 (141.0.7390.37) never finished unpacking under Node 26.

| Check | Result |
|---|---|
| `npm test` (full suite) | 245 tests, 244 passed, **0 failed**, 1 skipped (the expected `sharp`-dependent test) |
| `npm run validate` on all 4 fixtures | passed |
| Standard `npm run build`, real CLI output compared file by file with `fixtures/baselines/standard-build-01b251e.json` | **byte-identical**, 4 × 22 files |
| `npm run build -- businesses/luce-beauty-studio --variants` | 3 variants + portal |
| `noindex, nofollow` on portal + 3 variants; no `canonical`; no absolute URL in any HTML | passed. The only URLs are in unchanged shared assets (OFL licences, `wa.me` builder in `base.js`, SVG `xmlns`), byte-identical to the standard build |
| `npm run qa` on the 3 variants + portal | "Nessun problema rilevato" ×4 |
| `npm run qa` on the 4 standard builds (regression) | passed ×4 |
| `node scripts/ci-integration-check.js` (real `new-landing` + real QA, both families) | passed, artefacts cleaned up |
| Computed styles + rendered contrast sweep (1440 and 390 px) | 0 failures out of 225 text elements checked per direction; the directions differ in computed typography, CTA, cards, hero and spacing |
| Portal (1440 and 390 px) | noindex, one `h1`, all visible previews loaded, no overflow, no console errors |

Computed styles at 1440 px:

| Direction | h1 | Body | CTA radius / case | Service card | Section padding | theme-color |
|---|---|---|---|---|---|---|
| trusted-classic | Fraunces 600, 50 px | Inter | 6 px / normal | 6 px, 3 px accent top rule | 80 px | `#22496a` |
| modern-premium | Fraunces 300, 88 px | Inter | pill / uppercase | 0 radius, no border | 160 px | `#171513` |
| distinctive-bold | Inter 700, 96 px | Inter | 0 / uppercase, offset shadow | 0 radius, 2 px ink border, hard shadow | 104 px | `#c2185b` |

Defects found by the browser verification and fixed before commit:
- **trusted-classic tokens were dropped.** A `*/` inside its header comment closed the comment early, so the parser discarded the whole `:root` block. A unit test now catches early-closed comments.
- **distinctive-bold kicker contrast was 1.3:1.** `.section-head p` in `base.css` out-specified `.kicker`.
- **The footer wordmark accent was below AA** on the ink footer, in all three directions.

Visual review deliverables (local, gitignored, for human review):
- `qa-output/variants/luce-beauty-studio/comparison-desktop.png`, `comparison-mobile.png`
- `qa-output/variants/luce-beauty-studio/hero-<direction>-{desktop,mobile}.png`, `portal-{desktop,mobile}.png`, `verify-report.json`
- `qa-output/variants/luce-beauty-studio/<direction>/full-{390,768,1024,1440}.png` plus per-section shots
- Portal: `dist-variants/luce-beauty-studio/index.html`

The screenshots were generated and reviewed by the agent. Human visual review is still pending.

## Limits

- Directions are CSS-only over the same HTML. Section order, copy and
  markup are identical across directions. A structural difference that
  needs different markup (e.g. a different section order or hero
  composition in HTML) is not possible without per-preset render hooks.
  That is a residual for later, not a blocker for three distinguishable
  directions.
- Only `beauty-wellness-v1` registers variants; `trades-v1` refuses
  `--variants` explicitly.
- `noindex` is not access control. The portal is for local review only;
  a protected preview does not exist yet.
- The existing `beauty-wellness-v1/default` preset has three
  atmosphere-card pairs below 4.5:1 (bg on accent-base 3.77, bg on
  tone2-a 3.87, bg on sage 3.36). They were measured and reported, and
  deliberately not changed, to preserve the byte-for-byte baseline.
- The baseline regression test was verified on macOS only. It is
  expected to be platform-independent (explicit `\n`, byte-copied
  assets, `/`-normalised paths), but Linux CI was not run because no
  push is authorised.
- **Pre-existing, not fixed: Inter never loads in standard builds.**
  - The header comment of `templates/shared/css/base.css` contains `templates/*/presets/*/tokens.css`. The `*/` closes the comment early, so the leftover text turns the `@font-face` Inter rule into an invalid rule that the browser discards.
  - Standard pages therefore render body text in the system sans-serif.
  - Fixing `base.css` would change every standard build and the baseline, so it is left for a separate increment. `scripts/variants.test.js` reports it as a diagnostic.
  - The three directions re-declare the same local Inter font in their `layer.css`.
- The map placeholder pin and the decorative SVGs keep their hard-coded terracotta/gold colours in every direction. They are shared assets, not themeable yet.
- `scripts/new-landing.test.js:884` used to fail on macOS only (`/var` vs `/private/var`). It now compares canonical paths (test-only change; no production code changed).
- Environment: Homebrew `node@22` installed (keg-only). The global `node` was upgraded from 26.7.0 to 26.11.1, because the `node@22` install upgraded the shared `simdjson`. Homebrew developer mode was switched back off.

## Next step

Protected preview → automatic feedback → revisions → finalisation and
delivery → orchestrator. Manual feedback may be used later for a
separate commercial trial, but it does not replace AUTO-03…07.
