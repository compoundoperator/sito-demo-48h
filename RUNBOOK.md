# RUNBOOK — Guida operativa per chi crea le landing page

Questa guida è per chi usa `npm run new-landing` per creare landing page
di prova, **senza dover ricordare i singoli comandi tecnici** del
generatore. Non richiede conoscenze di programmazione.

> Per i dettagli tecnici del generatore vedi [README.md](./README.md).
> Per le regole complete vedi [CLAUDE.md](./CLAUDE.md).

## Cosa fa `new-landing`

Un solo comando esegue tutta la catena: importa i dati (se vengono da un
foglio CSV), li controlla, ottimizza le eventuali foto, genera la pagina e
la verifica visivamente in automatico (screenshot, controlli tecnici). Se
qualcosa non va, il comando si ferma e spiega **dove** e **perché**, senza
lasciare a metà nessuna cartella.

## Una attività sola

**Da una riga di un foglio CSV** (dopo averlo esportato da Excel — vedi
"Excel o CSV?" più sotto):

```bash
npm run new-landing -- --file fixtures/leads-example.csv --mapping column-mapping.example.yaml --row 1 --dry-run
```

`--dry-run` mostra un'anteprima **senza creare o modificare nulla**: utile
per controllare prima di procedere davvero. Quando l'anteprima va bene,
si rilancia lo stesso comando senza `--dry-run`:

```bash
npm run new-landing -- --file fixtures/leads-example.csv --mapping column-mapping.example.yaml --row 1
```

**Da una cartella già preparata a mano** (es. dopo aver corretto i dati a
mano in `businesses/<slug>/data.yaml`):

```bash
npm run new-landing -- --business businesses/minimal-beauty-demo
```

Questo è anche il modo normale per **rigenerare** un'attività già creata:
non serve nessuna opzione speciale.

## Un batch controllato di più attività

```bash
npm run new-landing -- --file fixtures/leads-example.csv --mapping column-mapping.example.yaml --rows 1,2,3 --dry-run
npm run new-landing -- --file fixtures/leads-example.csv --mapping column-mapping.example.yaml --priority high
```

`--rows 1,2,3` seleziona righe precise; `--priority high` seleziona tutte
le righe con quella priorità nel foglio. Se due righe del batch
produrrebbero lo stesso slug (stesso indirizzo web), **l'intero batch si
ferma prima di creare qualunque cosa** — nessuna attività a metà.
Altrimenti, ogni attività del batch è indipendente dalle altre: se una
fallisce, le altre proseguono comunque, e il riepilogo finale elenca
esattamente cosa è riuscito e cosa no.

## Se la cartella o il sito esistono già

Per una riga CSV il cui slug corrisponde a una cartella `businesses/`
**già esistente**, il comando si ferma per default (non sovrascrive mai
nulla senza dirlo esplicitamente). Le opzioni sono:

- `--resume-existing` — continua sulla cartella esistente **solo se**
  risulta provenire dallo stesso file/riga CSV di questo comando (altrimenti
  si rifiuta, per non mischiare per sbaglio dati di provenienza diversa).
- `--overwrite-business` — sostituisce intenzionalmente il contenuto della
  cartella (perde eventuali correzioni fatte a mano — usare con
  attenzione).
- `--overwrite-output` — se anche il sito già generato (`dist/<slug>`)
  risulta provenire da una fonte diversa, serve **anche** questa opzione
  per poterlo sostituire (le due autorizzazioni sono separate apposta).

Se compare il messaggio **"un'altra esecuzione è già in corso"**: significa
che è in corso (o è rimasta bloccata) un'altra esecuzione di
`new-landing`. Attendi che finisca; se sei sicuro che si tratti di un
residuo di un'esecuzione interrotta (es. il terminale è stato chiuso a
metà), rimuovi manualmente il file `.landing-factory/run.lock` prima di
riprovare — il comando non lo fa mai da solo.

## Le tre modalità, in parole semplici

