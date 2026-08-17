"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");

var validateMod = require("./validate.js");
var validateBusiness = validateMod.validateBusiness;
var findSuspiciousKeys = validateMod.findSuspiciousKeys;

function baseBusiness() {
  return {
    category: "beauty-wellness",
    template_id: "beauty-wellness-v1",
    preset_id: "default",
    lead_id: "TEST-001",
    priority: "high",
    source_file: null,
    source_row: null,
    mode: "TEMPLATE_DEMO",
    business: {
      name: "Attività di prova",
      slug: "attivita-di-prova",
      content_origin: "fictional_demo",
      private_demo_status: "not_applicable",
      publication_status: "not_applicable"
    },
    services: [],
    strengths: [],
    atmosfera: [],
    photos: [],
    reviews: [],
    faq: [],
    contact_form: { endpoint: null },
    disclaimers: { demo_banner: "Concept dimostrativo." }
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------- casi validi ----------

test("business TEMPLATE_DEMO minimo e coerente è valido", function () {
  var result = validateBusiness(baseBusiness(), null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("business PRIVATE_DEMO coerente è valido", function () {
  var data = clone(baseBusiness());
  data.mode = "PRIVATE_DEMO";
  data.business.content_origin = "official_business_channel";
  data.business.source_channel = "pagina Instagram ufficiale";
  data.business.private_demo_status = "approved_for_private_demo";
  data.business.publication_status = "pending";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("business PRODUCTION coerente e approvato è valido", function () {
  var data = clone(baseBusiness());
  data.mode = "PRODUCTION";
  data.business.content_origin = "client_provided";
  data.business.publication_status = "approved_for_publication";
  data.business.private_demo_status = "not_applicable";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

// ---------- null / undefined / vuoto ----------

test("validateBusiness(null) non lancia eccezioni e ritorna non valido", function () {
  var result = validateBusiness(null, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("validateBusiness(undefined) non lancia eccezioni e ritorna non valido", function () {
  var result = validateBusiness(undefined, null);
  assert.equal(result.valid, false);
});

test("oggetto vuoto è rifiutato con errori di schema chiari", function () {
  var result = validateBusiness({}, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("Schema") === 0; }));
});

// ---------- TEMPLATE_DEMO: nessuna fonte reale simulata ----------

test("TEMPLATE_DEMO rifiuta content_origin diverso da fictional_demo", function () {
  var data = clone(baseBusiness());
  data.business.content_origin = "verified_public";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("fictional_demo") !== -1; }));
});

test("TEMPLATE_DEMO rifiuta una recensione con platform reale (Google)", function () {
  var data = clone(baseBusiness());
  data.reviews = [{
    text: "Ottimo servizio", author: "Nome Fittizio", rating: 5, platform: "Google",
    content_origin: "fictional_demo", private_demo_status: "not_applicable", publication_status: "not_applicable"
  }];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("piattaforma reale") !== -1; }));
});

test("TEMPLATE_DEMO rifiuta una recensione con source_url verso un dominio reale", function () {
  var data = clone(baseBusiness());
  data.reviews = [{
    text: "Ottimo servizio", author: "Nome Fittizio", rating: 5, platform: null,
    content_origin: "fictional_demo", source_url: "https://www.google.com/maps/reviews/xyz",
    private_demo_status: "not_applicable", publication_status: "not_applicable"
  }];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("piattaforma reale") !== -1; }));
});

test("TEMPLATE_DEMO accetta una recensione dichiaratamente di fantasia senza fonte reale", function () {
  var data = clone(baseBusiness());
  data.reviews = [{
    text: "Ottimo servizio", author: "Nome Fittizio", rating: 5, platform: null,
    content_origin: "fictional_demo", source_url: null,
    private_demo_status: "not_applicable", publication_status: "not_applicable"
  }];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

// ---------- PRIVATE_DEMO ----------

test("PRIVATE_DEMO rifiuta fictional_demo", function () {
  var data = clone(baseBusiness());
  data.mode = "PRIVATE_DEMO";
  // business.content_origin resta fictional_demo dalla base
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("PRIVATE_DEMO") !== -1; }));
});

test("PRIVATE_DEMO richiede source_url o source_channel", function () {
  var data = clone(baseBusiness());
  data.mode = "PRIVATE_DEMO";
  data.business.content_origin = "verified_public";
  data.business.private_demo_status = "approved_for_private_demo";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("source_url oppure source_channel") !== -1; }));
});

test("PRIVATE_DEMO rifiuta publication_status=approved_for_publication", function () {
  var data = clone(baseBusiness());
  data.mode = "PRIVATE_DEMO";
  data.business.content_origin = "verified_public";
  data.business.source_url = "https://esempio-attivita-reale.it/";
  data.business.private_demo_status = "approved_for_private_demo";
  data.business.publication_status = "approved_for_publication";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("non può essere approved_for_publication") !== -1; }));
});

test("PRIVATE_DEMO rifiuta client_provided senza regola esplicita", function () {
  var data = clone(baseBusiness());
  data.mode = "PRIVATE_DEMO";
  data.business.content_origin = "client_provided";
  data.business.source_channel = "email del cliente";
  data.business.private_demo_status = "approved_for_private_demo";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
});

// ---------- PRODUCTION ----------

test("PRODUCTION rifiuta fictional_demo", function () {
  var data = clone(baseBusiness());
  data.mode = "PRODUCTION";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("PRODUCTION") !== -1; }));
});

test("PRODUCTION richiede business.publication_status approvato (bloccante)", function () {
  var data = clone(baseBusiness());
  data.mode = "PRODUCTION";
  data.business.content_origin = "client_provided";
  data.business.publication_status = "pending";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("approved_for_publication") !== -1; }));
});

