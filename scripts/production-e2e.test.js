"use strict";

/**
 * ATTENZIONE — dati interamente sintetici, solo per test automatici.
 *
 * Ogni valore in questo file (nomi, indirizzi, recensioni, URL) è inventato
 * esclusivamente per esercitare la pipeline reale validate -> build in
 * modalità PRODUCTION (scripts/validate.js, scripts/build.js). Non
 * rappresenta nessuna attività reale, non va mai copiato in businesses/,
 * non va mai trattato come riferimento per un vero cliente.
 * canonical_url usa intenzionalmente example.com (RFC 2606, dominio
 * riservato per documentazione/test), mai un dominio realmente registrato.
 *
 * Ogni slug usato qui è prefissato "smoke-prod-e2e-": build.js scrive
 * sempre in dist/<slug> al repo root, condiviso tra tutti i file di test —
 * non riutilizzare questo prefisso altrove (vedi CLAUDE.md).
 */

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var os = require("os");
var yaml = require("js-yaml");

var buildMod = require("./build.js");
var validateMod = require("./validate.js");

var ROOT = path.resolve(__dirname, "..");

function baseProductionFixture(slug) {
  return {
    category: "beauty-wellness",
    template_id: "beauty-wellness-v1",
    preset_id: "default",
    lead_id: "LEAD-" + slug.toUpperCase(),
    priority: "medium",
    source_file: null,
    source_row: null,
    mode: "PRODUCTION",
    business: {
      name: "Atelier Prova E2E (esempio fittizio)",
      slug: slug,
      logo: null,
      tagline: "Test automatico end-to-end (esempio fittizio)",
      intro: "Testo introduttivo sintetico usato solo per test automatici.",
      address: { line: "Via Di Prova 1, 00000 Città Fittizia (esempio fittizio)" },
      hours: null,
      phone_display: null,
      eyebrow: null,
      trust_stats: [{ value: "10+", label: "anni di attività (dato di esempio)" }],
      whatsapp: { number: null, default_message: null },
      social: { instagram: null, facebook: null },
      content_origin: "client_provided",
      source_url: null,
      source_channel: null,
      captured_at: null,
      private_demo_status: "not_applicable",
      publication_status: "approved_for_publication",
      internal_notes: "INTERNAL-NOTE-MARKER-BUSINESS-9f31",
      canonical_url: "https://example.com/" + slug
    },
    services: [
      { name: "Servizio di prova (esempio fittizio)", description: null, price_from: null, price_note: null, icon: null }
    ],
    strengths: [],
    atmosfera: [],
    photos: [],
    reviews: [
      {
        text: "Recensione sintetica di prova (esempio fittizio).",
        author: "Recensore Prova",
        rating: 5,
        platform: null,
        content_origin: "client_provided",
        source_url: null,
        source_channel: null,
        captured_at: null,
        private_demo_status: "not_applicable",
        publication_status: "approved_for_publication",
        internal_notes: "INTERNAL-NOTE-MARKER-REVIEW-2b77"
      }
    ],
    faq: [],
    contact_form: { endpoint: null },
    disclaimers: { demo_banner: "Concept commerciale non ufficiale, preparato per il titolare." }
  };
}

function writeBusiness(slug, data) {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-prod-e2e-"));
  var businessDir = path.join(tmpRoot, slug);
  fs.mkdirSync(businessDir, { recursive: true });
  fs.writeFileSync(path.join(businessDir, "data.yaml"), yaml.dump(data, { lineWidth: 100 }), "utf8");
  return { tmpRoot: tmpRoot, businessDir: businessDir };
}

function cleanup(tmpRoot, slug) {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, "dist", slug), { recursive: true, force: true });
}

test("build PRODUCTION completo e approvato produce pagina indicizzabile: canonical + JSON-LD", function () {
  var slug = "smoke-prod-e2e-ok";
  var data = baseProductionFixture(slug);
  var w = writeBusiness(slug, data);
  try {
    var res = buildMod.buildBusiness(w.businessDir);
    var html = fs.readFileSync(path.join(ROOT, "dist", res.slug, "index.html"), "utf8");
    assert.equal(html.indexOf("noindex"), -1);
    assert.ok(html.indexOf('<link rel="canonical" href="https://example.com/' + slug + '">') !== -1);
    assert.ok(html.indexOf('<script type="application/ld+json">') !== -1);
    assert.ok(html.indexOf('"@type":"LocalBusiness"') !== -1);
    assert.ok(html.indexOf("Via Di Prova 1") !== -1);
  } finally {
    cleanup(w.tmpRoot, slug);
  }
});

test("build PRODUCTION completo non emette disclaimer demo, noindex o il commento TODO di sviluppo", function () {
  var slug = "smoke-prod-e2e-disclaimers";
  var data = baseProductionFixture(slug);
  var w = writeBusiness(slug, data);
  try {
    var res = buildMod.buildBusiness(w.businessDir);
    var html = fs.readFileSync(path.join(ROOT, "dist", res.slug, "index.html"), "utf8");
    assert.equal(html.indexOf("noindex"), -1);
    assert.equal(html.indexOf("Dati dimostrativi a scopo illustrativo"), -1);
    assert.equal(html.indexOf("Nomi, recensioni e valutazioni presenti"), -1);
    assert.equal(html.indexOf("Tutti i dati qui sotto sono dimostrativi"), -1);
    assert.equal(html.indexOf('class="footer-disclaimer"'), -1);
    assert.equal(html.indexOf("TODO produzione"), -1);
  } finally {
    cleanup(w.tmpRoot, slug);
  }
});

