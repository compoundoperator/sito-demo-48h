# Luce Beauty Studio — sito dimostrativo

Primo sito dimostrativo del servizio **Sito professionale in 48 ore**, rivolto a piccole attività locali che hanno un sito vecchio, poco efficace o inesistente.

**Luce Beauty Studio è un centro estetico immaginario.** Nome, indirizzo, orari, prezzi, recensioni e ogni altro contenuto sono di fantasia e servono solo a dimostrare cosa si può realizzare con strumenti di intelligenza artificiale (codice, testi, icone e decorazioni sono stati creati con Claude Code).

## ⚠️ Stato: demo pubblica, non indicizzabile

Questa è una prima versione dimostrativa, pensata per essere vista ma **non indicizzata dai motori di ricerca**:

- `index.html` include `<meta name="robots" content="noindex, nofollow">`.
- Non sono presenti `sitemap.xml`, `robots.txt`, canonical URL o dati strutturati JSON-LD: richiederebbero un dominio reale e dati aziendali veri, che in questa fase non esistono.
- Nessun numero di telefono o WhatsApp reale è presente in pagina: il telefono mostra il testo "Telefono disponibile nella versione reale" e i pulsanti WhatsApp mostrano un avviso dimostrativo (vedi sotto).
- Il modulo di contatto è solo dimostrativo: non invia né salva alcun dato.

**Checklist da completare prima di una pubblicazione reale (con dominio e dati veri):**

1. Rimuovere `<meta name="robots" content="noindex, nofollow">` da `index.html`.
2. Aggiungere `<link rel="canonical" href="https://dominio-reale.tld/">`.
3. Aggiungere uno script JSON-LD `LocalBusiness` con dati reali (nome, indirizzo, telefono, orari) nel `<head>` di `index.html`.
4. Creare `sitemap.xml` e un `robots.txt` che la referenzi.
5. Valorizzare `WHATSAPP_CONFIG.number` in `js/main.js` con il numero reale del cliente (attiva automaticamente i link `wa.me` reali al posto dell'avviso demo).
6. Sostituire indirizzo, telefono, orari e recensioni con i dati reali del cliente.
7. Sostituire i placeholder visivi (blob/pattern) con fotografie reali o immagini generate con AI — vedi elenco prompt più sotto.

## Struttura del progetto

```
/
├── index.html            # markup della landing page (one-page, in italiano)
├── css/style.css         # unico foglio di stile (custom properties, layout, animazioni)
├── js/main.js             # JS vanilla: menu mobile, scroll reveal, CTA WhatsApp demo, form demo
├── assets/
│   ├── fonts/             # Fraunces + Inter, self-hosted (vedi licenze sotto)
│   └── svg/                # icone e decorazioni SVG originali
├── _headers                # header di sicurezza/cache per Cloudflare Pages
└── README.md
```

Nessuna build tool: i file sono statici e pronti per essere pubblicati così come sono.

## Anteprima locale

Non serve alcuna installazione: bastano file statici serviti da un qualunque web server locale, ad esempio:

```bash
cd sito-demo-48h
python3 -m http.server 8080
# poi apri http://localhost:8080
```

(Aprire `index.html` direttamente da file system funziona per lo più, ma un piccolo web server evita eventuali limitazioni del browser su richieste locali.)

## Pubblicazione su Cloudflare Pages

1. Collega il repository a un nuovo progetto Cloudflare Pages.
2. Framework preset: **None** (sito statico).
3. Build command: *(vuoto — nessuna build necessaria)*.
4. Output directory: `/` (radice del repository).
5. Deploy: Cloudflare pubblicherà i file così come sono, incluso il file `_headers` per gli header di sicurezza/cache.

## Font: fonte e licenza

I font **Fraunces** e **Inter** sono stati scaricati dalla rete ufficiale di distribuzione di Google Fonts (`fonts.gstatic.com`), generata dai repository ufficiali dei due progetti, e sono distribuiti sotto **SIL Open Font License 1.1**. I file di licenza originali sono inclusi in:

- `assets/fonts/fraunces/OFL.txt`
- `assets/fonts/inter/OFL.txt`

I file `.woff2` in `assets/fonts/` sono copie reali e integre di quelli distribuiti ufficialmente: nessun file font è stato creato, modificato o simulato. Se in un ambiente senza accesso di rete i font non fossero disponibili, il CSS ricade automaticamente su uno stack di font di sistema (vedi commento in cima a `css/style.css`).

## Immagini AI da generare per le versioni future

Nella v1 tutti gli elementi visivi sono forme geometriche/blob create in SVG puro (nessuna immagine scaricata da internet). Per una versione successiva, ecco un elenco di immagini da generare con uno strumento AI a scelta, con prompt suggeriti:

1. **Hero — ambiente del centro**: "Interno luminoso ed elegante di un centro estetico contemporaneo a Roma, luce naturale calda del tardo pomeriggio, palette terracotta/crema/legno chiaro, dettagli architettonici mediterranei minimal, nessuna persona in primo piano, spazio negativo a sinistra per testo, fotografia editoriale, 35mm, bassa profondità di campo."
2. **Atmosfera — trattamento viso**: "Primo piano di mani professionali che applicano un trattamento viso con crema naturale, luce soffusa laterale, ambientazione spa elegante minimalista, palette calda coerente col brand, nessun volto identificabile, stile rivista lifestyle."
3. **Atmosfera — still life prodotti**: "Composizione di prodotti cosmetici non brandizzati, boccette ambrate e crema-terracotta su pietra chiara, luce naturale morbida, ombre lunghe, stile minimal editoriale."
4. **Servizi — sala massaggi**: "Sala massaggi vuota, elegante, lettino in lino naturale, piante verdi, luce calda soffusa, palette terracotta/crema, stile interior design wellness."
5. **Reception/dettaglio**: "Dettaglio reception boutique, fiori secchi, ceramica artigianale, luce naturale, nessuna persona, stile minimal mediterraneo."
6. **Immagine social (Open Graph)**: variante orizzontale 1200×630 dell'immagine hero, con il wordmark del brand integrato.

Per ciascuna immagine: nessun volto riconoscibile o persona reale, palette coerente con i colori del brand (vedi variabili CSS in `css/style.css`), formato WebP con fallback JPEG, `alt` descrittivo in italiano.

## Licenze e provenienza dei contenuti

- Codice, testi, struttura e icone/decorazioni SVG: creati originariamente per questo progetto.
- Font: Fraunces e Inter, SIL Open Font License 1.1 (vedi sopra).
- Nessuna fotografia, template o materiale di terzi protetto da copyright è stato utilizzato.
