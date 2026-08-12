"use strict";

var fs = require("fs");
var path = require("path");
var yaml = require("js-yaml");
var Ajv = require("ajv");

var schema = require("../schema/business.schema.json");
var registry = require("../templates/registry.json");
var pathsUtil = require("./security/paths.js");

var ajv = new Ajv({ allErrors: true, strict: false });
var validateSchema = ajv.compile(schema);

var SUSPICIOUS_KEY_PATTERNS = [
  /password/i,
  /api[_-]?key/i,
  /apikey/i,
  /secret/i,
  /\btoken\b/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /client[_-]?secret/i
];

var KNOWN_REAL_PLATFORM_NAMES = [
  "google", "google my business", "google maps", "facebook", "instagram",
  "tripadvisor", "yelp", "trustpilot", "foursquare"
];

var KNOWN_REAL_PLATFORM_HOSTS = [
  "google.com", "google.it", "goo.gl", "g.page",
  "facebook.com", "fb.com", "instagram.com",
  "tripadvisor.com", "tripadvisor.it", "yelp.com", "trustpilot.com", "foursquare.com"
];

function findSuspiciousKeys(obj, pathPrefix, found) {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach(function (item, i) {
      findSuspiciousKeys(item, pathPrefix + "[" + i + "]", found);
    });
    return;
  }
  Object.keys(obj).forEach(function (key) {
    var fullPath = pathPrefix ? pathPrefix + "." + key : key;
    if (SUSPICIOUS_KEY_PATTERNS.some(function (re) { return re.test(key); })) {
      found.push(fullPath);
    }
    findSuspiciousKeys(obj[key], fullPath, found);
  });
}

function hostnameOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch (err) {
    return null;
  }
}

function pointsToRealPlatform(rawUrl) {
  var host = hostnameOf(rawUrl);
  if (!host) return false;
  return KNOWN_REAL_PLATFORM_HOSTS.some(function (known) {
    return host === known || host.endsWith("." + known);
  });
}

function isKnownRealPlatformName(name) {
  if (!name) return false;
  var normalized = String(name).trim().toLowerCase();
  return KNOWN_REAL_PLATFORM_NAMES.indexOf(normalized) !== -1;
}

/** Regole per singolo blocco "provenienza" (business / foto / recensione), in base alla modalità. */
function checkProvenance(mode, label, item, errors) {
  var origin = item.content_origin;

  if (mode === "TEMPLATE_DEMO") {
    if (origin !== "fictional_demo") {
      errors.push(label + ": in modalità TEMPLATE_DEMO il content_origin deve essere fictional_demo (trovato: " + origin + ").");
    }
    if (item.publication_status && item.publication_status !== "not_applicable") {
      errors.push(label + ": in TEMPLATE_DEMO publication_status deve essere not_applicable.");
    }
    if (item.private_demo_status && item.private_demo_status !== "not_applicable") {
      errors.push(label + ": in TEMPLATE_DEMO private_demo_status deve essere not_applicable.");
    }
    if (item.source_url && pointsToRealPlatform(item.source_url)) {
      errors.push(label + ": content_origin=fictional_demo ma source_url punta a una piattaforma reale (" + item.source_url + ") — non ammesso.");
    }
    if (isKnownRealPlatformName(item.platform)) {
      errors.push(label + ": content_origin=fictional_demo ma platform indica una piattaforma reale (" + item.platform + ") — non ammesso.");
    }
  }

  if (mode === "PRIVATE_DEMO") {
    if (origin !== "verified_public" && origin !== "official_business_channel") {
      errors.push(
        label + ": in modalità PRIVATE_DEMO content_origin ammessi sono solo verified_public o official_business_channel " +
        "(client_provided non è ammesso automaticamente senza una regola esplicita non ancora definita; trovato: " + origin + ")."
      );
    }
    if (!item.source_url && !item.source_channel) {
      errors.push(label + ": in PRIVATE_DEMO è richiesto source_url oppure source_channel.");
    }
    if (item.private_demo_status !== "approved_for_private_demo") {
      errors.push(label + ": in PRIVATE_DEMO private_demo_status deve essere approved_for_private_demo.");
    }
    if (item.publication_status === "approved_for_publication") {
      errors.push(label + ": in PRIVATE_DEMO publication_status non può essere approved_for_publication (l'approvazione per la demo privata non equivale a consenso alla pubblicazione).");
    }
  }

  if (mode === "PRODUCTION") {
    if (origin === "fictional_demo") {
      errors.push(label + ": contenuto fictional_demo non ammesso in PRODUCTION.");
    }
  }
}

function collectProvenanceItems(data) {
  var items = [{ label: "business", item: data.business }];
  (data.photos || []).forEach(function (p, i) {
    items.push({ label: "photos[" + i + "] (" + p.id + ")", item: p });
  });
  (data.reviews || []).forEach(function (r, i) {
    items.push({ label: "reviews[" + i + "] (" + r.author + ")", item: r });
  });
  return items;
}

/**
 * Valida un business già parsato (oggetto JS). Ritorna:
 *  - valid: boolean
 *  - errors: string[] (bloccanti)
 *  - warnings: string[] (non bloccanti, es. singoli elementi esclusi)
 *  - filtered: { photos, reviews } — soltanto gli elementi realmente
 *    idonei alla pubblicazione nella modalità dichiarata; build.js deve
 *    usare SOLO questi, mai i valori grezzi in data.photos/data.reviews.
 *
 * Questo validatore controlla struttura, coerenza e presenza dei metadati
 * richiesti. NON verifica la veridicità dei contenuti, la titolarità
 * reale delle fotografie, la validità giuridica di un consenso o
 * l'autenticità di una recensione: sono responsabilità dell'operatore
 * umano (vedi CLAUDE.md).
 */
