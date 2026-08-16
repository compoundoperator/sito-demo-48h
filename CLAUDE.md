# CLAUDE.md — Landing Factory

Guida operativa per chi (persona o agente AI) lavora su questo repository.
Questo file è una guida, **non sostituisce i controlli tecnici** in
`scripts/validate.js` e nei test automatici.

## Architettura

- Generatore **statico a build-time** (Node), mai un framework runtime nel
  sito pubblicato: ogni `dist/<slug>/` è HTML/CSS/JS puro, autonomo.
- `templates/shared/` — asset e chrome di pagina condivisi da tutte le
  famiglie (font, icone generiche, reset, bottoni, header/nav, scroll-reveal).
- `templates/<famiglia>-v1/` — una famiglia di attività (oggi solo
  `beauty-wellness-v1`; `trades-v1` e `retail-local-v1` sono solo
  placeholder `TODO.md`, non implementati).
- `templates/registry.json` — allowlist esplicita di `template_id`/`preset_id`
  ammessi. `scripts/build.js` risolve **solo** da qui, mai da percorsi
  costruiti direttamente da input non fidato.
- `businesses/<slug>/data.yaml` — dati di UNA attività (input curato a
  mano). `businesses/<slug>/dossier/` — materiali grezzi (foto, recensioni).
- `dist/` — output generato, **mai editato a mano**, rigenerabile con
  `npm run build`.
- `.landing-factory/` — stato operativo locale di `scripts/new-landing.js`
  (provenienza, lock di esecuzione), gitignored, mai contenuto
  cliente/dati personali/segreti.

## Comandi principali

```bash
npm test                                          # tutti i test automatici (node:test) — 161 test
npm run validate -- businesses/<slug>             # valida un'attività
npm run build [-- businesses/<slug>]              # genera dist/<slug>/ (senza argomento: tutte)
npm run optimize-images -- businesses/<slug>      # ottimizza le foto idonee (resize+webp+strip EXIF)
npm run qa -- dist/<slug>                         # screenshot + controlli automatici
npm run import:scaffold -- --file <csv> --list --priority high   # elenca righe per priorità
npm run import:scaffold -- --file <csv> --mapping <m.yaml> --row N  # crea scaffold da riga CSV
npm run new-landing -- --business businesses/<slug> [--dry-run]     # orchestra l'intera catena (Operations V1)
```

Procedura completa passo-passo: vedi [README.md](./README.md). Guida
operatore non tecnico per `new-landing`: vedi [RUNBOOK.md](./RUNBOOK.md).

## Operations V1 — `scripts/new-landing.js`

Orchestratore sottile della catena esistente (import → validate →
optimize-images → build → QA) per uso ripetuto/in batch. Non reimplementa
nessuna regola: chiama solo le funzioni già esportate dagli script
esistenti. Note per chi lavora sul codice (la guida per l'operatore è
[RUNBOOK.md](./RUNBOOK.md)):

- **Category-agnostic**: nessun riferimento hardcoded a `beauty-wellness-v1`
  o ad altra famiglia — usa solo `template_id`/`preset_id` già presenti nei
  dati, lasciando `validateBusiness` decidere cosa è registrato.
- **`--business` è ristretto**: accetta solo un percorso che
  `pathsUtil.resolveBusinessesDir` conferma reale, con symlink risolti,
  contenuto in `businesses/` e a esattamente un livello di profondità —
  mai un lettore di cartelle arbitrarie, anche se `buildBusiness()` stesso
  resta deliberatamente indifferente alla posizione (serve ai fixture
  sintetici dei test).
- **Provenienza tramite fingerprint, non percorsi grezzi**: un unico
  helper condiviso (`csvRowDescriptor`/`descriptorFromStoredProvenance`/
  `fingerprintOf`, SHA-256 via `crypto` — nessuna nuova dipendenza) deriva
  l'identità di una fonte sia da una riga CSV corrente sia da
  `source_file`/`source_row` già salvati in un `data.yaml` esistente,
  producendo lo stesso fingerprint nei due casi.
