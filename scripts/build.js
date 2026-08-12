"use strict";

var fs = require("fs");
var path = require("path");

var validateMod = require("./validate.js");
var pathsUtil = require("./security/paths.js");
var urlUtil = require("./security/url.js");
var registry = require("../templates/registry.json");

var ROOT = path.resolve(__dirname, "..");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach(function (entry) {
    var s = path.join(src, entry.name);
    var d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  });
}

function copyFileIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

/**
 * Risolve template_id/preset_id ESCLUSIVAMENTE tramite templates/registry.json.
 * Non costruisce mai percorsi direttamente da input non fidato.
 */
function resolveTemplate(templateId, presetId) {
  if (!pathsUtil.isValidId(templateId) || !Object.prototype.hasOwnProperty.call(registry, templateId)) {
    throw new Error("template_id non registrato: " + templateId);
  }
  var entry = registry[templateId];
  if (!pathsUtil.isValidId(presetId) || entry.presets.indexOf(presetId) === -1) {
    throw new Error("preset_id non registrato per " + templateId + ": " + presetId);
  }
  return {
    renderPath: path.join(ROOT, entry.render),
    cssPaths: entry.css.map(function (p) { return path.join(ROOT, p); }),
    jsPaths: (entry.js || []).map(function (p) { return path.join(ROOT, p); }),
    tokensPath: path.join(ROOT, "templates", templateId, "presets", presetId, "tokens.css")
  };
}

function computeAllowIndexing(data) {
  if (data.mode !== "PRODUCTION") return false;
  var b = data.business;
  if (b.publication_status !== "approved_for_publication") return false;
  if (!b.address || !b.address.line) return false;
  if (!ctxCanonical(b)) return false;
  return true;
}

function ctxCanonical(business) {
  return urlUtil.sanitizeCanonicalUrl(business.canonical_url);
}

function computeSiteConfig(data) {
  var b = data.business;
  var whatsappNumber = null;
  if (data.mode === "PRODUCTION" && b.whatsapp && b.whatsapp.number) {
    whatsappNumber = urlUtil.normalizeWhatsappNumber(b.whatsapp.number);
  }
  return {
    mode: data.mode,
    whatsappNumber: whatsappNumber,
    whatsappDefaultMessage: (b.whatsapp && b.whatsapp.default_message) || null,
    whatsappDemoText: "Funzione dimostrativa — nessun messaggio verrà inviato. Nella versione reale questo pulsante apre WhatsApp."
  };
}

function computePhotoUrlById(businessDir, eligiblePhotos, distAssetsDir) {
  var map = {};
  var readyDir = path.join(businessDir, "dist-ready", "photos");
  eligiblePhotos.forEach(function (photo) {
    var candidateWebp = path.join(readyDir, photo.id + ".webp");
    if (fs.existsSync(candidateWebp)) {
      var destRel = path.join("assets", "photos", photo.id + ".webp");
      fs.mkdirSync(path.join(distAssetsDir, "photos"), { recursive: true });
      fs.copyFileSync(candidateWebp, path.join(distAssetsDir, "photos", photo.id + ".webp"));
      map[photo.id] = destRel.split(path.sep).join("/");
    }
    // Se non esiste una versione ottimizzata (npm run optimize-images non ancora
    // eseguito per questa foto), la si omette: si ricade sul placeholder grafico,
    // MAI si copia silenziosamente l'originale non ottimizzato nell'output pubblico.
  });
  return map;
}

