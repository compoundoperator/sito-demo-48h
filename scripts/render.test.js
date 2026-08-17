"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");

var render = require("../templates/beauty-wellness-v1/render.js");

function baseCtx(overrides) {
  var data = {
    mode: "TEMPLATE_DEMO",
    business: {
      name: "Attività di prova",
      slug: "attivita-di-prova",
      tagline: "Slogan di prova",
      intro: "Introduzione di prova.",
      content_origin: "fictional_demo",
      whatsapp: { number: null, default_message: "Ciao!" },
      social: {}
    },
    services: [],
    strengths: [],
    atmosfera: [],
    photos: [],
    reviews: [],
    faq: [],
    contact_form: { endpoint: null },
    disclaimers: { demo_banner: "Demo." }
  };
  var ctx = {
    data: data,
    cssHrefs: ["css/style.css"],
    faviconHref: "assets/svg/favicon.svg",
    jsHref: "js/base.js",
    allowIndexing: false,
    canonicalUrl: null,
    photoUrlById: {},
    siteConfig: { mode: "TEMPLATE_DEMO", whatsappNumber: null, whatsappDefaultMessage: "Ciao!", whatsappDemoText: "Demo" }
  };
  return Object.assign(ctx, overrides || {});
}

test("il nome business con HTML injection viene sempre restituito escapato", function () {
  var ctx = baseCtx();
  ctx.data.business.name = '<script>alert(1)</script>Salone';
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("<script>alert(1)</script>"), -1);
  assert.ok(html.indexOf("&lt;script&gt;alert(1)&lt;/script&gt;") !== -1);
});

test("la descrizione di un servizio con HTML injection viene escapata", function () {
  var ctx = baseCtx();
  ctx.data.services = [{ name: "Servizio", description: '"><img src=x onerror=alert(1)>', price_from: 10, icon: "icon-viso" }];
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("<img src=x onerror=alert(1)>"), -1);
  assert.ok(html.indexOf("&quot;&gt;&lt;img") !== -1 || html.indexOf("&lt;img") !== -1);
});

test("il testo di una recensione con tentativo di chiusura tag viene escapato", function () {
  var ctx = baseCtx();
  ctx.data.reviews = [{ text: "</blockquote><script>alert(1)</script>", author: "Autore Test", rating: 5, content_origin: "fictional_demo" }];
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("<script>alert(1)</script>"), -1);
});

test("domanda/risposta FAQ con HTML injection vengono escapate", function () {
  var ctx = baseCtx();
  ctx.data.faq = [{ question: '<img src=x onerror=alert(1)>', answer: "Risposta <b>normale</b> col tentativo di tag." }];
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("<img src=x onerror=alert(1)>"), -1);
  assert.equal(html.indexOf("<b>normale</b>"), -1);
});

test("l'alt text di una foto con HTML injection viene escapato nell'attributo", function () {
  var ctx = baseCtx();
  ctx.photoUrlById = { "hero-1": "assets/photos/hero-1.webp" };
  ctx.data.photos = [{ id: "hero-1", local_file: "photos/hero-1.jpg", alt_text: '"><script>alert(1)</script>', usage: "hero", content_origin: "fictional_demo" }];
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("<script>alert(1)</script>"), -1);
});

test("link social con javascript: viene rifiutato e omesso dal footer", function () {
  var ctx = baseCtx();
  ctx.data.business.social = { instagram: "javascript:alert(1)", facebook: "https://facebook.com/pagina-valida" };
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("javascript:"), -1);
  assert.ok(html.indexOf("https://facebook.com/pagina-valida") !== -1);
});

test("link social con data: viene rifiutato", function () {
  var ctx = baseCtx();
  ctx.data.business.social = { instagram: "data:text/html;base64,PHNjcmlwdD4=", facebook: null };
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("data:text/html"), -1);
});

test("il banner disclaimer con HTML injection viene escapato nel footer", function () {
  var ctx = baseCtx();
  ctx.data.disclaimers = { demo_banner: '<script>alert(1)</script>' };
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("<script>alert(1)</script>"), -1);
});

test("window.__SITE__ con dati pericolosi resta JSON sicuro (no chiusura anticipata dello script)", function () {
  var ctx = baseCtx();
  ctx.siteConfig.whatsappDefaultMessage = "</script><script>alert(1)</script>";
  var html = render.renderPage(ctx);
  var scriptTagMatches = html.match(/<script>window\.__SITE__[\s\S]*?<\/script>/);
  assert.ok(scriptTagMatches);
  assert.equal(scriptTagMatches[0].indexOf("</script><script>alert(1)"), -1);
});

