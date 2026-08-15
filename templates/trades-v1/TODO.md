# trades-v1 — non implementato

Famiglia di template futura per attività artigiane/tecniche (idraulici,
elettricisti, imprese edili, manutenzioni...). Non ancora implementata.

Quando verrà sviluppata dovrà seguire lo stesso schema architetturale di
`beauty-wellness-v1`:

- `render.js` — funzioni di rendering per sezione, dati in ingresso già
  validati da `scripts/validate.js`, nessuna interpolazione HTML senza
  passare da `scripts/security/escape.js`.
- `css/theme.css` — stile delle sezioni di contenuto specifiche della
  famiglia (probabilmente diverse da "atmosfera"/"perché sceglierci":
  es. aree di intervento, certificazioni, richiesta preventivo rapido).
- `presets/default/tokens.css` — palette colori, nello stesso formato di
  `beauty-wellness-v1/presets/default/tokens.css`.
- Registrazione in `templates/registry.json` con un `template_id` univoco
  (`trades-v1`) e i preset ammessi.

Riutilizza senza modifiche `templates/shared/` (font, icone generiche,
reset, bottoni, header/nav, scroll-reveal, WhatsApp flottante).
