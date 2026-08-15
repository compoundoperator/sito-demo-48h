"use strict";

/**
 * templates/beauty-wellness-v1/render.js
 *
 * Genera l'HTML della landing a partire da dati già validati (vedi
 * scripts/validate.js) e da un contesto preparato da scripts/build.js.
 * Ogni sezione è condizionale: se il dato corrispondente è assente, la
 * sezione viene omessa interamente (nessun contenitore vuoto, nessun
 * link di navigazione orfano). Nessun dato viene mai inventato qui:
 * questo file si limita a decidere COME mostrare ciò che esiste.
 *
 * Tutto il testo proveniente dai dati passa da escapeHtml/escapeAttr
 * prima di finire nel markup.
 */

var esc = require("../../scripts/security/escape.js");
var urlUtil = require("../../scripts/security/url.js");

var escapeHtml = esc.escapeHtml;
var escapeAttr = esc.escapeAttr;

var KNOWN_ICONS = [
  "icon-viso", "icon-massaggio", "icon-mani", "icon-corpo", "icon-depilazione", "icon-sposa"
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
      "icon-viso",
      "0 0 48 48",
      '<path d="M15 22c0-8 4-13 9-13s9 5 9 13c0 9-5 15-9 15s-9-6-9-15z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 23c-2 0-3 2-2 4s3 2 4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M20 20c.6-.6 1.4-.6 2 0M26 20c.6-.6 1.4-.6 2 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M22 24c0 2-1 3-2 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19 32c2 1.6 8 1.6 10 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M33 15c2 1 3 3 2.5 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    ),
    iconSymbol(
      "icon-massaggio",
      "0 0 48 48",
      '<path d="M8 30c6-10 10-14 16-14s10 4 16 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 30c3-6 7-9 12-9s9 3 12 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><path d="M16 14c1.5-2.5 3.5-4 6-4M32 14c-1.5-2.5-3.5-4-6-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 34h36" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    ),
    iconSymbol(
      "icon-mani",
      "0 0 48 48",
      '<path d="M16 40V22c0-1.6 1.3-3 3-3s3 1.4 3 3v8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 30v-9c0-1.6 1.3-3 3-3s3 1.4 3 3v9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 30v-7c0-1.6 1.3-3 3-3s3 1.4 3 3v11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 33c-2-1-4 0-4 2 0 5 4 9 9 9h4c5 0 9-4 9-9v-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 12l1.6 3.4L18 17l-3.4 1.6L13 22l-1.6-3.4L8 17l3.4-1.6z" fill="currentColor"/>'
    ),
    iconSymbol(
      "icon-corpo",
      "0 0 48 48",
      '<circle cx="24" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M24 15c-6 0-10 4-10 9v4c0 2 1.5 3.5 3.5 3.5S21 30 21 28v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 15c6 0 10 4 10 9v4c0 2-1.5 3.5-3.5 3.5S27 30 27 28v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 27v9c0 1.7 1.3 3 3 3s3-1.3 3-3v-4 4c0 1.7 1.3 3 3 3s3-1.3 3-3v-9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 20c-1.4 1.6-1.4 3.4 0 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".6"/><path d="M38 20c1.4 1.6 1.4 3.4 0 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>'
    ),
    iconSymbol(
      "icon-depilazione",
      "0 0 48 48",
      '<path d="M20 8c-1 8 1 14 5 14s6-6 5-14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M25 22v18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 14l3 2M36 14l-3 2M14 30l4-1M36 30l-4-1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".6"/><circle cx="25" cy="40" r="2.4" fill="currentColor"/>'
    ),
    iconSymbol(
      "icon-sposa",
      "0 0 48 48",
      '<path d="M24 30c-9 0-14 4-14 10h28c0-6-5-10-14-10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="18" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 12c1.5-1.5 3.5-1.5 5 0M29 12c1.5-1.5 3.5-1.5 5 0M17 9c2-2 4-2 6 0M25 9c2-2 4-2 6 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".7"/><path d="M24 25v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    )
  ];
  return '<svg aria-hidden="true" style="display:none">' + symbols.join("") + "</svg>";
}

function whatsappButton(cls, message, label) {
  return (
    '<button type="button" class="' + escapeAttr(cls) + '" data-whatsapp-cta data-whatsapp-message="' +
    escapeAttr(message) + '"><svg aria-hidden="true"><use href="#icon-whatsapp"></use></svg>' + escapeHtml(label) + "</button>"
  );
}

function waveDivider(extraClass) {
  return (
    '<div class="section-divider' + (extraClass ? " " + extraClass : "") + '" aria-hidden="true">' +
    '<svg viewBox="0 0 1440 100" preserveAspectRatio="none"><path fill="currentColor" d="M0,32 C240,74 480,0 720,22 C960,44 1200,88 1440,40 L1440,100 L0,100 Z"/></svg></div>'
  );
}

function nameParts(name) {
  var idx = name.indexOf(" ");
  if (idx === -1) return { first: name, rest: "" };
  return { first: name.slice(0, idx), rest: name.slice(idx + 1) };
}

function renderWordmark(business) {
  var parts = nameParts(business.name);
  var html = escapeHtml(parts.first);
  if (parts.rest) html += " <span>" + escapeHtml(parts.rest) + "</span>";
  return html;
}

function buildSectionList(data) {
  var sections = [{ id: "servizi", label: "Servizi", present: (data.services || []).length > 0 }];
  sections.push({ id: "perche-noi", label: "Perché noi", present: (data.strengths || []).length > 0 });
  sections.push({ id: "atmosfera", label: "L'atmosfera", present: (data.atmosfera || []).length > 0 });
  sections.push({ id: "recensioni", label: "Recensioni", present: (data.reviews || []).length > 0 });
  sections.push({ id: "faq", label: "FAQ", present: (data.faq || []).length > 0 });
  sections.push({ id: "contatti", label: "Contatti", present: true });
  return sections.filter(function (s) { return s.present; });
}

function renderNav(sections) {
  return sections
    .map(function (s) {
      return '<li><a class="nav__link" data-nav-link href="#' + s.id + '">' + escapeHtml(s.label) + "</a></li>";
    })
    .join("");
}

function renderMobileNav(sections) {
  return sections
    .map(function (s) {
      return '<li><a data-nav-link href="#' + s.id + '">' + escapeHtml(s.label) + "</a></li>";
    })
    .join("");
}

function renderHeader(data, sections, whatsappDefaultMessage) {
  var wordmark = renderWordmark(data.business);
  var nav = renderNav(sections);
  var cta = whatsappButton("btn btn--whatsapp btn--sm nav__cta", whatsappDefaultMessage, "Scrivici");
  return (
    '<header class="site-header" id="siteHeader"><div class="container site-header__inner">' +
    '<a href="#top" class="wordmark">' + wordmark + "</a>" +
    '<nav class="nav" aria-label="Navigazione principale"><ul class="nav__list">' + nav + "</ul>" +
    cta +
    '<button type="button" class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="mobileMenu" aria-label="Apri il menu di navigazione"><span></span><span></span><span></span></button>' +
    "</nav></div></header>"
  );
}

function renderMobileMenu(data, sections, whatsappDefaultMessage) {
  return (
    '<div class="mobile-menu" id="mobileMenu"><ul class="mobile-menu__list">' +
    renderMobileNav(sections) +
    "</ul>" +
    whatsappButton("btn btn--whatsapp", whatsappDefaultMessage, "Scrivici su WhatsApp") +
    "</div>"
  );
}

function findHeroPhoto(data, photoUrlById) {
  var photos = data.photos || [];
  for (var i = 0; i < photos.length; i++) {
    if (photos[i].usage === "hero" && photoUrlById[photos[i].id]) return photos[i];
  }
  return null;
}

function renderHero(data, whatsappDefaultMessage, photoUrlById) {
  var b = data.business;
  var eyebrow = b.eyebrow ? '<p class="hero__eyebrow">' + escapeHtml(b.eyebrow) + "</p>" : "";
  var lead = b.intro ? '<p class="hero__lead">' + escapeHtml(b.intro) + "</p>" : "";

  var actions =
    '<div class="hero-actions">' +
    whatsappButton("btn btn--whatsapp", whatsappDefaultMessage, "Scrivici su WhatsApp") +
    (buildSectionList(data).some(function (s) { return s.id === "servizi"; })
      ? '<a class="btn btn--ghost" href="#servizi">Scopri i servizi</a>'
      : "") +
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

  var heroPhoto = findHeroPhoto(data, photoUrlById);
  var visual;
  if (heroPhoto) {
    visual =
      '<div class="hero__visual" data-reveal><img src="' + escapeAttr(photoUrlById[heroPhoto.id]) + '" alt="' +
      escapeAttr(heroPhoto.alt_text) + '" style="width:100%;height:100%;object-fit:cover;"></div>';
  } else {
    visual =
      '<div class="hero__visual" data-reveal aria-hidden="true"><p class="hero__visual-label">' +
      "Spazio dedicato alla foto o illustrazione dell'ambiente — in questa versione sostituito da una composizione grafica. " +
      "Nella versione reale: fotografia professionale o immagine generata con AI." +
      "</p></div>";
  }

  return (
    '<section class="hero" id="top">' +
    '<img class="hero__blob" src="assets/svg/blob-hero.svg" alt="" aria-hidden="true" width="640" height="640">' +
    '<img class="hero__pattern" src="assets/svg/pattern-tile.svg" alt="" aria-hidden="true" width="420" height="420">' +
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

function renderServizi(data) {
  var services = data.services || [];
  if (!services.length) return "";
  var cards = services
    .map(function (s) {
      var icon = KNOWN_ICONS.indexOf(s.icon) !== -1 ? s.icon : null;
      var iconHtml = icon
        ? '<div class="service-card__icon"><svg width="28" height="28" aria-hidden="true"><use href="#' + icon + '"></use></svg></div>'
        : "";
      var desc = s.description ? "<p>" + escapeHtml(s.description) + "</p>" : "";
      var price = "";
      if (s.price_from !== null && s.price_from !== undefined) {
        price = '<span class="service-card__price">da €' + escapeHtml(String(s.price_from)) +
          (s.price_note ? "<small>" + escapeHtml(s.price_note) + "</small>" : "") + "</span>";
      } else if (s.price_note) {
        price = '<span class="service-card__price">' + escapeHtml(s.price_note) + "</span>";
      }
      return (
        '<article class="service-card" data-reveal>' + iconHtml + "<h3>" + escapeHtml(s.name) + "</h3>" + desc +
        (price ? '<div class="service-card__footer">' + price + "</div>" : "") +
        "</article>"
      );
    })
    .join("");

  return (
    '<section class="section" id="servizi" aria-labelledby="servizi-title"><div class="container">' +
    '<div class="section-head" data-reveal><p class="kicker">I nostri trattamenti</p>' +
    '<h2 id="servizi-title">Servizi</h2></div>' +
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

function renderAtmosfera(data) {
  var atmosfera = data.atmosfera || [];
  if (!atmosfera.length) return "";
  var cards = atmosfera
    .map(function (a) {
      var desc = a.description ? "<p>" + escapeHtml(a.description) + "</p>" : "";
      return (
        '<article class="atmosfera-card" data-reveal>' +
        '<img class="atmosfera-card__blob" src="assets/svg/blob-section.svg" alt="" aria-hidden="true" width="220" height="220">' +
        "<h3>" + escapeHtml(a.title) + "</h3>" + desc + "</article>"
      );
    })
    .join("");
  return (
    '<section class="section" id="atmosfera" aria-labelledby="atmosfera-title"><div class="container">' +
    '<div class="section-head" data-reveal><p class="kicker">L\'esperienza</p>' +
    '<h2 id="atmosfera-title">L\'atmosfera</h2></div>' +
    '<div class="atmosfera-grid">' + cards + "</div>" +
    "</div></section>"
  );
}

function renderRecensioni(data) {
  var reviews = data.reviews || [];
  if (!reviews.length) return "";
  var stars = new Array(5).fill('<svg width="16" height="16"><use href="#icon-star"></use></svg>').join("");
  var cards = reviews
    .map(function (r) {
      var initial = r.author ? r.author.trim().charAt(0).toUpperCase() : "?";
      return (
        '<article class="review-card" data-reveal>' +
        '<div class="review-card__stars" role="img" aria-label="Valutazione: ' + (r.rating || 5) + ' stelle su 5">' + stars + "</div>" +
        "<blockquote>&quot;" + escapeHtml(r.text) + "&quot;</blockquote>" +
        '<footer><div class="review-card__avatar" aria-hidden="true">' + escapeHtml(initial) + ".</div>" +
        "<cite>" + escapeHtml(r.author) + "</cite></footer>" +
        "</article>"
      );
    })
    .join("");

  var disclaimer =
    data.mode !== "PRODUCTION"
      ? '<p class="demo-disclaimer">Nomi, recensioni e valutazioni presenti in questa pagina sono dimostrativi e servono solo a scopo illustrativo.</p>'
      : "";

  return (
    '<section class="section section--alt" id="recensioni" aria-labelledby="recensioni-title"><div class="container">' +
    '<div class="section-head section-head--center" data-reveal><p class="kicker">Recensioni</p>' +
    '<h2 id="recensioni-title">Cosa dicono le nostre clienti</h2></div>' +
    '<div class="reviews-grid">' + cards + "</div>" + disclaimer +
    "</div></section>"
  );
}

function renderFaq(data) {
  var faq = data.faq || [];
  if (!faq.length) return "";
  var items = faq
    .map(function (f) {
      return (
        '<details class="faq-item"><summary>' + escapeHtml(f.question) + "</summary>" +
        '<div class="faq-item__body"><p>' + escapeHtml(f.answer) + "</p></div></details>"
      );
    })
    .join("");
  return (
    '<section class="section" id="faq" aria-labelledby="faq-title"><div class="container">' +
    '<div class="section-head" data-reveal><p class="kicker">Domande frequenti</p>' +
    '<h2 id="faq-title">Tutto quello che vuoi sapere</h2></div>' +
    '<div class="faq-list" data-reveal>' + items + "</div>" +
    "</div></section>"
  );
}

function renderContatti(data, whatsappDefaultMessage, mapUrl) {
  var b = data.business;
  var rows = [];
  if (b.address && b.address.line) {
    rows.push("<li><dt>Indirizzo</dt><dd>" + escapeHtml(b.address.line) + "</dd></li>");
  }
  rows.push("<li><dt>Telefono</dt><dd>" + (b.phone_display ? escapeHtml(b.phone_display) : "Telefono disponibile nella versione reale") + "</dd></li>");
  if (b.hours) {
    rows.push("<li><dt>Orari</dt><dd>" + escapeHtml(b.hours) + "</dd></li>");
  }
  rows.push(
    "<li><dt>WhatsApp</dt><dd>" + whatsappButton("btn btn--whatsapp btn--sm", whatsappDefaultMessage, "Scrivici su WhatsApp") + "</dd></li>"
  );

  var map =
    '<figure class="map-placeholder"><img src="assets/svg/map-placeholder.svg" alt="Mappa stilizzata dimostrativa: non rappresenta una posizione reale" width="400" height="300">' +
    '<figcaption class="map-placeholder__caption">Mappa illustrativa — nella versione reale sarà sostituita con la posizione effettiva.</figcaption></figure>';

  var formEndpoint = b.contact_form_endpoint || null; // riservato a un uso futuro diretto su business, non usato in v1
  var showForm = data.mode !== "PRODUCTION" || Boolean(data.contactFormEndpointValidated);
  var formBlock = "";
  if (showForm) {
    var note =
      data.mode === "PRODUCTION"
        ? '<p class="form-demo-note">I dati inseriti in questo modulo non vengono mostrati pubblicamente.</p>'
        : '<p class="form-demo-note">Sito dimostrativo: non inserire dati personali reali. Questo modulo non invia né salva alcuna informazione: al termine riceverai solo una conferma dimostrativa. Per un contatto reale usa WhatsApp.</p>';
    formBlock =
      '<div class="contact-form-card" data-reveal><h3>Richiedi informazioni</h3>' + note +
      '<form id="demoForm" novalidate>' +
      '<div class="form-field"><label for="nome">Nome</label><input type="text" id="nome" name="nome" placeholder="Il tuo nome" autocomplete="off"></div>' +
      '<div class="form-field"><label for="telefono">Telefono</label><input type="tel" id="telefono" name="telefono" placeholder="Non inserire un numero reale" autocomplete="off"></div>' +
      '<div class="form-field"><label for="messaggio">Messaggio</label><textarea id="messaggio" name="messaggio" placeholder="Scrivi qui la tua richiesta"></textarea></div>' +
      '<button type="submit" class="btn btn--primary">Invia richiesta</button>' +
      '<p class="form-status" id="formStatus" role="status" aria-live="polite"></p>' +
      "</form></div>";
  }

  var intro =
    data.mode !== "PRODUCTION"
      ? "<p>Tutti i dati qui sotto sono dimostrativi: indirizzo, telefono e mappa non corrispondono a un'attività reale.</p>"
      : "";

  return (
    '<section class="section section--alt" id="contatti" aria-labelledby="contatti-title"><div class="container">' +
    '<div class="section-head" data-reveal><p class="kicker">Contatti</p>' +
    '<h2 id="contatti-title">Vieni a trovarci, oppure scrivici</h2>' + intro + "</div>" +
    '<div class="contact-grid"><div class="contact-info" data-reveal>' +
    '<dl class="contact-list">' + rows.join("") + "</dl>" + map + "</div>" +
    formBlock +
    "</div></div></section>"
  );
}

function renderFooter(data, sections) {
  var b = data.business;
  var quickLinks = sections
    .map(function (s) {
      return '<li><a data-nav-link href="#' + s.id + '">' + escapeHtml(s.label) + "</a></li>";
    })
    .join("");

  var socialItems = [];
  if (b.social && b.social.instagram) {
    var ig = urlUtil.sanitizeSocialUrl(b.social.instagram);
    if (ig) socialItems.push('<li><a href="' + escapeAttr(ig) + '" rel="noopener">Instagram</a></li>');
  }
  if (b.social && b.social.facebook) {
    var fb = urlUtil.sanitizeSocialUrl(b.social.facebook);
    if (fb) socialItems.push('<li><a href="' + escapeAttr(fb) + '" rel="noopener">Facebook</a></li>');
  }
  var socialBlock = socialItems.length ? '<div class="footer-col"><h4>Social</h4><ul>' + socialItems.join("") + "</ul></div>" : "";

  var disclaimer = "";
  if (data.mode !== "PRODUCTION" && data.disclaimers && data.disclaimers.demo_banner) {
    disclaimer = '<p class="footer-disclaimer">' + escapeHtml(data.disclaimers.demo_banner) + "</p>";
  }

  return (
    '<footer class="site-footer"><div class="container"><div class="footer-grid">' +
    '<div class="footer-brand"><a href="#top" class="wordmark">' + renderWordmark(b) + "</a>" +
    (b.intro ? "<p>" + escapeHtml(b.intro) + "</p>" : "") + "</div>" +
    '<nav class="footer-col" aria-label="Link rapidi"><h4>Link rapidi</h4><ul>' + quickLinks + "</ul></nav>" +
    socialBlock +
    "</div>" +
    '<div class="footer-bottom">' + disclaimer + "<p>© <span id=\"year\"></span></p></div>" +
    "</div></footer>"
  );
}

function renderWhatsappFloat(whatsappDefaultMessage) {
  return (
    '<button type="button" class="whatsapp-float" data-whatsapp-cta data-whatsapp-message="' +
    escapeAttr(whatsappDefaultMessage) + '" aria-label="Contattaci su WhatsApp">' +
    '<svg aria-hidden="true"><use href="#icon-whatsapp"></use></svg>' +
    '<span class="whatsapp-float__label" aria-hidden="true">Scrivici</span></button>'
  );
}

function renderHead(ctx) {
  var data = ctx.data;
  var b = data.business;
  var title = escapeHtml(b.name) + (b.tagline ? " — " + escapeHtml(b.tagline) : "");
  var description = b.intro ? escapeHtml(b.intro).slice(0, 300) : escapeHtml(b.name);

  var robotsTag =
    ctx.allowIndexing
      ? ""
      : '<meta name="robots" content="noindex, nofollow">\n  <!-- Demo: richiesta ai motori di ricerca di non indicizzare. Non è un controllo di accesso: chi ha l\'URL diretto può comunque vedere la pagina. -->';

  var canonical = ctx.canonicalUrl ? '<link rel="canonical" href="' + escapeAttr(ctx.canonicalUrl) + '">' : "";

  var jsonLd = "";
  if (ctx.allowIndexing && ctx.canonicalUrl && b.address && b.address.line) {
    var ld = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: b.name,
      url: ctx.canonicalUrl,
      address: b.address.line
    };
    jsonLd = '<script type="application/ld+json">' + esc.safeJsonForScriptTag(ld) + "</script>";
  }

  var cssLinks = ctx.cssHrefs.map(function (href) { return '<link rel="stylesheet" href="' + escapeAttr(href) + '">'; }).join("\n  ");

  return (
    "<!doctype html>\n<html lang=\"it\">\n<head>\n" +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "  <title>" + title + "</title>\n" +
    '  <meta name="description" content="' + escapeAttr(description) + '">\n' +
    "  " + robotsTag + "\n" +
    '  <meta name="theme-color" content="#C1653A">\n' +
    '  <link rel="icon" type="image/svg+xml" href="' + escapeAttr(ctx.faviconHref) + '">\n' +
    "  " + canonical + "\n" +
    "  " + jsonLd + "\n" +
    "  " + cssLinks + "\n" +
    "</head>\n<body>\n"
  );
}

/**
 * Genera la pagina completa. ctx atteso da scripts/build.js:
 *  - data: dati validati (con photos/reviews già filtrati agli elementi idonei)
 *  - cssHrefs: array di percorsi relativi ai fogli di stile, in ordine
 *  - faviconHref: percorso relativo alla favicon
 *  - jsHref: percorso relativo allo script condiviso
 *  - allowIndexing: boolean (solo PRODUCTION con dati completi)
 *  - canonicalUrl: string|null (già validato https)
 *  - photoUrlById: { [photoId]: relativePath } per le foto realmente copiate in dist
 *  - siteConfig: oggetto da iniettare in window.__SITE__ (già sicuro/validato)
 */
function renderPage(ctx) {
  var data = ctx.data;
  var whatsappDefaultMessage = (data.business.whatsapp && data.business.whatsapp.default_message) || "";
  var sections = buildSectionList(data);
  var photoUrlById = ctx.photoUrlById || {};

  var html = renderHead(ctx);
  html += '  <a class="skip-link" href="#main">Vai al contenuto principale</a>\n';
  html += "  " + renderIconSprite() + "\n";
  html += "  " + renderHeader(data, sections, whatsappDefaultMessage) + "\n";
  html += "  " + renderMobileMenu(data, sections, whatsappDefaultMessage) + "\n";
  html += '  <main id="main">\n';
  html += "    " + renderHero(data, whatsappDefaultMessage, photoUrlById) + "\n";
  html += "    " + waveDivider("section-divider--to-bg") + "\n";
  html += "    " + renderServizi(data) + "\n";
  html += "    " + renderPercheNoi(data) + "\n";
  html += "    " + renderAtmosfera(data) + "\n";
  html += "    " + waveDivider("") + "\n";
  html += "    " + renderRecensioni(data) + "\n";
  html += "    " + renderFaq(data) + "\n";
  html += "    " + renderContatti(data, whatsappDefaultMessage, null) + "\n";
  html += "  </main>\n";
  html += "  " + renderFooter(data, sections) + "\n";
  html += "  " + renderWhatsappFloat(whatsappDefaultMessage) + "\n";
  html += '  <div class="demo-toast" id="demoToast" role="status" aria-live="polite"></div>\n';
  html += '  <script>window.__SITE__ = ' + esc.safeJsonForScriptTag(ctx.siteConfig) + ";</script>\n";
  html += '  <script src="' + escapeAttr(ctx.jsHref) + '"></script>\n';
  html += "</body>\n</html>\n";
  return html;
}

module.exports = { renderPage, buildSectionList };