function buildBusiness(businessDir) {
  var result = validateMod.validateBusinessDir(businessDir);
  if (!result.valid) {
    var err = new Error("Validazione fallita per " + businessDir + ":\n  - " + result.errors.join("\n  - "));
    err.validationErrors = result.errors;
    throw err;
  }

  var data = validateMod.loadBusinessData(businessDir);
  data.photos = result.filtered.photos;
  data.reviews = result.filtered.reviews;

  var tpl = resolveTemplate(data.template_id, data.preset_id);
  var render = require(tpl.renderPath).renderPage;

  var slug = data.business.slug;
  if (!pathsUtil.isValidId(slug)) {
    throw new Error("business.slug non valido: " + slug);
  }
  var distDir = path.join(ROOT, "dist", slug);
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  // Asset condivisi
  copyDir(path.join(ROOT, "templates", "shared", "assets", "fonts"), path.join(distDir, "assets", "fonts"));
  copyDir(path.join(ROOT, "templates", "shared", "assets", "svg"), path.join(distDir, "assets", "svg"));
  copyFileIfExists(path.join(ROOT, "templates", "shared", "_headers"), path.join(distDir, "_headers"));

  // Fogli di stile: sorgenti separati (preset colori -> base condivisa ->
  // tema di famiglia) ma concatenati in un UNICO file nell'output. Oltre a
  // ridurre le richieste HTTP (sito più veloce), evita un comportamento
  // non deterministico osservato in Chromium/Playwright headless con più
  // <link rel="stylesheet"> separati contenenti @font-face: in quel caso
  // una delle due regole @font-face risultava sistematicamente assente da
  // document.fonts (font non caricato), indipendentemente dall'ordine
  // delle regole. Con un unico foglio concatenato entrambi i font
  // risultano sempre presenti e caricati (verificato ripetutamente).
  fs.mkdirSync(path.join(distDir, "css"), { recursive: true });
  var cssSources = [tpl.tokensPath].concat(tpl.cssPaths);
  var combinedCss = cssSources
    .map(function (p) { return "/* --- " + path.relative(ROOT, p) + " --- */\n" + fs.readFileSync(p, "utf8"); })
    .join("\n\n");
  fs.writeFileSync(path.join(distDir, "css", "style.css"), combinedCss, "utf8");

  // JS condiviso
  fs.mkdirSync(path.join(distDir, "js"), { recursive: true });
  tpl.jsPaths.forEach(function (p) {
    fs.copyFileSync(p, path.join(distDir, "js", path.basename(p)));
  });

  var cssHrefs = ["css/style.css"];
  var jsHref = "js/" + path.basename(tpl.jsPaths[0] || "base.js");

  var photoUrlById = computePhotoUrlById(businessDir, data.photos, path.join(distDir, "assets"));

  var allowIndexing = computeAllowIndexing(data);
  var canonicalUrl = allowIndexing ? ctxCanonical(data.business) : null;

  var html = render({
    data: data,
    cssHrefs: cssHrefs,
    faviconHref: "assets/svg/favicon.svg",
    jsHref: jsHref,
    allowIndexing: allowIndexing,
    canonicalUrl: canonicalUrl,
    photoUrlById: photoUrlById,
    siteConfig: computeSiteConfig(data)
  });

  fs.writeFileSync(path.join(distDir, "index.html"), html, "utf8");

  return { slug: slug, distDir: distDir, warnings: result.warnings, photosUsed: Object.keys(photoUrlById).length, reviewsUsed: data.reviews.length };
}

function listBusinessDirs() {
  var base = path.join(ROOT, "businesses");
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter(function (e) { return e.isDirectory(); })
    .map(function (e) { return path.join(base, e.name); });
}

module.exports = { buildBusiness, resolveTemplate };

if (require.main === module) {
  var target = process.argv[2];
  var dirs = target ? [path.resolve(process.cwd(), target)] : listBusinessDirs();

  if (!dirs.length) {
    console.error("Nessuna attività trovata in businesses/.");
    process.exit(2);
  }

  var hadError = false;
  dirs.forEach(function (dir) {
    try {
      var res = buildBusiness(dir);
      console.log("OK  " + res.slug + " -> dist/" + res.slug + " (foto: " + res.photosUsed + ", recensioni: " + res.reviewsUsed + ")");
      res.warnings.forEach(function (w) { console.log("     avviso: " + w); });
    } catch (err) {
      hadError = true;
      console.error("ERRORE building " + dir + ": " + err.message);
    }
  });

  process.exit(hadError ? 1 : 0);
}
