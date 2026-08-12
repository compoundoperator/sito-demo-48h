# CLAUDE.md — Landing Factory

Guida operativa per chi (persona o agente AI) lavora su questo repository.
Questo file è una guida, **non sostituisce i controlli tecnici** in
`scripts/validate.js` e nei test automatici.

> Stato: prima versione (Fase B). Verrà completata in Fase D.

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

## Comandi principali

```bash
npm test                                    # tutti i test automatici (node:test)
npm run validate -- businesses/<slug>       # valida un'attività
npm run build -- businesses/<slug>          # genera dist/<slug>/ (o senza argomento: tutte)
npm run optimize-images -- businesses/<slug> # ottimizza le foto idonee
npm run qa -- dist/<slug>                   # screenshot + controlli automatici
npm run import:scaffold -- --row N ...      # scaffold da riga CSV/Excel (vedi Fase D)
```

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

## Deploy

**Nessun deploy va eseguito senza autorizzazione esplicita dell'utente**,
in qualunque modalità. Questo progetto, nel suo stato attuale, non
implementa alcuna pipeline di deploy automatico.
