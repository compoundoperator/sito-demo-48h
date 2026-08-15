"use strict";

/**
 * ATTENZIONE — dati interamente sintetici, solo per test automatici.
 *
 * Le 13 "attività" costruite in questo file esistono solo per esercitare
 * scripts/build.js (buildBusinesses/findDuplicateSlugs) su un batch di più
 * attività contemporaneamente: isolamento reciproco dell'output,
 * rilevamento di slug duplicati, isolamento dei fallimenti per-attività.
 * Nessuna rappresenta un'attività reale; non vanno mai copiate in
 * businesses/.
 *
 * Ogni slug usato qui è prefissato "smoke-batch-": build.js scrive sempre
 * in dist/<slug> al repo root, condiviso tra tutti i file di test — non
 * riutilizzare questo prefisso altrove (vedi CLAUDE.md).
 */

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var os = require("os");
var yaml = require("js-yaml");

var buildMod = require("./build.js");

var ROOT = path.resolve(__dirname, "..");

// WebP 2x2 valido e minimale (generato una volta con sharp), incorporato
// come byte letterali: il test non dipende da sharp a runtime.
var WEBP_BASE64 = "UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAEyAAA/q4X/zYEDND6YP/SbPE2eJs+OYAA";

function baseTemplateDemo(slug) {
  return {
    category: "beauty-wellness",
    template_id: "beauty-wellness-v1",
    preset_id: "default",
    lead_id: "LEAD-" + String(slug).toUpperCase().replace(/[^A-Z0-9]/g, "-"),
    priority: "medium",
    source_file: null,
    source_row: null,
    mode: "TEMPLATE_DEMO",
    business: {
      name: "Attività di prova (" + slug + ")",
      slug: slug,
      logo: null,
      tagline: "MARKER-" + slug,
      intro: null,
      address: null,
      hours: null,
      phone_display: null,
      eyebrow: null,
      trust_stats: null,
      whatsapp: { number: null, default_message: "Ciao!" },
      social: { instagram: null, facebook: null },
      content_origin: "fictional_demo",
      source_url: null,
      source_channel: null,
      captured_at: null,
      private_demo_status: "not_applicable",
      publication_status: "not_applicable",
      internal_notes: null,
      canonical_url: null
    },
    services: [{ name: "Servizio di prova", description: null, price_from: 10, price_note: null, icon: null }],
    strengths: [],
    atmosfera: [],
    photos: [],
    reviews: [],
    faq: [],
    contact_form: { endpoint: null },
    disclaimers: { demo_banner: null }
  };
}

function basePrivateDemo(slug) {
  var data = baseTemplateDemo(slug);
  data.mode = "PRIVATE_DEMO";
  data.business.content_origin = "official_business_channel";
  data.business.source_channel = "pagina Instagram ufficiale (dato di test)";
  data.business.private_demo_status = "approved_for_private_demo";
  data.business.publication_status = "pending";
  return data;
}

function baseProductionVariant(slug) {
  var data = baseTemplateDemo(slug);
  data.mode = "PRODUCTION";
  data.business.content_origin = "client_provided";
  data.business.publication_status = "approved_for_publication";
  data.business.private_demo_status = "not_applicable";
  data.business.address = { line: "Via Di Prova 2, 00000 Città Fittizia (esempio fittizio)" };
  data.business.canonical_url = "https://example.com/" + slug;
  return data;
}

function fullDemoVariant(slug) {
  var data = baseTemplateDemo(slug);
  data.business.intro = "Introduzione di prova per " + slug + ".";
  data.business.address = { line: "Via Prova Piena 1 (esempio fittizio)" };
  data.business.trust_stats = [{ value: "5+", label: "anni (dato di esempio)" }];
  data.services = [
    { name: "Servizio A", description: "Descrizione A", price_from: 20, price_note: null, icon: null },
    { name: "Servizio B", description: "Descrizione B", price_from: 30, price_note: null, icon: null }
  ];
  data.strengths = [
    { title: "Punto di forza 1", description: "Dettaglio 1" },
    { title: "Punto di forza 2", description: null }
  ];
  data.atmosfera = [{ title: "Ambiente 1", description: null }];
  data.reviews = [
    {
      text: "Recensione completa di prova.",
      author: "Autore Prova",
      rating: 5,
      platform: null,
      content_origin: "fictional_demo",
      source_url: null,
      source_channel: null,
      captured_at: null,
      private_demo_status: "not_applicable",
      publication_status: "not_applicable",
      internal_notes: null
    }
  ];
  data.faq = [{ question: "Domanda di prova?", answer: "Risposta di prova." }];
  data.disclaimers = { demo_banner: "Concept dimostrativo di prova." };
  return data;
}