test("un tentativo di HTML injection nel nome del business viene sempre escapato nell'HTML reale generato da build.js", function () {
  var slug = "smoke-prod-e2e-injection";
  var data = baseProductionFixture(slug);
  data.business.name = "<script>alert(1)</script>Nome Prova (esempio fittizio)";
  var w = writeBusiness(slug, data);
  try {
    var res = buildMod.buildBusiness(w.businessDir);
    var html = fs.readFileSync(path.join(ROOT, "dist", res.slug, "index.html"), "utf8");
    assert.equal(html.indexOf("<script>alert(1)</script>"), -1);
    assert.ok(html.indexOf("&lt;script&gt;alert(1)&lt;/script&gt;") !== -1);
  } finally {
    cleanup(w.tmpRoot, slug);
  }
});

test("un link social con schema javascript: viene scartato e non compare mai come link nell'HTML reale", function () {
  var slug = "smoke-prod-e2e-social-xss";
  var data = baseProductionFixture(slug);
  data.business.social.instagram = "javascript:alert(document.cookie)";
  var w = writeBusiness(slug, data);
  try {
    var res = buildMod.buildBusiness(w.businessDir);
    var html = fs.readFileSync(path.join(ROOT, "dist", res.slug, "index.html"), "utf8");
    assert.equal(html.toLowerCase().indexOf("javascript:"), -1);
    assert.equal(html.indexOf(">Instagram<"), -1);
  } finally {
    cleanup(w.tmpRoot, slug);
  }
});

test("un canonical_url non-https non produce mai un tag canonical live e la pagina resta non indicizzabile", function () {
  var slug = "smoke-prod-e2e-bad-canonical";
  var data = baseProductionFixture(slug);
  data.business.canonical_url = "http://example.com/insecure";
  var w = writeBusiness(slug, data);
  try {
    var res = buildMod.buildBusiness(w.businessDir);
    var html = fs.readFileSync(path.join(ROOT, "dist", res.slug, "index.html"), "utf8");
    assert.ok(html.indexOf("noindex") !== -1);
    assert.equal(html.indexOf('rel="canonical"'), -1);
    assert.equal(html.indexOf("application/ld+json"), -1);
  } finally {
    cleanup(w.tmpRoot, slug);
  }
});

test("photo.local_file con path traversal viene rifiutato da validate e non raggiunge mai il build", function () {
  var slug = "smoke-prod-e2e-traversal";
  var data = baseProductionFixture(slug);
  data.photos = [
    {
      id: "hero",
      local_file: "../../../etc/passwd",
      alt_text: "Foto di prova",
      usage: "hero",
      contains_recognizable_people: false,
      contains_recognizable_minors: false,
      consent_confirmed: false,
      content_origin: "client_provided",
      publication_status: "approved_for_publication"
    }
  ];
  var w = writeBusiness(slug, data);
  try {
    var validation = validateMod.validateBusinessDir(w.businessDir);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some(function (e) { return e.indexOf("local_file non valido") !== -1; }));

    assert.throws(function () {
      buildMod.buildBusiness(w.businessDir);
    });

    assert.equal(fs.existsSync(path.join(ROOT, "dist", slug)), false);
  } finally {
    cleanup(w.tmpRoot, slug);
  }
});

test("i valori dei campi interni (lead_id, internal_notes) non compaiono mai nell'HTML pubblicato", function () {
  var slug = "smoke-prod-e2e-internal-fields";
  var data = baseProductionFixture(slug);
  var w = writeBusiness(slug, data);
  try {
    var res = buildMod.buildBusiness(w.businessDir);
    var html = fs.readFileSync(path.join(ROOT, "dist", res.slug, "index.html"), "utf8");
    assert.equal(html.indexOf(data.lead_id), -1);
    assert.equal(html.indexOf("INTERNAL-NOTE-MARKER-BUSINESS-9f31"), -1);
    assert.equal(html.indexOf("INTERNAL-NOTE-MARKER-REVIEW-2b77"), -1);
  } finally {
    cleanup(w.tmpRoot, slug);
  }
});

test("dati PRODUCTION incompleti (publication_status non approvato) falliscono la validazione e il build senza generare alcuna pagina", function () {
  var slug = "smoke-prod-e2e-incomplete";
  var data = baseProductionFixture(slug);
  data.business.publication_status = "pending";
  var w = writeBusiness(slug, data);
  try {
    var validation = validateMod.validateBusinessDir(w.businessDir);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some(function (e) { return e.indexOf("approved_for_publication") !== -1; }));

    assert.throws(function () {
      buildMod.buildBusiness(w.businessDir);
    });

    assert.equal(fs.existsSync(path.join(ROOT, "dist", slug)), false);
  } finally {
    cleanup(w.tmpRoot, slug);
  }
});
