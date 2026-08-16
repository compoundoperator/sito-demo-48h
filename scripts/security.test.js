"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var fs = require("fs");
var os = require("os");

var esc = require("./security/escape.js");
var url = require("./security/url.js");
var paths = require("./security/paths.js");

// ---------- escape.js ----------

test("escapeHtml neutralizza HTML injection", function () {
  var out = esc.escapeHtml('<script>alert(1)</script>');
  assert.equal(out.indexOf("<script>"), -1);
  assert.equal(out, "&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("escapeHtml neutralizza chiusura anticipata di tag", function () {
  var out = esc.escapeHtml('</div><img src=x onerror=alert(1)>');
  assert.ok(out.indexOf("</div>") === -1);
  assert.ok(out.indexOf("<img") === -1);
});

test("escapeAttr neutralizza attribute injection (uscita da valore quotato)", function () {
  var malicious = '" onmouseover="alert(1)';
  var out = esc.escapeAttr(malicious);
  assert.equal(out.indexOf('"'), -1);
});

test("escapeHtml gestisce null/undefined/stringa vuota senza eccezioni", function () {
  assert.equal(esc.escapeHtml(null), "");
  assert.equal(esc.escapeHtml(undefined), "");
  assert.equal(esc.escapeHtml(""), "");
});

test("safeJsonForScriptTag impedisce la chiusura del tag <script>", function () {
  var payload = { x: "</script><script>alert(1)</script>" };
  var out = esc.safeJsonForScriptTag(payload);
  assert.equal(out.indexOf("</script>"), -1);
  assert.equal(out.indexOf("<script>"), -1);
  // deve restare JSON valido dopo aver invertito gli escape unicode
  var restored = JSON.parse(out.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"));
  assert.equal(restored.x, payload.x);
});

// ---------- url.js: URL pericolosi (tutti i contesti) ----------

var dangerousUrls = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "//evil.example.com/steal",
  "not a url",
  "",
  null,
  undefined
];

test("sanitizeSourceUrl rifiuta ogni protocollo/valore pericoloso", function () {
  dangerousUrls.forEach(function (u) {
    assert.equal(url.sanitizeSourceUrl(u), null, "doveva essere rifiutato: " + u);
  });
});

test("sanitizeSocialUrl rifiuta ogni protocollo/valore pericoloso", function () {
  dangerousUrls.forEach(function (u) {
    assert.equal(url.sanitizeSocialUrl(u), null);
  });
});

test("sanitizeMapUrl rifiuta ogni protocollo/valore pericoloso", function () {
  dangerousUrls.forEach(function (u) {
    assert.equal(url.sanitizeMapUrl(u), null);
  });
});

test("sanitizeSourceUrl accetta http/https assoluti validi", function () {
  assert.equal(url.sanitizeSourceUrl("https://example.com/recensione/1"), "https://example.com/recensione/1");
  assert.equal(url.sanitizeSourceUrl("http://example.com/x"), "http://example.com/x");
});

test("sanitizeCanonicalUrl accetta solo https (rifiuta http)", function () {
  assert.equal(url.sanitizeCanonicalUrl("https://cliente.example/"), "https://cliente.example/");
  assert.equal(url.sanitizeCanonicalUrl("http://cliente.example/"), null);
});

test("sanitizeFormEndpoint accetta solo https (rifiuta http)", function () {
  assert.equal(url.sanitizeFormEndpoint("https://forms.example.com/submit"), "https://forms.example.com/submit");
  assert.equal(url.sanitizeFormEndpoint("http://forms.example.com/submit"), null);
});

dangerousUrls.forEach(function (u) {
  test("sanitizeCanonicalUrl rifiuta valore pericoloso: " + String(u), function () {
    assert.equal(url.sanitizeCanonicalUrl(u), null);
  });
  test("sanitizeFormEndpoint rifiuta valore pericoloso: " + String(u), function () {
    assert.equal(url.sanitizeFormEndpoint(u), null);
  });
});

test("URL con credenziali incorporate viene rifiutato", function () {
  assert.equal(url.sanitizeSourceUrl("https://user:pass@example.com/"), null);
});

// ---------- url.js: email / telefono / whatsapp ----------

test("sanitizeEmail accetta indirizzi validi e rifiuta quelli malformati", function () {
  assert.equal(url.sanitizeEmail("info@esempio.it"), "info@esempio.it");
  assert.equal(url.sanitizeEmail("non-una-email"), null);
  assert.equal(url.sanitizeEmail("a@b"), null);
  assert.equal(url.sanitizeEmail('"<script>"@example.com'), null);
});

test("buildMailto genera mailto: solo dopo validazione", function () {
  assert.equal(url.buildMailto("info@esempio.it"), "mailto:info@esempio.it");
  assert.equal(url.buildMailto("javascript:alert(1)@example.com"), null);
});

test("normalizePhoneForTel accetta un numero valido e lo normalizza", function () {
  assert.equal(url.normalizePhoneForTel("+39 06 1234567"), "+39061234567");
});

test("normalizePhoneForTel rifiuta telefono non valido", function () {
  assert.equal(url.normalizePhoneForTel("non un numero"), null);
  assert.equal(url.normalizePhoneForTel("123"), null); // troppo corto
});

test("buildTel non genera link con input pericoloso", function () {
  assert.equal(url.buildTel("javascript:alert(1)"), null);
});

test("normalizeWhatsappNumber accetta solo cifre e rimuove il + iniziale", function () {
  assert.equal(url.normalizeWhatsappNumber("+39 351 000 0000".replace(/\s/g, "")), "393510000000");
  assert.equal(url.normalizeWhatsappNumber("+393510000000"), "393510000000");
  assert.equal(url.normalizeWhatsappNumber("393510000000"), "393510000000");
});

test("normalizeWhatsappNumber rifiuta valori non numerici o implausibili", function () {
  assert.equal(url.normalizeWhatsappNumber("chiamami"), null);
  assert.equal(url.normalizeWhatsappNumber("123"), null);
  assert.equal(url.normalizeWhatsappNumber("javascript:alert(1)"), null);
  assert.equal(url.normalizeWhatsappNumber(""), null);
  assert.equal(url.normalizeWhatsappNumber(null), null);
});

test("buildWhatsappLink costruisce un link wa.me solo con numero valido", function () {
  var link = url.buildWhatsappLink("+393510000000", "Ciao!");
  assert.equal(link, "https://wa.me/393510000000?text=Ciao!");
  assert.equal(url.buildWhatsappLink("numero non valido", "Ciao"), null);
});

// ---------- paths.js ----------

test("isValidId accetta slug/template_id/preset_id validi", function () {
  assert.equal(paths.isValidId("beauty-wellness-v1"), true);
  assert.equal(paths.isValidId("luce-beauty-studio"), true);
  assert.equal(paths.isValidId("default"), true);
});

test("isValidId rifiuta slug non validi (path traversal, maiuscole, spazi, vuoto)", function () {
  [
    "../../etc/passwd",
    "..",
    "Beauty-Wellness",
    "beauty wellness",
    "beauty/../../etc",
    "",
    null,
    undefined,
    "beauty_wellness", // underscore non ammesso dalla regola dichiarata
    "a".repeat(200)
  ].forEach(function (v) {
    assert.equal(paths.isValidId(v), false, "doveva essere rifiutato: " + v);
  });
});

test("resolveDossierAsset rifiuta path traversal (../)", function () {
  var businessDir = path.resolve(__dirname, "..", "businesses", "luce-beauty-studio");
  assert.equal(paths.resolveDossierAsset(businessDir, "../../etc/passwd"), null);
  assert.equal(paths.resolveDossierAsset(businessDir, "photos/../../../etc/passwd"), null);
  assert.equal(paths.resolveDossierAsset(businessDir, "..\\..\\windows\\system32"), null);
});

test("resolveDossierAsset rifiuta percorsi assoluti", function () {
  var businessDir = path.resolve(__dirname, "..", "businesses", "luce-beauty-studio");
  assert.equal(paths.resolveDossierAsset(businessDir, "/etc/passwd"), null);
  assert.equal(paths.resolveDossierAsset(businessDir, "C:\\Windows\\System32"), null);
});

test("resolveDossierAsset rifiuta forme codificate di path traversal", function () {
  var businessDir = path.resolve(__dirname, "..", "businesses", "luce-beauty-studio");
  assert.equal(paths.resolveDossierAsset(businessDir, "%2e%2e/%2e%2e/etc/passwd"), null);
});

test("resolveDossierAsset accetta un percorso relativo valido dentro dossier/", function () {
  var businessDir = path.resolve(__dirname, "..", "businesses", "luce-beauty-studio");
  var resolved = paths.resolveDossierAsset(businessDir, "photos/hero.jpg");
  assert.ok(resolved);
  assert.equal(resolved.indexOf(path.join(businessDir, "dossier")), 0);
});

// ---------- paths.js: resolveBusinessesDir ----------

function withTempBusinessesRoot(fn) {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-pathstest-"));
  var businessesRoot = path.join(tmpRoot, "businesses");
  fs.mkdirSync(businessesRoot, { recursive: true });
  try {
    fn(tmpRoot, businessesRoot);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

test("resolveBusinessesDir accetta una cartella diretta valida dentro businesses/", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    var target = path.join(businessesRoot, "attivita-prova");
    fs.mkdirSync(target);
    var resolved = paths.resolveBusinessesDir(target, businessesRoot);
    assert.equal(resolved, fs.realpathSync(target));
  });
});