function manyItemsVariant(slug) {
  var data = baseTemplateDemo(slug);
  data.services = [];
  for (var i = 1; i <= 8; i++) {
    data.services.push({ name: "Servizio " + i + " (" + slug + ")", description: null, price_from: i * 5, price_note: null, icon: null });
  }
  data.reviews = [];
  for (var r = 1; r <= 6; r++) {
    data.reviews.push({
      text: "Recensione sintetica " + r + " (" + slug + ").",
      author: "Autore " + r,
      rating: 5,
      platform: null,
      content_origin: "fictional_demo",
      source_url: null,
      source_channel: null,
      captured_at: null,
      private_demo_status: "not_applicable",
      publication_status: "not_applicable",
      internal_notes: null
    });
  }
  data.faq = [];
  for (var f = 1; f <= 6; f++) {
    data.faq.push({ question: "Domanda " + f + "?", answer: "Risposta " + f + "." });
  }
  return data;
}

function htmlSpecialCharsVariant(slug) {
  var data = baseTemplateDemo(slug);
  data.business.name = "Bar & Salone <Prova> \"Virgolette\" 'Apici' (" + slug + ")";
  return data;
}

function accentedVariant(slug) {
  var data = baseTemplateDemo(slug);
  data.business.name = "Caffè è Città Perché Più Così à ì ò ù ç (" + slug + ")";
  return data;
}

function withPhotoVariant(slug) {
  var data = baseTemplateDemo(slug);
  data.photos = [
    {
      id: "hero",
      local_file: "photos/hero.jpg",
      alt_text: "Foto di prova (" + slug + ")",
      usage: "hero",
      contains_recognizable_people: false,
      contains_recognizable_minors: false,
      consent_confirmed: false,
      content_origin: "fictional_demo",
      source_url: null,
      source_channel: null,
      captured_at: null,
      private_demo_status: "not_applicable",
      publication_status: "not_applicable",
      internal_notes: null
    }
  ];
  return data;
}

function writeBusinessDir(root, dirName, data) {
  var businessDir = path.join(root, dirName);
  fs.mkdirSync(businessDir, { recursive: true });
  fs.writeFileSync(path.join(businessDir, "data.yaml"), yaml.dump(data, { lineWidth: 100 }), "utf8");
  return businessDir;
}

function rmDist(slug) {
  fs.rmSync(path.join(ROOT, "dist", slug), { recursive: true, force: true });
}