function validateBusiness(data, businessDir) {
  var errors = [];
  var warnings = [];

  var suspiciousKeys = [];
  if (data && typeof data === "object") {
    findSuspiciousKeys(data, "", suspiciousKeys);
  }
  if (suspiciousKeys.length) {
    errors.push("Chiavi che sembrano contenere credenziali (non ammesse nei dati di business): " + suspiciousKeys.join(", "));
  }

  var schemaOk = validateSchema(data);
  if (!schemaOk) {
    (validateSchema.errors || []).forEach(function (e) {
      errors.push("Schema: " + (e.instancePath || "(root)") + " " + e.message);
    });
    return { valid: false, errors: errors, warnings: warnings, filtered: null };
  }

  if (!pathsUtil.isValidId(data.template_id) || !Object.prototype.hasOwnProperty.call(registry, data.template_id)) {
    errors.push("template_id non registrato: " + data.template_id);
  } else {
    var entry = registry[data.template_id];
    if (!pathsUtil.isValidId(data.preset_id) || entry.presets.indexOf(data.preset_id) === -1) {
      errors.push("preset_id non registrato per " + data.template_id + ": " + data.preset_id);
    }
  }

  var mode = data.mode;
  collectProvenanceItems(data).forEach(function (entryItem) {
    checkProvenance(mode, entryItem.label, entryItem.item, errors);
  });

  // Persone riconoscibili / minori nelle foto
  var eligiblePhotos = [];
  (data.photos || []).forEach(function (photo, i) {
    var label = "photos[" + i + "] (" + photo.id + ")";
    var excluded = false;

    if (photo.contains_recognizable_minors) {
      if (mode === "TEMPLATE_DEMO" || mode === "PRIVATE_DEMO") {
        errors.push(label + ": contiene minori riconoscibili, non ammesso in " + mode + ".");
        excluded = true;
      } else if (mode === "PRODUCTION") {
        errors.push(label + ": contiene minori riconoscibili — nessuna regola di pubblicazione definita per questo caso in questa implementazione, non pubblicabile.");
        excluded = true;
      }
    }

    if (!excluded && photo.contains_recognizable_people && !photo.consent_confirmed) {
      if (mode === "PRIVATE_DEMO") {
        warnings.push(label + ": persone riconoscibili senza consent_confirmed — esclusa dal build (fallback al placeholder).");
        excluded = true;
      } else if (mode === "PRODUCTION") {
        warnings.push(label + ": persone riconoscibili senza consent_confirmed — esclusa dal build in PRODUCTION (fallback al placeholder).");
        excluded = true;
      }
    }

    if (!excluded && mode === "PRODUCTION" && photo.publication_status !== "approved_for_publication") {
      warnings.push(label + ": publication_status non approvato in PRODUCTION — esclusa dal build.");
      excluded = true;
    }

    if (!excluded) {
      var resolved = businessDir ? pathsUtil.resolveDossierAsset(businessDir, photo.local_file) : "skip";
      if (!resolved) {
        errors.push(label + ": local_file non valido o esterno alla cartella dossier consentita (" + photo.local_file + ").");
        excluded = true;
      }
    }

    if (!excluded) eligiblePhotos.push(photo);
  });

  // Recensioni: idoneità alla pubblicazione
  var eligibleReviews = [];
  (data.reviews || []).forEach(function (review, i) {
    var label = "reviews[" + i + "] (" + review.author + ")";
    var excluded = false;

    if (mode === "PRODUCTION" && review.publication_status !== "approved_for_publication") {
      warnings.push(label + ": publication_status non approvato in PRODUCTION — esclusa dal build.");
      excluded = true;
    }

    if (!excluded) eligibleReviews.push(review);
  });

  // Identità principale del business: in PRODUCTION deve essere approvata (bloccante, non solo esclusione parziale)
  if (mode === "PRODUCTION" && data.business.publication_status !== "approved_for_publication") {
    errors.push("business: in PRODUCTION publication_status deve essere approved_for_publication (dati aziendali principali non approvati).");
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: warnings,
    filtered: { photos: eligiblePhotos, reviews: eligibleReviews }
  };
}

function loadBusinessData(businessDir) {
  var dataPath = path.join(businessDir, "data.yaml");
  var raw = fs.readFileSync(dataPath, "utf8");
  return yaml.load(raw);
}

function validateBusinessDir(businessDir) {
  var data = loadBusinessData(businessDir);
  return validateBusiness(data, businessDir);
}

module.exports = { validateBusiness, validateBusinessDir, loadBusinessData, findSuspiciousKeys, pointsToRealPlatform, isKnownRealPlatformName };

if (require.main === module) {
  var target = process.argv[2];
  if (!target) {
    console.error("Uso: node scripts/validate.js businesses/<slug>");
    process.exit(2);
  }
  var businessDir = path.resolve(process.cwd(), target);
  var result;
  try {
    result = validateBusinessDir(businessDir);
  } catch (err) {
    console.error("Errore durante la validazione:", err.message);
    process.exit(2);
  }

  if (result.warnings.length) {
    console.log("Avvisi (non bloccanti):");
    result.warnings.forEach(function (w) { console.log("  - " + w); });
  }
  if (!result.valid) {
    console.error("VALIDAZIONE FALLITA:");
    result.errors.forEach(function (e) { console.error("  - " + e); });
    process.exit(1);
  }
  console.log("Validazione superata: " + target);
  console.log(
    "Foto idonee: " + result.filtered.photos.length + " — Recensioni idonee: " + result.filtered.reviews.length
  );
}
