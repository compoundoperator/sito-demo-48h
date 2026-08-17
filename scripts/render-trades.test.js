"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");

var render = require("../templates/trades-v1/render.js");

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
      social: {},
      service_areas: null
    },
    services: [],
    strengths: [],
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

function fullSectionsCtx() {
  var ctx = baseCtx();
  ctx.data.services = [{ name: "Impianti civili", description: "Descrizione", icon: "icon-bolt" }];
  ctx.data.strengths = [{ title: "Punto di forza", description: null }];
  ctx.data.business.service_areas = ["Zona Roma Est", "Zona Roma Centro"];
  ctx.data.reviews = [{ text: "Ottimo servizio", author: "Cliente Prova", rating: 5, content_origin: "fictional_demo" }];
  ctx.data.faq = [{ question: "Domanda?", answer: "Risposta." }];
  return ctx;
}

// ---------- omissione sezioni ----------

test("buildSectionList omette le sezioni senza dati", function () {
  var data = baseCtx().data;
  var sections = render.buildSectionList(data);
  var ids = sections.map(function (s) { return s.id; });
  assert.equal(ids.indexOf("aree-di-intervento"), -1);
  assert.equal(ids.indexOf("perche-noi"), -1);
  assert.equal(ids.indexOf("zona-servita"), -1);
  assert.equal(ids.indexOf("recensioni"), -1);
  assert.equal(ids.indexOf("faq"), -1);
  assert.ok(ids.indexOf("contatti") !== -1); // sempre presente
});

test("buildSectionList include tutte le sezioni quando i dati sono presenti", function () {
  var sections = render.buildSectionList(fullSectionsCtx().data);
  var ids = sections.map(function (s) { return s.id; });
  ["aree-di-intervento", "perche-noi", "zona-servita", "recensioni", "faq", "contatti"].forEach(function (id) {
    assert.ok(ids.indexOf(id) !== -1, "missing section " + id);
  });
});

test("una sezione omessa non lascia un <section> vuoto nell'HTML, e nessun link di navigazione orfano", function () {
  var html = render.renderPage(baseCtx());
  assert.equal(html.indexOf('id="faq"'), -1);
  assert.equal(html.indexOf('id="recensioni"'), -1);
  assert.equal(html.indexOf('id="aree-di-intervento"'), -1);
  assert.equal(html.indexOf('id="perche-noi"'), -1);
  assert.equal(html.indexOf('id="zona-servita"'), -1);
  assert.equal(html.indexOf('href="#aree-di-intervento"'), -1);
});

test("la navigazione desktop corrisponde esattamente alle sezioni effettivamente renderizzate", function () {
  var ctx = fullSectionsCtx();
  var html = render.renderPage(ctx);
  var sections = render.buildSectionList(ctx.data);
  sections.forEach(function (s) {
    assert.ok(html.indexOf('<a class="nav__link" data-nav-link href="#' + s.id + '">') !== -1, "missing nav link for " + s.id);
  });
  assert.ok(html.indexOf('<h2 id="recensioni-title">Cosa dicono i nostri clienti</h2>') !== -1);
  assert.equal(html.indexOf("Cosa dicono le nostre clienti"), -1);
});

// ---------- service_areas / zona servita ----------

test("service_areas presente renderizza la sezione zona-servita con i valori escapati", function () {
  var ctx = baseCtx();
  ctx.data.business.service_areas = ["Zona Roma Est", '<script>alert(1)</script>'];
  var html = render.renderPage(ctx);
  assert.ok(html.indexOf('id="zona-servita"') !== -1);
  assert.ok(html.indexOf("Zona Roma Est") !== -1);
  assert.equal(html.indexOf("<script>alert(1)</script>"), -1);
  assert.ok(html.indexOf("&lt;script&gt;alert(1)&lt;/script&gt;") !== -1);
});

test("service_areas assente o vuoto omette del tutto la sezione zona-servita", function () {
  var ctxAbsent = baseCtx();
  assert.equal(render.renderPage(ctxAbsent).indexOf('id="zona-servita"'), -1);

  var ctxEmpty = baseCtx();
  ctxEmpty.data.business.service_areas = [];
  assert.equal(render.renderPage(ctxEmpty).indexOf('id="zona-servita"'), -1);
});

// ---------- aree di intervento: mai un prezzo ----------