test("resolveBusinessesDir rifiuta path traversal fuori da businesses/", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    fs.mkdirSync(path.join(tmpRoot, "outside"));
    var traversal = path.join(businessesRoot, "..", "outside");
    assert.equal(paths.resolveBusinessesDir(traversal, businessesRoot), null);
  });
});

test("resolveBusinessesDir rifiuta un percorso assoluto esterno", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    var external = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-external-"));
    try {
      assert.equal(paths.resolveBusinessesDir(external, businessesRoot), null);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });
});

test("resolveBusinessesDir rifiuta un symlink che punta fuori da businesses/", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    var outsideTarget = path.join(tmpRoot, "outside-real");
    fs.mkdirSync(outsideTarget);
    var link = path.join(businessesRoot, "link-evasivo");
    fs.symlinkSync(outsideTarget, link, "dir");
    assert.equal(paths.resolveBusinessesDir(link, businessesRoot), null);
  });
});

test("resolveBusinessesDir rifiuta una cartella annidata più di un livello sotto businesses/", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    var nested = path.join(businessesRoot, "attivita-prova", "sottocartella");
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(paths.resolveBusinessesDir(nested, businessesRoot), null);
  });
});

test("resolveBusinessesDir rifiuta businesses/ stessa", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    assert.equal(paths.resolveBusinessesDir(businessesRoot, businessesRoot), null);
  });
});