test("PRODUCTION esclude (non blocca) una singola recensione non approvata", function () {
  var data = clone(baseBusiness());
  data.mode = "PRODUCTION";
  data.business.content_origin = "client_provided";
  data.business.publication_status = "approved_for_publication";
  data.reviews = [
    { text: "A", author: "Cliente A", rating: 5, content_origin: "client_provided", publication_status: "approved_for_publication" },
    { text: "B", author: "Cliente B", rating: 4, content_origin: "client_provided", publication_status: "pending" }
  ];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.filtered.reviews.length, 1);
  assert.equal(result.filtered.reviews[0].author, "Cliente A");
  assert.ok(result.warnings.some(function (w) { return w.indexOf("Cliente B") !== -1; }));
});

// ---------- persone riconoscibili e minori ----------

test("foto con minori riconoscibili è esclusa in TEMPLATE_DEMO", function () {
  var data = clone(baseBusiness());
  data.photos = [{
    id: "foto-1", local_file: "photos/foto1.jpg", alt_text: "test",
    contains_recognizable_people: true, contains_recognizable_minors: true, consent_confirmed: true,
    content_origin: "fictional_demo", private_demo_status: "not_applicable", publication_status: "not_applicable"
  }];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
});

test("foto con persone riconoscibili senza consenso è esclusa (warning) in PRODUCTION, non blocca il build", function () {
  var data = clone(baseBusiness());
  data.mode = "PRODUCTION";
  data.business.content_origin = "client_provided";
  data.business.publication_status = "approved_for_publication";
  data.photos = [{
    id: "foto-1", local_file: "photos/foto1.jpg", alt_text: "test",
    contains_recognizable_people: true, contains_recognizable_minors: false, consent_confirmed: false,
    content_origin: "client_provided", publication_status: "approved_for_publication"
  }];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.filtered.photos.length, 0);
  assert.ok(result.warnings.length > 0);
});

test("foto con persone riconoscibili e consenso confermato è idonea in PRODUCTION", function () {
  var data = clone(baseBusiness());
  data.mode = "PRODUCTION";
  data.business.content_origin = "client_provided";
  data.business.publication_status = "approved_for_publication";
  data.photos = [{
    id: "foto-1", local_file: "photos/foto1.jpg", alt_text: "test",
    contains_recognizable_people: true, contains_recognizable_minors: false, consent_confirmed: true,
    content_origin: "client_provided", publication_status: "approved_for_publication"
  }];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.filtered.photos.length, 1);
});

// ---------- business.service_areas ----------

test("service_areas con valori validi è accettato", function () {
  var data = clone(baseBusiness());
  data.business.service_areas = ["Zona Roma Est", "Zona Roma Centro"];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("service_areas assente è accettato", function () {
  var data = clone(baseBusiness());
  var result = validateBusiness(data, null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("service_areas null è accettato", function () {
  var data = clone(baseBusiness());
  data.business.service_areas = null;
  var result = validateBusiness(data, null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("service_areas vuoto ([]) è accettato", function () {
  var data = clone(baseBusiness());
  data.business.service_areas = [];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("service_areas con 21 elementi è rifiutato (maxItems: 20)", function () {
  var data = clone(baseBusiness());
  data.business.service_areas = [];
  for (var i = 0; i < 21; i++) data.business.service_areas.push("Zona " + i);
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
});

test("service_areas con voci duplicate è rifiutato (uniqueItems)", function () {
  var data = clone(baseBusiness());
  data.business.service_areas = ["Zona Roma Est", "Zona Roma Est"];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
});

test("service_areas con voce solo spazi è rifiutato (pattern: \\S)", function () {
  var data = clone(baseBusiness());
  data.business.service_areas = ["   "];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
});

test("service_areas con voce di 1 carattere è rifiutato (minLength: 2)", function () {
  var data = clone(baseBusiness());
  data.business.service_areas = ["x"];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
});

test("service_areas con voce di 121 caratteri è rifiutato (maxLength: 120)", function () {
  var data = clone(baseBusiness());
  data.business.service_areas = ["x".repeat(121)];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
});

test("service_areas con voce non stringa è rifiutato", function () {
  var data = clone(baseBusiness());
  data.business.service_areas = [42];
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
});

// ---------- registry ----------

test("template_id non registrato viene rifiutato", function () {
  var data = clone(baseBusiness());
  data.template_id = "template-inesistente-v9";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("template_id non registrato") !== -1; }));
});

test("preset_id non registrato viene rifiutato", function () {
  var data = clone(baseBusiness());
  data.preset_id = "preset-inesistente";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("preset_id non registrato") !== -1; }));
});

test("template_id con tentativo di path traversal è rifiutato dallo schema prima ancora del registry", function () {
  var data = clone(baseBusiness());
  data.template_id = "../../etc/passwd";
  var result = validateBusiness(data, null);
  assert.equal(result.valid, false);
});

// ---------- chiavi sospette (credenziali) ----------

test("findSuspiciousKeys individua chiavi che sembrano credenziali, annidate a qualunque livello", function () {
  var found = [];
  findSuspiciousKeys({ business: { api_key: "x", nested: { password: "y" } }, token: "z" }, "", found);
  assert.ok(found.indexOf("business.api_key") !== -1);
  assert.ok(found.indexOf("business.nested.password") !== -1);
  assert.ok(found.indexOf("token") !== -1);
});

test("findSuspiciousKeys non genera falsi positivi su normale testo commerciale", function () {
  var found = [];
  findSuspiciousKeys({
    business: { intro: "Il segreto di una pelle luminosa è la costanza. Prenota il tuo trattamento." }
  }, "", found);
  assert.equal(found.length, 0);
});