test("JSON-LD (quando generato) serializza in modo sicuro un nome con caratteri pericolosi", function () {
  var ctx = baseCtx();
  ctx.allowIndexing = true;
  ctx.canonicalUrl = "https://esempio-attivita.it/";
  ctx.data.mode = "PRODUCTION";
  ctx.data.business.name = 'Attività "Reale" </script><script>alert(1)</script>';
  ctx.data.business.address = { line: "Via Esempio 1, Roma" };
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("</script><script>alert(1)</script>"), -1);
  assert.ok(html.indexOf('"@type":"LocalBusiness"') !== -1);
});

// ---------- omissione sezioni ----------

test("buildSectionList omette le sezioni senza dati", function () {
  var data = baseCtx().data;
  var sections = render.buildSectionList(data);
  var ids = sections.map(function (s) { return s.id; });
  assert.equal(ids.indexOf("servizi"), -1);
  assert.equal(ids.indexOf("recensioni"), -1);
  assert.equal(ids.indexOf("faq"), -1);
  assert.ok(ids.indexOf("contatti") !== -1); // sempre presente
});

test("buildSectionList include una sezione quando i dati sono presenti", function () {
  var data = baseCtx().data;
  data.services = [{ name: "Servizio", icon: "icon-viso" }];
  var sections = render.buildSectionList(data);
  var ids = sections.map(function (s) { return s.id; });
  assert.ok(ids.indexOf("servizi") !== -1);
});

test("una sezione omessa non lascia un <section> vuoto nell'HTML", function () {
  var html = render.renderPage(baseCtx());
  assert.equal(html.indexOf('id="faq"'), -1);
  assert.equal(html.indexOf('id="recensioni"'), -1);
  assert.equal(html.indexOf('id="servizi"'), -1);
});

// ---------- assenza dati interni nell'HTML ----------

test("lead_id/priority/source_file/source_row/internal_notes non compaiono mai nell'HTML generato", function () {
  var ctx = baseCtx();
  ctx.data.lead_id = "SEGRETO-INTERNO-001";
  ctx.data.priority = "high";
  ctx.data.source_file = "leads-riservato.xlsx";
  ctx.data.source_row = 42;
  ctx.data.business.internal_notes = "Nota interna riservata XYZ123";
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("SEGRETO-INTERNO-001"), -1);
  assert.equal(html.indexOf("leads-riservato.xlsx"), -1);
  assert.equal(html.indexOf("Nota interna riservata XYZ123"), -1);
});

// ---------- rimozione commento TODO di sviluppo dall'HTML pubblicato ----------

test("il commento TODO di sviluppo non compare mai nell'HTML generato, né in modalità demo né in PRODUCTION indicizzabile", function () {
  var ctxDemo = baseCtx(); // allowIndexing: false di default
  var htmlDemo = render.renderPage(ctxDemo);
  assert.equal(htmlDemo.indexOf("TODO produzione"), -1);

  var ctxProd = baseCtx({ allowIndexing: true, canonicalUrl: "https://esempio-attivita.it/" });
  ctxProd.data.mode = "PRODUCTION";
  ctxProd.data.business.address = { line: "Via Esempio 1, Roma" };
  var htmlProd = render.renderPage(ctxProd);
  assert.equal(htmlProd.indexOf("TODO produzione"), -1);
});

// ---------- disclaimer del footer: gating per modalità ----------

test("il disclaimer del footer non compare mai in un build PRODUCTION, anche se demo_banner è valorizzato", function () {
  var ctx = baseCtx({ allowIndexing: true, canonicalUrl: "https://esempio-attivita.it/" });
  ctx.data.mode = "PRODUCTION";
  ctx.data.business.address = { line: "Via Esempio 1, Roma" };
  ctx.data.disclaimers = { demo_banner: "Concept commerciale non ufficiale, preparato per il titolare." };
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf('class="footer-disclaimer"'), -1);
});

test("il disclaimer del footer resta presente in TEMPLATE_DEMO quando demo_banner è valorizzato", function () {
  var ctx = baseCtx();
  ctx.data.disclaimers = { demo_banner: "Concept commerciale non ufficiale, preparato per il titolare." };
  var html = render.renderPage(ctx);
  assert.ok(html.indexOf('class="footer-disclaimer"') !== -1);
});