test("resolveBusinessesDir rifiuta un percorso inesistente o un file (non una cartella)", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    assert.equal(paths.resolveBusinessesDir(path.join(businessesRoot, "non-esiste"), businessesRoot), null);
    var filePath = path.join(businessesRoot, "un-file.txt");
    fs.writeFileSync(filePath, "x");
    assert.equal(paths.resolveBusinessesDir(filePath, businessesRoot), null);
  });
});

// ---------- paths.js: resolveBusinessSlugDir ----------

test("resolveBusinessSlugDir: slug non ancora esistente -> {exists:false} con il percorso atteso", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    var result = paths.resolveBusinessSlugDir(businessesRoot, "nuova-attivita");
    assert.ok(result);
    assert.equal(result.exists, false);
    assert.equal(result.path, path.join(fs.realpathSync(businessesRoot), "nuova-attivita"));
  });
});

test("resolveBusinessSlugDir: cartella reale già esistente -> {exists:true}", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    var target = path.join(businessesRoot, "attivita-esistente");
    fs.mkdirSync(target);
    var result = paths.resolveBusinessSlugDir(businessesRoot, "attivita-esistente");
    assert.ok(result);
    assert.equal(result.exists, true);
    assert.equal(result.path, fs.realpathSync(target));
  });
});

test("resolveBusinessSlugDir: rifiuta un candidato che è un collegamento simbolico (anche se punterebbe dentro businessesRoot)", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    var realInside = path.join(businessesRoot, "reale-dentro");
    fs.mkdirSync(realInside);
    var link = path.join(businessesRoot, "link-a-dentro");
    fs.symlinkSync(realInside, link, "dir");
    assert.equal(paths.resolveBusinessSlugDir(businessesRoot, "link-a-dentro"), null);
  });
});

test("resolveBusinessSlugDir: rifiuta un collegamento simbolico dangling (target inesistente)", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    var missingTarget = path.join(tmpRoot, "non-esiste-mai");
    var link = path.join(businessesRoot, "link-dangling");
    fs.symlinkSync(missingTarget, link, "dir");
    // lstat ha successo su un symlink dangling (non segue il link): non va
    // MAI confuso con "non esiste ancora, sicuro da creare qui".
    assert.equal(paths.resolveBusinessSlugDir(businessesRoot, "link-dangling"), null);
  });
});

test("resolveBusinessSlugDir: rifiuta businessesRoot che esiste ma è un file, non una cartella", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-pathstest-"));
  try {
    var filePath = path.join(tmpRoot, "non-una-cartella");
    fs.writeFileSync(filePath, "x");
    assert.equal(paths.resolveBusinessSlugDir(filePath, "qualunque-slug"), null);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("resolveBusinessSlugDir: rifiuta businessesRoot inesistente", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-pathstest-"));
  try {
    var neverCreated = path.join(tmpRoot, "mai-creata");
    assert.equal(paths.resolveBusinessSlugDir(neverCreated, "qualunque-slug"), null);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("resolveBusinessSlugDir: rifiuta businessesRoot che è un collegamento simbolico auto-referenziale (ELOOP), mai trattato come inesistente/sicuro", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-pathstest-"));
  try {
    var loopPath = path.join(tmpRoot, "loop");
    fs.symlinkSync(loopPath, loopPath, "dir");
    assert.equal(paths.resolveBusinessSlugDir(loopPath, "qualunque-slug"), null);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("resolveBusinessSlugDir: rifiuta businessesRoot il cui percorso attraversa un file come componente intermedia (ENOTDIR)", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-pathstest-"));
  try {
    var fileComponent = path.join(tmpRoot, "in-realtà-un-file");
    fs.writeFileSync(fileComponent, "x");
    var businessesRootThroughFile = path.join(fileComponent, "businesses");
    assert.equal(paths.resolveBusinessSlugDir(businessesRootThroughFile, "qualunque-slug"), null);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("resolveBusinessSlugDir: rifiuta uno slug non valido, senza mai toccare il filesystem", function () {
  withTempBusinessesRoot(function (tmpRoot, businessesRoot) {
    ["../../etc/passwd", "Beauty-Wellness", "", null, undefined, "a/b"].forEach(function (badSlug) {
      assert.equal(paths.resolveBusinessSlugDir(businessesRoot, badSlug), null, "doveva essere rifiutato: " + badSlug);
    });
  });
});
