# Landing Factory

Generatore data-driven di landing page statiche per piccole attività locali,
per il servizio **Sito professionale in 48 ore**. Nato dalla prima demo
singola "Luce Beauty Studio" (ancora disponibile, invariata, sul branch
`claude/luce-beauty-landing-dpsrg9`), ora generalizzato in un motore
riutilizzabile: **un template master + un file dati per attività**, senza
duplicare HTML/CSS per ogni cliente.

> Guida operativa rapida (regole, divieti, definizione di "done"):
> vedi **[CLAUDE.md](./CLAUDE.md)**.

## Architettura in breve

Generazione **statica a build-time** (Node): il generatore gira solo lato
autore. Ogni sito prodotto in `dist/<slug>/` resta HTML/CSS/JS puro,
senza framework, senza dipendenza da JavaScript per esistere
visivamente — esattamente come richiesto dal brief originale.

```
/
├── templates/
│   ├── shared/                 # font, icone, reset, header/nav, bottoni,
│   │                           # whatsapp flottante, scroll-reveal — condivisi
│   ├── beauty-wellness-v1/     # unica famiglia implementata
│   │   ├── render.js           # funzioni di rendering, sezioni condizionali
│   │   ├── css/theme.css       # stile delle sezioni di questa famiglia
│   │   └── presets/default/tokens.css  # palette colori
│   ├── trades-v1/               # FUTURO — solo TODO.md, non implementato
│   └── retail-local-v1/         # FUTURO — solo TODO.md, non implementato
│   └── registry.json            # allowlist di template_id/preset_id ammessi
├── businesses/
│   ├── luce-beauty-studio/      # TEMPLATE_DEMO — attività immaginaria
│   └── minimal-beauty-demo/     # attività di prova, sezioni volutamente assenti
├── schema/business.schema.json  # JSON Schema dei dati (validato con Ajv)
├── scripts/                     # build, validate, QA, import, sicurezza
├── fixtures/leads-example.csv   # esempio fittizio per l'importatore
├── dist/                        # output generato (non versionato)
└── package.json
```

## Le tre modalità

| | `TEMPLATE_DEMO` | `PRIVATE_DEMO` | `PRODUCTION` |
|---|---|---|---|
| Attività | immaginaria | reale, concept non ufficiale | reale, cliente pagante |
| Contenuti ammessi | solo dichiaratamente fittizi | pubblici/canale ufficiale, con fonte registrata | solo materiali approvati |
| Indicizzabile | no (`noindex`) | no (`noindex`) | solo se dati reali completi e approvati |
| Deploy | mai automatico | mai automatico | non implementato in questa versione |

Dettagli completi in [CLAUDE.md](./CLAUDE.md).
**`noindex,nofollow` non è un controllo di accesso**: impedisce
l'indicizzazione, non nasconde la pagina a chi ha l'URL diretto. Una vera
demo privata, in questa fase, resta locale o si condivide via
screenshot/video — non va pubblicata con un URL raggiungibile.

## Installazione

```bash
npm install
```

Dipendenze (bloccate in `package-lock.json`):

| Pacchetto | Uso | Tipo |
|---|---|---|
| `js-yaml` | leggere/scrivere `data.yaml` | runtime (build/validate/import) |
| `ajv` | validazione JSON Schema | runtime (validate) |
| `sharp` | ridimensionamento/conversione WebP, rimozione EXIF | runtime opzionale — se non installabile, `optimize-images` degrada in modo controllato (mai un originale non ottimizzato copiato in output; in `PRODUCTION` il comando fallisce esplicitamente invece di procedere) |

Playwright (per `npm run qa`) è già disponibile nell'ambiente di sviluppo
usato per questo progetto; se assente altrove, installarlo separatamente
(`npm install -D playwright` + browser Chromium).

## Procedura: dalla riga Excel/CSV alla landing pronta

1. **Import scaffold** da una riga del foglio (mai automatico al 100%: crea solo una bozza):
   ```bash
   node scripts/import-csv.js --file fixtures/leads-example.csv --list --priority high
   node scripts/import-csv.js --file fixtures/leads-example.csv \
     --mapping column-mapping.example.yaml --row 1
   ```
   Crea `businesses/<slug>/data.yaml` con i soli campi presenti nel foglio.
   I campi di provenienza/modalità che nessuna colonna può dedurre
   restano `TODO_COMPLETARE`: `npm run validate` fallirà finché non
   vengono completati a mano — **mai un dato inventato**.
