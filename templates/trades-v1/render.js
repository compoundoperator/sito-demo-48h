"use strict";

/**
 * templates/trades-v1/render.js
 *
 * Genera l'HTML della landing a partire da dati già validati (vedi
 * scripts/validate.js) e da un contesto preparato da scripts/build.js.
 * Famiglia "trades-v1": attività di preventivo non urgenti (elettricisti,
 * idraulici) — comunica lavoro pianificato e richiesta di preventivo, mai
 * urgenza/reperibilità 24/7/certificazioni (nessuno di questi campi esiste
 * nello schema). Ogni sezione è condizionale: se il dato corrispondente è
 * assente, la sezione viene omessa interamente (nessun contenitore vuoto,
 * nessun link di navigazione orfano). Nessun dato viene mai inventato qui:
 * questo file si limita a decidere COME mostrare ciò che esiste. Nessun
 * prezzo viene mai mostrato (a differenza di beauty-wellness-v1): non
 * esiste in questo file alcun percorso di rendering per price_from/
 * price_note.
 *
 * Le sezioni realmente generiche (head/metadata, header, navigazione
 * desktop/mobile, recensioni, FAQ, footer, CTA WhatsApp flottante) vivono
 * in templates/shared/render/common.js e sono riusate qui invariate. Hero,
 * aree di intervento, punti di forza, zona servita, contatti e lo sprite
 * icone restano specifici di questa famiglia.
 *
 * Tutto il testo proveniente dai dati passa da escapeHtml/escapeAttr
 * prima di finire nel markup.
 */

var esc = require("../../scripts/security/escape.js");
var urlUtil = require("../../scripts/security/url.js");
var shared = require("../shared/render/common.js");

var escapeHtml = esc.escapeHtml;
var escapeAttr = esc.escapeAttr;

var KNOWN_ICONS = [
  "icon-bolt", "icon-panel", "icon-bulb", "icon-wrench", "icon-tap", "icon-clipboard"
];

function iconSymbol(id, viewBox, inner) {
  return '<symbol id="' + id + '" viewBox="' + viewBox + '">' + inner + "</symbol>";
}

