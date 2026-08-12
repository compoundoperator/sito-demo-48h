"use strict";

/**
 * scripts/optimize-images.js
 *
 * Ottimizza per il web le sole fotografie realmente idonee (già filtrate
 * da scripts/validate.js secondo le regole di provenienza/consenso per la
 * modalità dichiarata): ridimensiona, converte in WebP, rimuove i
 * metadati EXIF. Gli originali in dossier/ restano intatti; l'output
 * ottimizzato va in businesses/<slug>/dist-ready/photos/, da cui
 * scripts/build.js lo copia in dist/<slug>/assets/photos/.
 *
 * Non copia MAI un originale non ottimizzato nell'output pubblico: se
 * `sharp` non è disponibile, la foto viene semplicemente omessa (fallback
 * al placeholder grafico) in TEMPLATE_DEMO/PRIVATE_DEMO, con un warning
 * esplicito; in PRODUCTION il comando fallisce con errore chiaro.
 *
 * Uso: node scripts/optimize-images.js businesses/<slug>
 */

var fs = require("fs");
var path = require("path");

var validateMod = require("./validate.js");
var pathsUtil = require("./security/paths.js");

var MAX_WIDTH_BY_USAGE = { hero: 1600 };
var DEFAULT_MAX_WIDTH = 800;

function loadSharp() {
  try {
    return require("sharp");
  } catch (err) {
    return null;
  }
}

async function optimizeOne(sharpLib, srcPath, destPath, usage) {
  var maxWidth = MAX_WIDTH_BY_USAGE[usage] || DEFAULT_MAX_WIDTH;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await sharpLib(srcPath)
    .rotate() // applica l'orientamento EXIF prima di rimuoverlo
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(destPath); // sharp non incorpora i metadati EXIF originali a meno di withMetadata(): rimossi di default
}

async function optimizeBusiness(businessDir) {
  var result = validateMod.validateBusinessDir(businessDir);
  if (!result.valid) {
    throw new Error("Validazione fallita, impossibile procedere con l'ottimizzazione:\n  - " + result.errors.join("\n  - "));
  }
  var data = validateMod.loadBusinessData(businessDir);
  var eligiblePhotos = result.filtered.photos;
  var sharpLib = loadSharp();

  var report = { processed: [], skipped: [], errors: [] };

  if (!eligiblePhotos.length) {
    return report;
  }

  if (!sharpLib) {
    var msg = "sharp non è disponibile in questo ambiente: nessuna foto verrà ottimizzata o copiata nell'output.";
    if (data.mode === "PRODUCTION") {
      throw new Error(msg + " In PRODUCTION questo è un errore bloccante (mai pubblicare originali non ottimizzati).");
    }
    console.warn("AVVISO: " + msg + " Le foto ricadranno sul placeholder grafico.");
    eligiblePhotos.forEach(function (p) { report.skipped.push({ id: p.id, reason: "sharp non disponibile" }); });
    return report;
  }

  for (var i = 0; i < eligiblePhotos.length; i++) {
    var photo = eligiblePhotos[i];
    var srcPath = pathsUtil.resolveDossierAsset(businessDir, photo.local_file);
    if (!srcPath || !fs.existsSync(srcPath)) {
      report.errors.push({ id: photo.id, reason: "file sorgente non trovato o percorso non valido: " + photo.local_file });
      continue;
    }
    var destPath = path.join(businessDir, "dist-ready", "photos", photo.id + ".webp");
    try {
      await optimizeOne(sharpLib, srcPath, destPath, photo.usage);
      report.processed.push({ id: photo.id, dest: destPath });
    } catch (err) {
      report.errors.push({ id: photo.id, reason: err.message });
    }
  }

  return report;
}

module.exports = { optimizeBusiness, loadSharp };

if (require.main === module) {
  var target = process.argv[2];
  if (!target) {
    console.error("Uso: node scripts/optimize-images.js businesses/<slug>");
    process.exit(2);
  }
  var businessDir = path.resolve(process.cwd(), target);
  optimizeBusiness(businessDir)
    .then(function (report) {
      console.log("Elaborate: " + report.processed.length + ", saltate: " + report.skipped.length + ", errori: " + report.errors.length);
      report.processed.forEach(function (p) { console.log("  ok: " + p.id + " -> " + p.dest); });
      report.skipped.forEach(function (s) { console.log("  saltata: " + s.id + " (" + s.reason + ")"); });
      report.errors.forEach(function (e) { console.error("  errore: " + e.id + " (" + e.reason + ")"); });
      process.exit(report.errors.length ? 1 : 0);
    })
    .catch(function (err) {
      console.error("Errore: " + err.message);
      process.exit(1);
    });
}