// ---------- pinning: candidati per estrazione condivisa (fissano l'output ATTUALE,
// pre-refactor, dei 9 pezzi condivisibili — vedi templates/shared/render/common.js —
// così un cambiamento non intenzionale nel refactor fa fallire questi test) ----------

function fullSectionsCtx() {
  var ctx = baseCtx();
  ctx.data.services = [{ name: "Servizio", description: "Descrizione", price_from: 10, icon: "icon-viso" }];
  ctx.data.strengths = [{ title: "Punto di forza", description: null }];
  ctx.data.reviews = [{ text: "Ottimo servizio", author: "Cliente Prova", rating: 5, content_origin: "fictional_demo" }];
  ctx.data.faq = [{ question: "Domanda?", answer: "Risposta." }];
  return ctx;
}

// 1. document <head>/metadata
test("pinning renderHead: theme-color, favicon, css link, title", function () {
  var html = render.renderPage(baseCtx());
  assert.ok(html.indexOf('<meta name="theme-color" content="#C1653A">') !== -1);
  assert.ok(html.indexOf('<link rel="icon" type="image/svg+xml" href="assets/svg/favicon.svg">') !== -1);
  assert.ok(html.indexOf('<link rel="stylesheet" href="css/style.css">') !== -1);
  assert.ok(html.indexOf("<title>Attività di prova — Slogan di prova</title>") !== -1);
});

// 2. header
test("pinning renderHeader: id=siteHeader, wordmark, nav-toggle contract with base.js", function () {
  var html = render.renderPage(fullSectionsCtx());
  assert.ok(html.indexOf('<header class="site-header" id="siteHeader">') !== -1);
  assert.ok(html.indexOf('<a href="#top" class="wordmark">') !== -1);
  assert.ok(html.indexOf('<nav class="nav" aria-label="Navigazione principale"><ul class="nav__list">') !== -1);
  assert.ok(html.indexOf('class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="mobileMenu"') !== -1);
});

// 3. desktop navigation
test("pinning renderNav: nav__link entries match buildSectionList output", function () {
  var ctx = fullSectionsCtx();
  var html = render.renderPage(ctx);
  var sections = render.buildSectionList(ctx.data);
  sections.forEach(function (s) {
    assert.ok(html.indexOf('<a class="nav__link" data-nav-link href="#' + s.id + '">') !== -1, "missing nav link for " + s.id);
  });
});

// 4. mobile navigation
test("pinning renderMobileMenu: id=mobileMenu contract with base.js", function () {
  var html = render.renderPage(fullSectionsCtx());
  assert.ok(html.indexOf('<div class="mobile-menu" id="mobileMenu"><ul class="mobile-menu__list">') !== -1);
});

// 5. reviews
test("pinning renderRecensioni: kicker, heading, disclaimer in non-PRODUCTION", function () {
  var html = render.renderPage(fullSectionsCtx());
  assert.ok(html.indexOf('<p class="kicker">Recensioni</p>') !== -1);
  assert.ok(html.indexOf('<h2 id="recensioni-title">Cosa dicono le nostre clienti</h2>') !== -1);
  assert.ok(html.indexOf('class="demo-disclaimer"') !== -1);
});

// 6. FAQ
test("pinning renderFaq: kicker and heading", function () {
  var html = render.renderPage(fullSectionsCtx());
  assert.ok(html.indexOf('<p class="kicker">Domande frequenti</p>') !== -1);
  assert.ok(html.indexOf('<h2 id="faq-title">Tutto quello che vuoi sapere</h2>') !== -1);
});

// 7. footer
test("pinning renderFooter: quick links, id=year contract with base.js", function () {
  var ctx = fullSectionsCtx();
  var html = render.renderPage(ctx);
  assert.ok(html.indexOf('<footer class="site-footer">') !== -1);
  assert.ok(html.indexOf('<nav class="footer-col" aria-label="Link rapidi"><h4>Link rapidi</h4><ul>') !== -1);
  assert.ok(html.indexOf('<span id="year">') !== -1);
});

// 9. WhatsApp floating CTA (candidate 8, the non-PRODUCTION disclaimer, is already
// pinned above by the two existing "disclaimer del footer" tests)
test("pinning renderWhatsappFloat: data-whatsapp-cta contract with base.js", function () {
  var html = render.renderPage(baseCtx());
  assert.ok(html.indexOf('class="whatsapp-float" data-whatsapp-cta') !== -1);
});