| Modalità | Cosa significa | Chi la vede |
|---|---|---|
| **TEMPLATE_DEMO** | Attività completamente inventata, di esempio | Solo su tuo computer o in screenshot |
| **PRIVATE_DEMO** | Attività reale, ma è ancora una bozza riservata al titolare, non ufficiale | Solo su tuo computer o in screenshot — mai un link pubblico |
| **PRODUCTION** | Attività reale, dati approvati dal cliente, pronta a essere pubblicata | Pubblicabile (ma questo progetto non pubblica nulla da solo — resta un passo manuale separato) |

**Importante**: passare da una modalità all'altra non "abbellisce" mai i
dati. Se un'informazione manca o non è confermata, la pagina generata la
ometterà semplicemente — non viene mai inventata.

## Checklist: demo, pronta per revisione, o idonea alla produzione?

- **È solo una demo** se: modalità `TEMPLATE_DEMO`, oppure `PRIVATE_DEMO`
  senza tutti i dati confermati. Non condividere l'URL pubblicamente: solo
  anteprima locale o screenshot/video.
- **È pronta per la revisione del cliente** se: modalità `PRIVATE_DEMO`
  con provenienza dei contenuti verificata e riferita a un canale ufficiale
  dell'attività. Resta comunque riservata (vedi sopra).
- **È idonea alla produzione** solo se **tutte** queste condizioni sono
  vere insieme: modalità `PRODUCTION`, dati approvati per la pubblicazione
  (`publication_status: approved_for_publication`), indirizzo compilato, e
  un indirizzo web (`canonical_url`) valido in `https`. Quando lo sono, il
  comando genera automaticamente una pagina indicizzabile — nessun passo
  manuale aggiuntivo serve per questo, ma **la pubblicazione vera e
  propria resta comunque un passo manuale separato, mai automatico**.

## Come leggere un fallimento o un avviso

Il riepilogo finale mostra, per ogni attività:
- `OK <slug> -> dist/<slug>` se è andata a buon fine (solo dopo che la
  verifica visiva automatica non ha trovato **nessun** problema — se ne
  trova anche uno solo, l'attività risulta fallita, non "andata a buon
  fine con avvisi");
- `ERRORE <slug> [stage: ...]: motivo` se qualcosa si è fermato — `stage`
  indica il punto esatto della catena (import, validazione, ottimizzazione
  immagini, generazione, verifica) e `motivo` spiega perché in linguaggio
  diretto;
- righe **"avviso: ..."** — non bloccano l'attività, ma segnalano una
  decisione che resta da prendere a mano (es. una foto esclusa perché
  manca la conferma del consenso, oppure una recensione non ancora
  approvata alla pubblicazione).

## Disponibile ora / pianificato in futuro

**Disponibile ora**: solo la famiglia `beauty-wellness-v1` (parrucchieri,
centri estetici, spa e attività simili). `new-landing` non presuppone mai
questa famiglia per nome: usa qualunque `template_id`/`preset_id` risulti
già presente e registrato nei dati dell'attività.

**Pianificato in futuro, non ancora implementato**: le famiglie
`trades-v1` (idraulici, elettricisti, ecc.) e `retail-local-v1` (negozi
locali) esistono solo come documento di progetto (`TODO.md`), senza
codice. Quando una nuova famiglia verrà registrata in
`templates/registry.json`, funzionerà automaticamente anche con
`new-landing`, senza bisogno di modificare questo comando.

## Excel o CSV?

Il foglio va **esportato in formato CSV** prima di essere usato (in Excel:
File → Salva con nome → CSV). Il generatore non apre file `.xlsx`
direttamente: è una scelta deliberata, per non aggiungere una dipendenza
esterna e per evitare gli errori tipici di un file Excel complesso
(formule, più fogli, formati numerici locali) — un semplice CSV è più
affidabile per questo scopo.

## Cosa NON fa questo comando

- Non pubblica né distribuisce nulla: la pubblicazione resta sempre un
  passo manuale, separato, esplicitamente autorizzato.
- Non cerca né scarica foto o recensioni da internet.
- Non invia email, WhatsApp o altri messaggi.
- Non integra CRM o strumenti esterni.
- Non inventa mai un dato mancante: se manca, la pagina generata omette
  semplicemente quella parte.