test("i servizi renderizzano come capacità (nome/descrizione/icona), mai un prezzo anche se price_from/price_note sono valorizzati", function () {
  var ctx = baseCtx();
  ctx.data.services = [
    { name: "Impianti civili", description: "Descrizione", icon: "icon-bolt", price_from: 120, price_note: "a partire da" }
  ];
  var html = render.renderPage(ctx);
  assert.ok(html.indexOf("Impianti civili") !== -1);
  assert.ok(html.indexOf("Descrizione") !== -1);
  assert.equal(html.indexOf("service-card__price"), -1);
  assert.equal(html.indexOf("120"), -1);
  assert.equal(html.indexOf("da €"), -1);
  assert.equal(html.indexOf("a partire da"), -1);
});

// ---------- nessuna sezione atmosfera, mai ----------

test("non esiste alcuna sezione atmosfera, in nessuna circostanza", function () {
  var ctx = fullSectionsCtx();
  ctx.data.atmosfera = [{ title: "Ambiente", description: "Descrizione" }];
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf('id="atmosfera"'), -1);
  assert.equal(html.indexOf("atmosfera-grid"), -1);
});

// ---------- icone: mai quelle di beauty-wellness-v1 ----------

test("nessuna icona di beauty-wellness-v1 compare mai nell'output di trades-v1", function () {
  var html = render.renderPage(fullSectionsCtx());
  ["icon-viso", "icon-massaggio", "icon-mani", "icon-corpo", "icon-depilazione", "icon-sposa"].forEach(function (id) {
    assert.equal(html.indexOf('"' + id + '"'), -1, "unexpected beauty icon id " + id);
  });
});

// ---------- perché noi: contratto QA geometry-check (why-item__body) ----------

test("renderPercheNoi usa la classe why-item__body (riuso del controllo di geometria QA esistente)", function () {
  var html = render.renderPage(fullSectionsCtx());
  assert.ok(html.indexOf('class="why-item__body"') !== -1);
});

// ---------- contatti: tel: link quando possibile, fallback altrimenti ----------

test("il telefono renderizza un link tel: quando phone_display è un numero valido", function () {
  var ctx = baseCtx();
  ctx.data.business.phone_display = "351 123 4567";
  var html = render.renderPage(ctx);
  assert.ok(html.indexOf('<a href="tel:') !== -1);
});

test("il telefono ricade su testo semplice quando phone_display non è un numero valido", function () {
  var ctx = baseCtx();
  ctx.data.business.phone_display = "chiamare in negozio";
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf('<a href="tel:'), -1);
  assert.ok(html.indexOf("chiamare in negozio") !== -1);
});

test("nessun phone_display mostra il testo di fallback dimostrativo", function () {
  var html = render.renderPage(baseCtx());
  assert.ok(html.indexOf("Telefono disponibile nella versione reale") !== -1);
});

// ---------- sicurezza: escaping e URL non sicuri, come in beauty-wellness-v1 ----------

test("il nome business con HTML injection viene sempre restituito escapato", function () {
  var ctx = baseCtx();
  ctx.data.business.name = '<script>alert(1)</script>Impianti';
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("<script>alert(1)</script>"), -1);
  assert.ok(html.indexOf("&lt;script&gt;alert(1)&lt;/script&gt;") !== -1);
});

test("la descrizione di un servizio con HTML injection viene escapata", function () {
  var ctx = baseCtx();
  ctx.data.services = [{ name: "Servizio", description: '"><img src=x onerror=alert(1)>', icon: "icon-bolt" }];
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("<img src=x onerror=alert(1)>"), -1);
});

test("link social con javascript: viene rifiutato e omesso dal footer", function () {
  var ctx = baseCtx();
  ctx.data.business.social = { instagram: "javascript:alert(1)", facebook: "https://facebook.com/pagina-valida" };
  var html = render.renderPage(ctx);
  assert.equal(html.indexOf("javascript:"), -1);
  assert.ok(html.indexOf("https://facebook.com/pagina-valida") !== -1);
});

// ---------- disclaimer del footer: gating per modalità (identico a beauty-wellness-v1) ----------

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

// ---------- head/hero: contratti generici ----------

test("renderHead usa il theme-color proprio di trades-v1, distinto da quello di beauty-wellness-v1", function () {
  var html = render.renderPage(baseCtx());
  assert.ok(html.indexOf('<meta name="theme-color" content="#1d4863">') !== -1);
  assert.equal(html.indexOf('content="#C1653A"'), -1);
});

test("l'hero usa Richiedi un preventivo come CTA primaria verso #contatti, senza claim di urgenza/24-7", function () {
  var html = render.renderPage(baseCtx());
  assert.ok(html.indexOf('<a class="btn btn--primary" href="#contatti">Richiedi un preventivo</a>') !== -1);
  ["24/7", "24 ore", "urgente", "emergenza", "immediato"].forEach(function (claim) {
    assert.equal(html.toLowerCase().indexOf(claim.toLowerCase()), -1, "unexpected urgency claim: " + claim);
  });
});