2. **Completare a mano** `data.yaml` (provenienza, modalità, servizi,
   punti di forza, FAQ, contatti...) e curare `dossier/photos/` +
   `dossier/reviews/` con i materiali reali forniti, se presenti.
3. **Validare**:
   ```bash
   node scripts/validate.js businesses/<slug>
   ```
4. **Ottimizzare le immagini** (solo quelle idonee secondo le regole di provenienza/consenso):
   ```bash
   node scripts/optimize-images.js businesses/<slug>
   ```
5. **Generare** la landing:
   ```bash
   node scripts/build.js businesses/<slug>
   # oppure, senza argomenti, genera tutte le attività in businesses/
   node scripts/build.js
   ```
6. **QA automatica** (screenshot, console, overflow, no-JS, reduced-motion, stampa):
   ```bash
   node scripts/qa-screenshots.js dist/<slug>
   ```
7. **Revisione umana** degli screenshot in `qa-output/<slug>/`.
8. Pubblicazione: **da fare manualmente e solo su autorizzazione esplicita** —
   nessun passo di questo generatore pubblica nulla automaticamente.

## Script npm

```bash
npm test                                          # tutti i test automatici (node:test)
npm run validate -- businesses/<slug>
npm run build [-- businesses/<slug>]              # senza argomento: tutte le attività
npm run optimize-images -- businesses/<slug>
npm run qa -- dist/<slug>
npm run import:scaffold -- --file <csv> --list --priority high
npm run import:scaffold -- --file <csv> --mapping <mapping.yaml> --row N
```

## Anteprima locale di una landing generata

```bash
cd dist/<slug>
python3 -m http.server 8080
# poi apri http://localhost:8080
```

## Creare una nuova landing fittizia di prova (senza Excel)

Basta un nuovo file dati, senza passare dall'importatore:

```bash
mkdir -p businesses/mia-prova/dossier/photos businesses/mia-prova/dossier/reviews
cp businesses/minimal-beauty-demo/data.yaml businesses/mia-prova/data.yaml
# modificare business.name, business.slug, servizi, ecc.
node scripts/validate.js businesses/mia-prova
node scripts/build.js businesses/mia-prova
```

## Sicurezza del generatore

- Ogni stringa da dati che finisce nell'HTML passa da
  `scripts/security/escape.js` (`escapeHtml`/`escapeAttr`/JSON-LD sicuro).
- Ogni URL passa da un validatore specifico per contesto in
  `scripts/security/url.js` (mai un `sanitizeUrl` generico): rifiuta
  sempre `javascript:`, `data:`, `vbscript:`, credenziali incorporate.
- `template_id`/`preset_id`/`slug`/percorsi locali delle foto passano da
  `scripts/security/paths.js` (allowlist stretta + anti path-traversal,
  incluse forme codificate/backslash).
- `templates/registry.json` è l'unica fonte ammessa per risolvere
  template e preset: un valore non registrato interrompe il build con
  errore, mai un fallback silenzioso.
- 97 test automatici (`npm test`) coprono queste regole end-to-end,
  incluso il rendering reale (non solo le singole utility).

## Limiti noti

- Il validatore certifica struttura e coerenza dei dati, **non** la
  veridicità dei contenuti né la titolarità reale di foto/consensi:
  responsabilità dell'operatore umano (vedi CLAUDE.md).
- L'importatore CSV/Excel resta uno scaffold: foto e recensioni restano
  sempre da curare a mano, mai importate automaticamente.
- Nessuna vera riservatezza tecnica per `PRIVATE_DEMO` in questa fase:
  solo anteprima locale o materiale screenshot/video.
- `trades-v1` e `retail-local-v1` sono solo placeholder documentati, non
  implementati.
- Nessuna pipeline di deploy automatico è implementata: la pubblicazione
  resta un passo manuale, esplicitamente autorizzato.

## Font: fonte e licenza

**Fraunces** e **Inter** sono scaricati dalla rete ufficiale di
distribuzione di Google Fonts (`fonts.gstatic.com`), generata dai
repository ufficiali dei due progetti, e distribuiti sotto **SIL Open
Font License 1.1** (`templates/shared/assets/fonts/*/OFL.txt`). Nessun
file font è stato creato, modificato o simulato.

## Baseline originale (sito singolo)

La landing dimostrativa originale "Luce Beauty Studio" come sito
singolo (pre-factory) resta intatta e disponibile sul branch
`claude/luce-beauty-landing-dpsrg9`, non toccato da questo lavoro.