- **Preflight autoritativo a lock già acquisito**: `.landing-factory/run.lock`
  (mutex globale, `fs.writeFileSync(..., {flag:"wx"})`, mai rimosso
  automaticamente se sembra residuo) viene acquisito **prima** di eseguire
  il preflight che decide collisioni/idoneità — mai dopo — così due
  esecuzioni concorrenti non possono mai agire entrambe su informazioni
  di collisione ormai superate. `--dry-run` non acquisisce mai il lock.
  Il lock contiene un `ownerToken` casuale generato ad ogni acquisizione:
  `releaseLock` lo rimuove solo se il contenuto attuale porta ancora lo
  stesso token di questa esecuzione, altrimenti lo lascia intatto — così
  un'esecuzione tardiva (es. rimasta indietro dopo che un operatore ha
  rimosso a mano un lock residuo e un'altra esecuzione ne ha acquisito uno
  nuovo) non può mai cancellare il lock di qualcun altro.
- **QA vuol dire superata, non solo eseguita**: un'attività risulta
  `success` solo se `qaScreenshots.summarize(report).length === 0` — un
  qualunque problema riportato produce `failed`, stage `qa`, mai un
  successo con "avvisi".
- **Tre flag distruttivi separati** (`--resume-existing`,
  `--overwrite-business`, `--overwrite-output`), mai un `--force`
  generico: ognuno autorizza esattamente una cosa, e l'autorizzazione
  dell'output viene sempre decisa in preflight, prima di qualunque
  sostituzione della cartella business.
- Stato/lock vivono in `.landing-factory/` (gitignored, mai contenuto
  cliente/dati personali/segreti — solo slug, hash, timestamp, nome
  stage).

## CI (GitHub Actions)

`.github/workflows/ci.yml` — due job, entrambi in sola lettura
(`permissions: contents: read`, nessun passo di deploy, nessun segreto):