/** Sprite SVG con le icone del template (parte del sistema visivo condiviso, non dei dati). */
function renderIconSprite() {
  var symbols = [
    iconSymbol(
      "icon-whatsapp",
      "0 0 48 48",
      '<path d="M24 6c-9.9 0-18 8.1-18 18 0 3.4.9 6.6 2.6 9.4L6 42l8.8-2.5c2.7 1.5 5.7 2.3 9.2 2.3 9.9 0 18-8.1 18-18S33.9 6 24 6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M17 18c1-1 2-1 2.6 0l1.6 2.8c.4.6.3 1.3-.2 1.9l-1 1.2c.9 2 2.7 3.8 4.7 4.7l1.2-1c.6-.5 1.3-.6 1.9-.2l2.8 1.6c1 .6 1 1.6 0 2.6-1.3 1.3-3.3 1.9-5 1.3-3.6-1.2-7.5-5.1-8.7-8.7-.6-1.7 0-3.7 1.3-5z" fill="currentColor"/>'
    ),
    iconSymbol("icon-star", "0 0 24 24", '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z" fill="currentColor"/>'),
    iconSymbol(
      "icon-bolt",
      "0 0 48 48",
      '<path d="M27 6L15 27h8l-2 15 14-23h-9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>'
    ),
    iconSymbol(
      "icon-panel",
      "0 0 48 48",
      '<rect x="13" y="9" width="22" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19 15v8M24 15v14M29 15v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="19" cy="27" r="1.6" fill="currentColor"/><circle cx="24" cy="33" r="1.6" fill="currentColor"/><circle cx="29" cy="24" r="1.6" fill="currentColor"/>'
    ),
    iconSymbol(
      "icon-bulb",
      "0 0 48 48",
      '<path d="M24 8c-6.6 0-11 4.7-11 10.8 0 4.3 2.2 7 4.3 9.2 1.1 1.1 1.7 2.2 1.7 3.8h10c0-1.6.6-2.7 1.7-3.8 2.1-2.2 4.3-4.9 4.3-9.2C35 12.7 30.6 8 24 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 35h8M21 39h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    ),
    iconSymbol(
      "icon-wrench",
      "0 0 48 48",
      '<path d="M32 9a8 8 0 00-10.6 9.4L9 30.8l4.2 4.2 12.4-12.4A8 8 0 0032 9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="27.5" cy="14.5" r="2.2" fill="currentColor"/>'
    ),
    iconSymbol(
      "icon-tap",
      "0 0 48 48",
      '<path d="M13 12h14v6h6a4 4 0 014 4v3h-5v-3a1 1 0 00-1-1h-4v3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M21 24.5c3 1.3 5 4 5 7.5a6 6 0 11-12 0c0-3.5 2-6.2 5-7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>'
    ),
    iconSymbol(
      "icon-clipboard",
      "0 0 48 48",
      '<rect x="12" y="10" width="24" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M18 10a3 3 0 013-3h6a3 3 0 013 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M17 22l4 4 9-9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
    )
  ];
  return '<svg aria-hidden="true" style="display:none">' + symbols.join("") + "</svg>";
}

function buildSectionList(data) {
  var sections = [{ id: "aree-di-intervento", label: "Aree di intervento", present: (data.services || []).length > 0 }];
  sections.push({ id: "perche-noi", label: "Perché noi", present: (data.strengths || []).length > 0 });
  sections.push({ id: "zona-servita", label: "Zona servita", present: !!(data.business.service_areas && data.business.service_areas.length > 0) });
  sections.push({ id: "recensioni", label: "Recensioni", present: (data.reviews || []).length > 0 });
  sections.push({ id: "faq", label: "FAQ", present: (data.faq || []).length > 0 });
  sections.push({ id: "contatti", label: "Contatti", present: true });
  return sections.filter(function (s) { return s.present; });
}

function renderHero(data, whatsappDefaultMessage) {
  var b = data.business;
  var eyebrow = b.eyebrow ? '<p class="hero__eyebrow">' + escapeHtml(b.eyebrow) + "</p>" : "";
  var lead = b.intro ? '<p class="hero__lead">' + escapeHtml(b.intro) + "</p>" : "";

  var actions =
    '<div class="hero-actions">' +
    '<a class="btn btn--primary" href="#contatti">Richiedi un preventivo</a>' +
    shared.whatsappButton("btn btn--whatsapp", whatsappDefaultMessage, "Scrivici su WhatsApp") +
    "</div>";

  var trust = "";
  if (b.trust_stats && b.trust_stats.length) {
    trust =
      '<div class="hero__trust">' +
      b.trust_stats
        .map(function (t) {
          return '<div class="hero__trust-item"><strong>' + escapeHtml(t.value) + "</strong><span>" + escapeHtml(t.label) + "</span></div>";
        })
        .join("") +
      "</div>" +
      (data.mode !== "PRODUCTION" ? '<p class="hero__trust-disclaimer">* Dati dimostrativi a scopo illustrativo.</p>' : "");
  }

  var visual =
    '<div class="hero__visual" data-reveal aria-hidden="true"><p class="hero__visual-label">' +
    "Spazio dedicato a una foto del lavoro svolto o del team — in questa versione sostituito da una composizione grafica. " +
    "Nella versione reale: fotografia professionale o immagine generata con AI." +
    "</p></div>";

  return (
    '<section class="hero" id="top">' +
    '<div class="container hero__grid"><div data-reveal>' +
    eyebrow +
    "<h1>" + escapeHtml(b.tagline || b.name) + "</h1>" +
    lead +
    actions +
    trust +
    "</div>" +
    visual +
    "</div></section>"
  );
}

/** Capacità/interventi. Non mostra mai un prezzo: nessun equivalente del blocco price di beauty-wellness-v1. */
function renderAreeDiIntervento(data) {
  var services = data.services || [];
  if (!services.length) return "";
  var cards = services
    .map(function (s) {
      var icon = KNOWN_ICONS.indexOf(s.icon) !== -1 ? s.icon : null;
      var iconHtml = icon
        ? '<div class="service-card__icon"><svg width="28" height="28" aria-hidden="true"><use href="#' + icon + '"></use></svg></div>'
        : "";
      var desc = s.description ? "<p>" + escapeHtml(s.description) + "</p>" : "";
      return '<article class="service-card" data-reveal>' + iconHtml + "<h3>" + escapeHtml(s.name) + "</h3>" + desc + "</article>";
    })
    .join("");

  return (
    '<section class="section" id="aree-di-intervento" aria-labelledby="aree-title"><div class="container">' +
    '<div class="section-head" data-reveal><p class="kicker">Cosa facciamo</p>' +
    '<h2 id="aree-title">Aree di intervento</h2></div>' +
    '<div class="services-grid">' + cards + "</div>" +
    "</div></section>"
  );
}

function renderPercheNoi(data) {
  var strengths = data.strengths || [];
  if (!strengths.length) return "";
  var items = strengths
    .map(function (s, i) {
      var num = String(i + 1).padStart ? String(i + 1).padStart(2, "0") : (i + 1 < 10 ? "0" + (i + 1) : String(i + 1));
      var desc = s.description ? "<p>" + escapeHtml(s.description) + "</p>" : "";
      return (
        '<li class="why-item" data-reveal><span class="why-item__index">' + num + "</span>" +
        '<div class="why-item__body"><h3>' + escapeHtml(s.title) + "</h3>" + desc + "</div></li>"
      );
    })
    .join("");
  return (
    '<section class="section section--alt" id="perche-noi" aria-labelledby="perche-title"><div class="container">' +
    '<div class="section-head" data-reveal><p class="kicker">Perché sceglierci</p>' +
    '<h2 id="perche-title">I nostri punti di forza</h2></div>' +
    '<ol class="why-list">' + items + "</ol>" +
    "</div></section>"
  );
}

/** Elenca data.business.service_areas[] esattamente come fornito, senza mappa/geocoding/inferenza. */
function renderZonaServita(data) {
  var areas = (data.business.service_areas || []);
  if (!areas.length) return "";
  var chips = areas
    .map(function (a) {
      return '<li class="zone-chip">' + escapeHtml(a) + "</li>";
    })
    .join("");
  return (
    '<section class="section" id="zona-servita" aria-labelledby="zona-title"><div class="container">' +
    '<div class="section-head" data-reveal><p class="kicker">Copertura</p>' +
    '<h2 id="zona-title">Zone servite</h2></div>' +
    '<ul class="zone-list" data-reveal>' + chips + "</ul>" +
    "</div></section>"
  );
}

/** Più semplice della versione beauty: nessuna mappa, nessun modulo di contatto (già dead code lì, vedi CLAUDE.md). */
function renderContatti(data, whatsappDefaultMessage) {
  var b = data.business;
  var rows = [];
  if (b.address && b.address.line) {
    rows.push("<li><dt>Indirizzo</dt><dd>" + escapeHtml(b.address.line) + "</dd></li>");
  }
  var tel = urlUtil.buildTel(b.phone_display);
  var phoneText = b.phone_display ? escapeHtml(b.phone_display) : "Telefono disponibile nella versione reale";
  var phoneHtml = tel ? '<a href="' + escapeAttr(tel) + '">' + phoneText + "</a>" : phoneText;
  rows.push("<li><dt>Telefono</dt><dd>" + phoneHtml + "</dd></li>");
  if (b.hours) {
    rows.push("<li><dt>Orari</dt><dd>" + escapeHtml(b.hours) + "</dd></li>");
  }
  rows.push(
    "<li><dt>WhatsApp</dt><dd>" + shared.whatsappButton("btn btn--whatsapp btn--sm", whatsappDefaultMessage, "Scrivici su WhatsApp") + "</dd></li>"
  );

  var intro =
    data.mode !== "PRODUCTION"
      ? "<p>Tutti i dati qui sotto sono dimostrativi: indirizzo e telefono non corrispondono a un'attività reale.</p>"
      : "";

  return (
    '<section class="section section--alt" id="contatti" aria-labelledby="contatti-title"><div class="container">' +
    '<div class="section-head" data-reveal><p class="kicker">Preventivo</p>' +
    '<h2 id="contatti-title">Richiedi un preventivo</h2>' + intro + "</div>" +
    '<div class="contact-info" data-reveal><dl class="contact-list">' + rows.join("") + "</dl></div>" +
    "</div></section>"
  );
}

/**
 * Genera la pagina completa. ctx atteso da scripts/build.js:
 *  - data: dati validati (con reviews già filtrati agli elementi idonei;
 *    photos non è mai letto da questo file, vedi nota sul gallery in
 *    RUNBOOK.md/README.md — nessuna sezione foto in questa fase)
 *  - cssHrefs: array di percorsi relativi ai fogli di stile, in ordine
 *  - faviconHref: percorso relativo alla favicon
 *  - jsHref: percorso relativo allo script condiviso
 *  - allowIndexing: boolean (solo PRODUCTION con dati completi)
 *  - canonicalUrl: string|null (già validato https)
 *  - siteConfig: oggetto da iniettare in window.__SITE__ (già sicuro/validato)
 */
function renderPage(ctx) {
  var data = ctx.data;
  var whatsappDefaultMessage = (data.business.whatsapp && data.business.whatsapp.default_message) || "";
  var sections = buildSectionList(data);

  var html = shared.renderHead(ctx, { themeColor: "#1d4863" });
  html += '  <a class="skip-link" href="#main">Vai al contenuto principale</a>\n';
  html += "  " + renderIconSprite() + "\n";
  html += "  " + shared.renderHeader(data, sections, whatsappDefaultMessage) + "\n";
  html += "  " + shared.renderMobileMenu(sections, whatsappDefaultMessage) + "\n";
  html += '  <main id="main">\n';
  html += "    " + renderHero(data, whatsappDefaultMessage) + "\n";
  html += "    " + renderAreeDiIntervento(data) + "\n";
  html += "    " + renderPercheNoi(data) + "\n";
  html += "    " + renderZonaServita(data) + "\n";
  html += "    " + shared.renderRecensioni(data, { heading: "Cosa dicono i nostri clienti" }) + "\n";
  html += "    " + shared.renderFaq(data) + "\n";
  html += "    " + renderContatti(data, whatsappDefaultMessage) + "\n";
  html += "  </main>\n";
  html += "  " + shared.renderFooter(data, sections) + "\n";
  html += "  " + shared.renderWhatsappFloat(whatsappDefaultMessage) + "\n";
  html += '  <div class="demo-toast" id="demoToast" role="status" aria-live="polite"></div>\n';
  html += '  <script>window.__SITE__ = ' + esc.safeJsonForScriptTag(ctx.siteConfig) + ";</script>\n";
  html += '  <script src="' + escapeAttr(ctx.jsHref) + '"></script>\n';
  html += "</body>\n</html>\n";
  return html;
}

module.exports = { renderPage, buildSectionList };