test("buildBusinesses rileva slug duplicati tra cartelle diverse e blocca l'intero batch prima di costruire qualunque output", function () {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-batch-dup-"));
  var dupSlug = "smoke-batch-duplicate-target";
  var dirA = writeBusinessDir(root, "dup-a", baseTemplateDemo(dupSlug));
  var dirB = writeBusinessDir(root, "dup-b", baseTemplateDemo(dupSlug));

  try {
    var found = buildMod.findDuplicateSlugs([dirA, dirB]);
    assert.equal(found.length, 1);
    assert.equal(found[0].slug, dupSlug);
    assert.deepEqual(found[0].dirs.slice().sort(), [dirA, dirB].sort());

    assert.throws(
      function () { buildMod.buildBusinesses([dirA, dirB]); },
      function (err) {
        return Array.isArray(err.duplicateSlugs) && err.duplicateSlugs.length === 1 && err.duplicateSlugs[0].slug === dupSlug;
      }
    );

    assert.equal(fs.existsSync(path.join(ROOT, "dist", dupSlug)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    rmDist(dupSlug);
  }
});

test("batch di attività sintetiche valide: isolamento reciproco degli output e fallimento per-attività isolato per quelle non valide", function () {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-batch-main-"));

  var invalidTemplateData = baseTemplateDemo("smoke-batch-invalid-template");
  invalidTemplateData.template_id = "does-not-exist-v9";

  var variants = [
    { dirName: "full-demo", slug: "smoke-batch-full-demo", data: fullDemoVariant("smoke-batch-full-demo"), valid: true },
    { dirName: "minimal", slug: "smoke-batch-minimal", data: baseTemplateDemo("smoke-batch-minimal"), valid: true },
    { dirName: "private-demo", slug: "smoke-batch-private-demo", data: basePrivateDemo("smoke-batch-private-demo"), valid: true },
    { dirName: "production", slug: "smoke-batch-production", data: baseProductionVariant("smoke-batch-production"), valid: true },
    { dirName: "html-special-chars", slug: "smoke-batch-html-special-chars", data: htmlSpecialCharsVariant("smoke-batch-html-special-chars"), valid: true },
    { dirName: "accented", slug: "smoke-batch-accented", data: accentedVariant("smoke-batch-accented"), valid: true },
    { dirName: "no-photos", slug: "smoke-batch-no-photos", data: baseTemplateDemo("smoke-batch-no-photos"), valid: true },
    { dirName: "with-photo", slug: "smoke-batch-with-photo", data: withPhotoVariant("smoke-batch-with-photo"), valid: true, seedPhoto: true },
    { dirName: "many-items", slug: "smoke-batch-many-items", data: manyItemsVariant("smoke-batch-many-items"), valid: true },
    { dirName: "invalid-template", slug: "smoke-batch-invalid-template", data: invalidTemplateData, valid: false },
    { dirName: "invalid-slug", slug: "Smoke Invalid Slug", data: baseTemplateDemo("Smoke Invalid Slug"), valid: false }
  ];

  var dirs = [];
  var slugsToClean = variants.map(function (v) { return v.slug; });

  try {
    variants.forEach(function (v) {
      var businessDir = writeBusinessDir(root, v.dirName, v.data);
      if (v.seedPhoto) {
        var photosDir = path.join(businessDir, "dist-ready", "photos");
        fs.mkdirSync(photosDir, { recursive: true });
        fs.writeFileSync(path.join(photosDir, "hero.webp"), Buffer.from(WEBP_BASE64, "base64"));
      }
      dirs.push(businessDir);
    });

    var batch = buildMod.buildBusinesses(dirs);

    var expectedValid = variants.filter(function (v) { return v.valid; });
    var expectedInvalid = variants.filter(function (v) { return !v.valid; });
    assert.equal(batch.results.length, expectedValid.length);
    assert.equal(batch.failures.length, expectedInvalid.length);

    var htmlBySlug = {};
    batch.results.forEach(function (r) {
      htmlBySlug[r.slug] = fs.readFileSync(path.join(ROOT, "dist", r.slug, "index.html"), "utf8");
    });

    expectedValid.forEach(function (v) {
      var ownHtml = htmlBySlug[v.slug];
      assert.ok(ownHtml && ownHtml.indexOf("MARKER-" + v.slug) !== -1, "marker proprio assente per " + v.slug);
      expectedValid
        .filter(function (other) { return other.slug !== v.slug; })
        .forEach(function (other) {
          assert.equal(ownHtml.indexOf("MARKER-" + other.slug), -1, v.slug + " contiene il marker di " + other.slug);
        });
    });

    // isolamento asset: la foto seminata compare solo sotto la propria attività
    assert.ok(fs.existsSync(path.join(ROOT, "dist", "smoke-batch-with-photo", "assets", "photos", "hero.webp")));
    expectedValid
      .filter(function (v) { return v.slug !== "smoke-batch-with-photo"; })
      .forEach(function (v) {
        assert.equal(fs.existsSync(path.join(ROOT, "dist", v.slug, "assets", "photos", "hero.webp")), false);
      });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    slugsToClean.forEach(rmDist);
  }
});

test("il build della stessa attività è deterministico su esecuzioni ripetute (stesso HTML byte per byte)", function () {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-batch-determinism-"));
  var slug = "smoke-batch-determinism";
  var businessDir = writeBusinessDir(root, "determinism", fullDemoVariant(slug));

  try {
    var res1 = buildMod.buildBusiness(businessDir);
    var html1 = fs.readFileSync(path.join(ROOT, "dist", res1.slug, "index.html"), "utf8");
    var res2 = buildMod.buildBusiness(businessDir);
    var html2 = fs.readFileSync(path.join(ROOT, "dist", res2.slug, "index.html"), "utf8");
    assert.equal(html1, html2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    rmDist(slug);
  }
});