- **`test-and-build`**: `npm ci` → Chromium per Playwright
  (`npx --no-install playwright install --with-deps chromium`) →
  `npm test` → `node scripts/ci-integration-check.js` (unico punto in cui
  `new-landing.js` viene esercitato end-to-end con QA Playwright reale,
  contro un'attività sintetica temporanea che ripulisce da sola) →
  `npm run validate` su ogni cartella in `businesses/*/` →
  `npm run build` (tutte) → `npm run qa` su ogni sito generato.
- **`test-optional-deps`**: `npm ci --omit=optional` (sharp escluso) →
  `npm test` — unico punto in cui il percorso "sharp assente" viene
  realmente eseguito (vedi "Dipendenze" sotto).

Trigger: pull request verso `main`, push su `main`, `workflow_dispatch`
manuale. Equivalente locale esatto:

```bash
npm ci
npx --no-install playwright install --with-deps chromium
npm test
node scripts/ci-integration-check.js
for d in businesses/*/; do npm run validate -- "$d"; done
npm run build
for d in dist/*/; do npm run qa -- "$d"; done

# percorso sharp assente (job separato in CI):
npm ci --omit=optional
npm test
```

## Test automatici

`npm test` esegue tutti i file `scripts/*.test.js` (161 test). Oltre ai
test originali (validazione, sicurezza, rendering, importer, ottimizzazione
immagini), tre file esercitano scenari end-to-end su dati interamente
sintetici, mai scritti sotto `businesses/`:

- `scripts/production-e2e.test.js` — pipeline reale validate → build in
  modalità PRODUCTION (indicizzabilità, JSON-LD, escaping, URL pericolosi,
  path traversal, fughe di dati interni, fallimento chiuso su dati
  incompleti).
- `scripts/batch-generation.test.js` — genera 13 attività sintetiche in
  un'unica esecuzione per dimostrare isolamento reciproco dell'output,
  rilevamento di slug duplicati (`buildBusinesses`/`findDuplicateSlugs` in
  `scripts/build.js`) e determinismo su build ripetute.
- Test aggiuntivi in `scripts/import-csv.test.js` per import ripetuti su
  più righe e per slug non sicuri o duplicati tra righe diverse.
- `scripts/new-landing.test.js` — orchestratore Operations V1: parsing
  argomenti, fingerprint di provenienza, macchina a stati atomica, lock di
  esecuzione (incluso il fallimento di un secondo run concorrente e il
  fatto che un lock dall'aspetto residuo non viene mai rimosso da solo),
  tutti i tipi di collisione (cartella esistente, output esistente, slug
  duplicati nel batch), `--dry-run` a scrittura/lock zero, e conferma che
  un problema di QA riportato da `summarize()` reale produce sempre
  `failed`, mai `success`. La QA visiva vera (Playwright) è iniettabile
  (`opts.qaRunner`) e non viene mai invocata da questi test — resta
  esercitata solo da `npm run qa` e da `scripts/ci-integration-check.js`
  (solo CI, vedi sopra).

**Convenzione obbligatoria per nuovi test**: `buildBusiness()`/
`buildBusinesses()` scrivono sempre in `dist/<slug>` al repo root,
condiviso tra tutti i file di test, e `node --test` esegue file diversi in
parallelo per default. Ogni nuovo test che genera output tramite
`build.js` (o via `new-landing.js`) deve usare uno slug con prefisso
univoco per file (es. `smoke-prod-e2e-*`, `smoke-batch-*`, `smoke-nl-*`)
mai riusato in un altro file, e ripulire sia la cartella temporanea sia
`dist/<slug>`/`qa-output/<slug>`/le eventuali cartelle reali in
`businesses/<slug>` create da un import CSV reale, in un blocco `finally`.

Cosa dimostrano — e cosa NON dimostrano — questi test: la correttezza
meccanica della pipeline contro dati sintetici (escaping, validazione,
provenienza, indicizzabilità, isolamento tra attività). NON dimostrano la
veridicità di contenuti reali, la validità di un consenso reale, né che le
due attività demo incluse nel repository siano pronte per un uso
commerciale reale.

## Branch da NON toccare mai

- `main`
- `claude/luce-beauty-landing-dpsrg9` (baseline del sito dimostrativo singolo originale)

Tutto il lavoro sul generatore vive su `claude/landing-factory-v1`.

## Divieto di inventare dati

**Non inventare mai**: nomi, prezzi, qualifiche, servizi, recensioni,
metadati di provenienza (`source_url`, `source_channel`, `captured_at`,
ecc.). Se un dato manca, il campo o l'intera sezione va omesso — mai
un valore plausibile ma non fornito dall'operatore.

## Le tre modalità (`mode`)

| | `TEMPLATE_DEMO` | `PRIVATE_DEMO` | `PRODUCTION` |
|---|---|---|---|
| Cosa rappresenta | Attività immaginaria (es. Luce Beauty Studio) | Attività reale, concept commerciale non ufficiale riservato al titolare | Attività reale, cliente pagante |
| `content_origin` ammessi | solo `fictional_demo` | `verified_public`, `official_business_channel` (non `client_provided` senza regola esplicita) | `verified_public`, `official_business_channel`, `client_provided` (mai `fictional_demo`) |
| Meta robots | `noindex, nofollow` | `noindex, nofollow` | assente solo se dati reali completi e approvati |
| Deploy | mai automatico | mai automatico | non implementato in questa fase |

Dettagli completi delle regole di provenienza/approvazione:
`schema/business.schema.json` + logica in `scripts/validate.js`.

**`noindex,nofollow` non è un controllo di accesso.** Impedisce
l'indicizzazione dei motori di ricerca, non nasconde la pagina a chi ha
l'URL diretto. Per `PRIVATE_DEMO`, la riservatezza reale in questa fase si
ottiene NON pubblicando l'URL (anteprima locale o screenshot/video), non
tramite il meta tag.

**Percorso verso una build PRODUCTION indicizzabile.** `scripts/build.js`
(`computeAllowIndexing`) attiva automaticamente l'assenza del meta
`noindex`, il tag `canonical` e il JSON-LD solo quando **tutte** queste
condizioni sono vere: `mode: PRODUCTION`, `business.publication_status:
approved_for_publication`, `business.address.line` valorizzato, e
`business.canonical_url` un URL `https` valido. Nessun passo manuale
ulteriore è richiesto: appena questi dati sono completi e approvati, la
build successiva li genera da sola.

## Sicurezza ed escaping

- Ogni stringa proveniente dai dati che finisce nell'HTML passa da
  `scripts/security/escape.js` (`escapeHtml`/`escapeAttr`).
- Ogni URL passa da un validatore specifico per contesto in
  `scripts/security/url.js` (mai un unico "sanitizeUrl" generico).
- `template_id`/`preset_id`/`slug`/percorsi locali passano da
  `scripts/security/paths.js` (allowlist + anti path-traversal).
- Regole coperte da test automatici: `scripts/security.test.js`,
  `scripts/validate.test.js`.

## Limiti del validatore

`scripts/validate.js` controlla **struttura, coerenza e presenza dei
metadati richiesti**. Non verifica, e non può verificare:

- la veridicità dei contenuti;
- la titolarità reale delle fotografie;
- la validità giuridica di un consenso;
- l'identità delle persone;
- l'autenticità di una recensione.

Questa verifica resta responsabilità dell'operatore umano.

## Persone riconoscibili e minori nelle foto

- Persone riconoscibili senza `consent_confirmed: true` → foto esclusa dal
  build (mai bloccante sull'intero sito: si ricade sul placeholder).
- Minori riconoscibili → esclusi da `TEMPLATE_DEMO` e `PRIVATE_DEMO` senza
  eccezioni; in `PRODUCTION`, non pubblicabili finché non esiste una
  regola esplicita e documentata (non ancora definita in questo progetto).

## Definizione di "done" per una landing generata

1. `npm run validate -- businesses/<slug>` passa senza errori.
2. `npm run build -- businesses/<slug>` genera `dist/<slug>/` senza errori.
3. `npm run qa -- dist/<slug>` passa (console pulita, nessun overflow,
   sezioni attese visibili, nessuna sezione mancante lascia buchi).
4. Revisione umana degli screenshot generati.

## Dipendenze

Bloccate in `package-lock.json`: `js-yaml` (lettura/scrittura `data.yaml`),
`ajv` (validazione JSON Schema), `playwright` (devDependency, motore di
`scripts/qa-screenshots.js`). Il parsing CSV è manuale, senza libreria
dedicata (piccolo parser in `scripts/import-csv.js`), per non aggiungere
una dipendenza non necessaria.

`sharp` (ottimizzazione immagini) è in `optionalDependencies`, non in
`dependencies`: è un binario nativo, quindi `npm install`/`npm ci` non
devono fallire soltanto perché non è installabile su una data piattaforma.
`scripts/optimize-images.js` non lo importa mai staticamente a livello di
modulo — lo richiede solo dentro `loadSharp()`, con `require("sharp")`
avvolto in `try/catch`, così l'assenza del pacchetto non termina il
processo Node prima che il codice possa gestirla (verificato installando
realmente con `npm ci --omit=optional`: 161 test passano comunque, con
1 solo test saltato — sempre esattamente uno dei due test dipendenti da
`sharp` in `scripts/optimize-images.test.js`, mai zero e mai entrambi:
quello che richiede `sharp` per davvero è saltato quando manca, quello che
verifica il fallimento bloccante in PRODUCTION quando manca è saltato
quando `sharp` è presente. La CI esercita entrambi i casi in due job
separati — vedi "CI" sopra).

`npm ci` installa anche Playwright; se il download del browser Chromium
fallisce (rete assente), eseguire `npx playwright install chromium`.

**Se `sharp` non è disponibile in un altro ambiente**:
`scripts/optimize-images.js` rileva l'errore di import e non ottimizza
né copia alcuna foto (mai un originale non ottimizzato/con EXIF copiato
silenziosamente nell'output). In `TEMPLATE_DEMO`/`PRIVATE_DEMO` stampa
un avviso e le foto ricadono sul placeholder grafico; in `PRODUCTION` il
comando fallisce con errore esplicito invece di procedere.

## Limiti noti non risolti in questo passaggio di hardening

- Il modulo di contatto in `templates/beauty-wellness-v1/render.js`
  (`renderContatti`) dipende da `data.contactFormEndpointValidated`, un
  campo che nessun punto del codice valorizza mai: di fatto il modulo di
  contatto non viene mai mostrato in una build `PRODUCTION`. Non corretto
  in questo passaggio (limitato, deliberatamente, alla sola correzione del
  gating del disclaimer del footer per modalità); resta da decidere se
  implementare la validazione reale dell'endpoint o rimuovere il codice
  morto.

## Deploy

**Nessun deploy va eseguito senza autorizzazione esplicita dell'utente**,
in qualunque modalità. Questo progetto, nel suo stato attuale, non
implementa alcuna pipeline di deploy automatico. La CI
(`.github/workflows/ci.yml`) esegue solo verifiche
(`permissions: contents: read`): nessun passo pubblica, carica o
distribuisce alcunché al di fuori del job stesso.
