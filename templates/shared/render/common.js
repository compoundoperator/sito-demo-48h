"use strict";

/**
 * templates/shared/render/common.js
 *
 * Funzioni di rendering condivise da qualunque famiglia di template: sono
 * state estratte verbatim da templates/beauty-wellness-v1/render.js (le
 * uniche 9 sezioni davvero generiche di quel file — head/metadata, header,
 * navigazione desktop/mobile, recensioni, FAQ, footer, disclaimer non-
 * PRODUCTION, CTA WhatsApp flottante). Ogni famiglia continua a possedere
 * localmente hero, servizi/aree-di-intervento, atmosfera, contatti, sprite
 * icone e il proprio ordine di sezioni in renderPage.
 *
 * Tutto il testo proveniente dai dati passa da escapeHtml/escapeAttr prima
 * di finire nel markup, esattamente come nel file di origine.
 */

var esc = require("../../../scripts/security/escape.js");
var urlUtil = require("../../../scripts/security/url.js");

var escapeHtml = esc.escapeHtml;
var escapeAttr = esc.escapeAttr;

function whatsappButton(cls, message, label) {
  return (
    '<button type="button" class="' + escapeAttr(cls) + '" data-whatsapp-cta data-whatsapp-message="' +
    escapeAttr(message) + '"><svg aria-hidden="true"><use href="#icon-whatsapp"></use></svg>' + escapeHtml(label) + "</button>"
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

/** opts.ctaLabel default "Scrivici". */
function renderHeader(data, sections, whatsappDefaultMessage, opts) {
  opts = opts || {};
  var ctaLabel = opts.ctaLabel || "Scrivici";
  var wordmark = renderWordmark(data.business);
  var nav = renderNav(sections);
  var cta = whatsappButton("btn btn--whatsapp btn--sm nav__cta", whatsappDefaultMessage, ctaLabel);
  return (
    '<header class="site-header" id="siteHeader"><div class="container site-header__inner">' +
    '<a href="#top" class="wordmark">' + wordmark + "</a>" +
    '<nav class="nav" aria-label="Navigazione principale"><ul class="nav__list">' + nav + "</ul>" +
    cta +
    '<button type="button" class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="mobileMenu" aria-label="Apri il menu di navigazione"><span></span><span></span><span></span></button>' +
    "</nav></div></header>"
  );
}

/**
 * Nota: la versione condivisa non riceve più `data` — nel file di origine
 * era accettato ma mai letto nel corpo della funzione. opts.ctaLabel
 * default "Scrivici su WhatsApp".
 */
function renderMobileMenu(sections, whatsappDefaultMessage, opts) {
  opts = opts || {};
  var ctaLabel = opts.ctaLabel || "Scrivici su WhatsApp";
  return (
    '<div class="mobile-menu" id="mobileMenu"><ul class="mobile-menu__list">' +
    renderMobileNav(sections) +
    "</ul>" +
    whatsappButton("btn btn--whatsapp", whatsappDefaultMessage, ctaLabel) +
    "</div>"
  );
}

/** opts.kicker default "Recensioni", opts.heading default "Cosa dicono le nostre clienti". */
function renderRecensioni(data, opts) {
  opts = opts || {};
  var kicker = opts.kicker || "Recensioni";
  var heading = opts.heading || "Cosa dicono le nostre clienti";
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
    '<div class="section-head section-head--center" data-reveal><p class="kicker">' + escapeHtml(kicker) + "</p>" +
    '<h2 id="recensioni-title">' + escapeHtml(heading) + "</h2></div>" +
    '<div class="reviews-grid">' + cards + "</div>" + disclaimer +
    "</div></section>"
  );
}

/** opts.kicker default "Domande frequenti", opts.heading default "Tutto quello che vuoi sapere". */
function renderFaq(data, opts) {
  opts = opts || {};
  var kicker = opts.kicker || "Domande frequenti";
  var heading = opts.heading || "Tutto quello che vuoi sapere";
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
    '<div class="section-head" data-reveal><p class="kicker">' + escapeHtml(kicker) + "</p>" +
    '<h2 id="faq-title">' + escapeHtml(heading) + "</h2></div>" +
    '<div class="faq-list" data-reveal>' + items + "</div>" +
    "</div></section>"
  );
}

/** opts riservato, non usato oggi. */
function renderFooter(data, sections, opts) {
  opts = opts || {};
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

/** opts.label default "Scrivici". */
function renderWhatsappFloat(whatsappDefaultMessage, opts) {
  opts = opts || {};
  var label = opts.label || "Scrivici";
  return (
    '<button type="button" class="whatsapp-float" data-whatsapp-cta data-whatsapp-message="' +
    escapeAttr(whatsappDefaultMessage) + '" aria-label="Contattaci su WhatsApp">' +
    '<svg aria-hidden="true"><use href="#icon-whatsapp"></use></svg>' +
    '<span class="whatsapp-float__label" aria-hidden="true">' + escapeHtml(label) + "</span></button>"
  );
}

/**
 * opts.themeColor OBBLIGATORIO (ogni famiglia passa il proprio colore
 * primario preset, come stringa letterale — Node non ha accesso al valore
 * risolto della custom property CSS in fase di rendering). opts.lang
 * default "it". opts.schemaType default "LocalBusiness".
 */
function renderHead(ctx, opts) {
  opts = opts || {};
  var lang = opts.lang || "it";
  var schemaType = opts.schemaType || "LocalBusiness";
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
      "@type": schemaType,
      name: b.name,
      url: ctx.canonicalUrl,
      address: b.address.line
    };
    jsonLd = '<script type="application/ld+json">' + esc.safeJsonForScriptTag(ld) + "</script>";
  }

  var cssLinks = ctx.cssHrefs.map(function (href) { return '<link rel="stylesheet" href="' + escapeAttr(href) + '">'; }).join("\n  ");

  return (
    "<!doctype html>\n<html lang=\"" + escapeAttr(lang) + "\">\n<head>\n" +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "  <title>" + title + "</title>\n" +
    '  <meta name="description" content="' + escapeAttr(description) + '">\n' +
    "  " + robotsTag + "\n" +
    '  <meta name="theme-color" content="' + escapeAttr(opts.themeColor) + '">\n' +
    '  <link rel="icon" type="image/svg+xml" href="' + escapeAttr(ctx.faviconHref) + '">\n' +
    "  " + canonical + "\n" +
    "  " + jsonLd + "\n" +
    "  " + cssLinks + "\n" +
    "</head>\n<body>\n"
  );
}

module.exports = {
  renderHead,
  renderHeader,
  renderNav,
  renderMobileNav,
  renderMobileMenu,
  renderRecensioni,
  renderFaq,
  renderFooter,
  renderWhatsappFloat,
  whatsappButton,
  renderWordmark,
  nameParts
};
