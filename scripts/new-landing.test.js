"use strict";

/**
 * ATTENZIONE — dati interamente sintetici, solo per test automatici.
 *
 * Ogni attività/CSV/mapping costruita in questo file esiste solo per
 * esercitare scripts/new-landing.js (orchestratore). Nessuna rappresenta
 * un'attività reale. Le poche esecuzioni che attraversano davvero la
 * pipeline (build/QA) usano slug prefissati "smoke-nl-*" e puliscono
 * dist/<slug> e qa-output/<slug> nel repo reale in un blocco finally —
 * non riusare questo prefisso in altri file di test (vedi CLAUDE.md).
 */

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var os = require("os");

var nl = require("./new-landing.js");

var ROOT = path.resolve(__dirname, "..");

// ---------- fixture helpers ----------

function withTempDirs(fn) {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-nl-test-"));
  var businessesRoot = path.join(tmpRoot, "businesses");
  fs.mkdirSync(businessesRoot, { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, "dist"), { recursive: true });
  var env = { tmpRoot: tmpRoot, root: tmpRoot, businessesRoot: businessesRoot, stateRoot: tmpRoot };
  var cleanup = function () { fs.rmSync(tmpRoot, { recursive: true, force: true }); };

  var result;
  try {
    result = fn(env);
  } catch (err) {
    cleanup();
    throw err;
  }
  if (result && typeof result.then === "function") {
    return result.then(
      function (value) { cleanup(); return value; },
      function (err) { cleanup(); throw err; }
    );
  }
  cleanup();
  return result;
}

function baseTemplateDemoData(slug) {
  return {
    category: "beauty-wellness",
    template_id: "beauty-wellness-v1",
    preset_id: "default",
    lead_id: "LEAD-" + slug.toUpperCase(),
    priority: "medium",
    source_file: null,
    source_row: null,
    mode: "TEMPLATE_DEMO",
    business: {
      name: "Attività di prova (" + slug + ")",
      slug: slug,
      tagline: null,
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

function writeBusinessDir(businessesRoot, slug, dataOverrides) {
  var dir = path.join(businessesRoot, slug);
  fs.mkdirSync(dir, { recursive: true });
  var data = Object.assign(baseTemplateDemoData(slug), dataOverrides || {});
  var yamlText = require("js-yaml").dump(data, { lineWidth: 100 });
  fs.writeFileSync(path.join(dir, "data.yaml"), yamlText, "utf8");
  return dir;
}

function writeCsvAndMapping(dir, rowNames, opts) {
  opts = opts || {};
  var csvLines = ["Nome Attività,Priorità"].concat(
    rowNames.map(function (name) { return name + ",alta"; })
  );
  var csvPath = path.join(dir, "leads.csv");
  fs.writeFileSync(csvPath, csvLines.join("\n") + "\n", "utf8");
  var templateId = opts.templateId || "beauty-wellness-v1";
  var mappingPath = path.join(dir, "mapping.yaml");
  fs.writeFileSync(
    mappingPath,
    "constants:\n" +
      "  category: beauty-wellness\n" +
      "  template_id: " + templateId + "\n" +
      "  preset_id: default\n" +
      "  mode: TEMPLATE_DEMO\n" +
      "  business.content_origin: fictional_demo\n" +
      "  business.private_demo_status: not_applicable\n" +
      "  business.publication_status: not_applicable\n" +
      "columns:\n" +
      '  "Nome Attività": business.name\n' +
      '  "Priorità": priority\n',
    "utf8"
  );
  return { csvPath: csvPath, mappingPath: mappingPath };
}

function cleanupRealDistAndQa(slug) {
  fs.rmSync(path.join(ROOT, "dist", slug), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, "qa-output", slug), { recursive: true, force: true });
}

var STUB_QA_NO_ISSUES = {
  run: async function () {
    return {
      breakpoints: {},
      noJs: {},
      reducedMotion: { hiddenCountWithoutScrolling: 0 },
      print: { hiddenCountUnderPrintMedia: 0 },
      staticChecks: { unresolvedPlaceholders: [], internalDataLeak: [], jsHasRevealTimer: false }
    };
  },
  summarize: require("./qa-screenshots.js").summarize,
  runStaticChecks: function () { return []; }
};

function fakeReportWithIssue() {
  return {
    breakpoints: {
      "390": {
        consoleErrors: ["boom: errore sintetico di test"],
        horizontalOverflow: false,
        stillHiddenAfterScroll: 0,
        h1count: 1,
        imgsWithoutAlt: 0,
        brokenImages: [],
        sectionsFound: [],
        geometry: { whyItems: null, orphanMainChildren: [] },
        navLinkCoverage: null
      }
    },
    noJs: {},
    reducedMotion: { hiddenCountWithoutScrolling: 0 },
    print: { hiddenCountUnderPrintMedia: 0 },
    staticChecks: { unresolvedPlaceholders: [], internalDataLeak: [], jsHasRevealTimer: false }
  };
}

// ================= parseArgs =================

test("parseArgs accetta --business da solo", function () {
  var args = nl.parseArgs(["--business", "businesses/foo"]);
  assert.equal(args.business, "businesses/foo");
});

test("parseArgs accetta --file/--mapping/--row", function () {
  var args = nl.parseArgs(["--file", "a.csv", "--mapping", "m.yaml", "--row", "2"]);
  assert.equal(args.row, 2);
});

test("parseArgs rifiuta nessuna o più modalità di selezione", function () {
  assert.throws(function () { nl.parseArgs([]); }, /esattamente una modalità/);
  assert.throws(function () {
    nl.parseArgs(["--business", "x", "--file", "a.csv", "--mapping", "m.yaml", "--row", "1"]);
  });
});

test("parseArgs rifiuta --slug senza --row", function () {
  assert.throws(function () {
    nl.parseArgs(["--file", "a.csv", "--mapping", "m.yaml", "--rows", "1,2", "--slug", "x"]);
  }, /--slug è valido solo insieme a --row/);
});

test("parseArgs rifiuta --resume-existing e --overwrite-business insieme", function () {
  assert.throws(function () {
    nl.parseArgs(["--file", "a.csv", "--mapping", "m.yaml", "--row", "1", "--resume-existing", "--overwrite-business"]);
  }, /incompatibili/);
});

test("parseArgs rifiuta --resume-existing/--overwrite-business con --business", function () {
  assert.throws(function () { nl.parseArgs(["--business", "x", "--resume-existing"]); });
});

// ================= fingerprint helpers =================

test("fingerprintOf è deterministico e indipendente dall'ordine delle chiavi", function () {
  var d1 = { kind: "csv", file: "a.csv", row: 1 };
  var d2 = { row: 1, file: "a.csv", kind: "csv" };
  assert.equal(nl.fingerprintOf(d1), nl.fingerprintOf(d2));
});

test("normalizeCsvSourcePath produce lo stesso risultato per percorso relativo e assoluto equivalente", function () {
  var rel = "fixtures/leads-example.csv";
  var abs = path.join(ROOT, "fixtures", "leads-example.csv");
  assert.equal(nl.normalizeCsvSourcePath(rel, ROOT), nl.normalizeCsvSourcePath(abs, ROOT));
});

test("csvRowDescriptor e manualDirDescriptor producono fingerprint diversi anche a parità di slug", function () {
  var csvFp = nl.fingerprintOf(nl.csvRowDescriptor("a.csv", 1, ROOT));
  var manualFp = nl.fingerprintOf(nl.manualDirDescriptor("businesses/stesso-slug"));
  assert.notEqual(csvFp, manualFp);
});

test("descriptorFromStoredProvenance usa csv se source_file/source_row presenti, altrimenti manual", function () {
  var withCsv = nl.descriptorFromStoredProvenance({ source_file: "a.csv", source_row: 2 }, "businesses/x", ROOT);
  assert.equal(withCsv.kind, "csv");
  var withoutCsv = nl.descriptorFromStoredProvenance({ source_file: null, source_row: null }, "businesses/x", ROOT);
  assert.equal(withoutCsv.kind, "manual");
});

test("una riga CSV diversa che punta allo stesso slug produce un fingerprint diverso", function () {
  var fpRow1 = nl.fingerprintOf(nl.csvRowDescriptor("a.csv", 1, ROOT));
  var fpRow2 = nl.fingerprintOf(nl.csvRowDescriptor("a.csv", 2, ROOT));
  assert.notEqual(fpRow1, fpRow2);
});

// ================= opts.root / opts.businessesRoot: validazione esplicita, mai un fallback silenzioso =================

test("resolveOptRoot: undefined usa il default (ROOT reale del modulo)", function () {
  assert.equal(nl.resolveOptRoot({}), ROOT);
});

test("resolveOptRoot: un valore esplicito valido viene usato letteralmente", function () {
  assert.equal(nl.resolveOptRoot({ root: "/tmp/una-radice-esplicita" }), "/tmp/una-radice-esplicita");
});

test("resolveOptRoot: un valore esplicito vuoto o non stringa viene rifiutato, mai silenziosamente sostituito dal default", function () {
  assert.throws(function () { nl.resolveOptRoot({ root: "" }); }, /opts\.root non valido/);
  assert.throws(function () { nl.resolveOptRoot({ root: "   " }); }, /opts\.root non valido/);
  assert.throws(function () { nl.resolveOptRoot({ root: 123 }); }, /opts\.root non valido/);
});

test("resolveOptBusinessesRoot: undefined usa il default (<root>/businesses)", function () {
  assert.equal(nl.resolveOptBusinessesRoot({}, "/tmp/una-radice"), path.join("/tmp/una-radice", "businesses"));
});

test("resolveOptBusinessesRoot: un valore esplicito valido è indipendente da root", function () {
  assert.equal(nl.resolveOptBusinessesRoot({ businessesRoot: "/altrove/businesses" }, "/tmp/una-radice"), "/altrove/businesses");
});

test("resolveOptBusinessesRoot: un valore esplicito vuoto o non stringa viene rifiutato, mai silenziosamente sostituito dal default", function () {
  assert.throws(function () { nl.resolveOptBusinessesRoot({ businessesRoot: "" }, "/tmp/una-radice"); }, /opts\.businessesRoot non valido/);
  assert.throws(function () { nl.resolveOptBusinessesRoot({ businessesRoot: 123 }, "/tmp/una-radice"); }, /opts\.businessesRoot non valido/);
});

test("runNewLanding: opts.root esplicito ma non valido fallisce prima di qualunque scrittura, lock incluso", function () {
  return withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-badroot");
    var before = fs.readdirSync(env.tmpRoot).sort();
    return nl.runNewLanding(["--business", dir], {
      root: "", businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {}
    }).then(
      function () { assert.fail("doveva essere rifiutato"); },
      function (err) {
        assert.equal(err.code, "USAGE");
        assert.match(err.message, /opts\.root non valido/);
        var after = fs.readdirSync(env.tmpRoot).sort();
        assert.deepEqual(after, before, "nessuna scrittura dopo il rifiuto di opts.root");
        assert.equal(fs.existsSync(nl.lockFilePath(env.stateRoot)), false);
      }
    );
  });
});

test("runNewLanding: opts.businessesRoot esplicito ma non valido fallisce prima di qualunque scrittura, lock incluso", function () {
  return withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-badbizroot");
    var before = fs.readdirSync(env.tmpRoot).sort();
    return nl.runNewLanding(["--business", dir], {
      root: env.root, businessesRoot: "   ", stateRoot: env.stateRoot, print: function () {}
    }).then(
      function () { assert.fail("doveva essere rifiutato"); },
      function (err) {
        assert.equal(err.code, "USAGE");
        assert.match(err.message, /opts\.businessesRoot non valido/);
        var after = fs.readdirSync(env.tmpRoot).sort();
        assert.deepEqual(after, before, "nessuna scrittura dopo il rifiuto di opts.businessesRoot");
        assert.equal(fs.existsSync(nl.lockFilePath(env.stateRoot)), false);
      }
    );
  });
});

// ================= preflight: modalità --business =================

test("preflight: --business su cartella valida e senza output preesistente è idoneo", function () {
  withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-a");
    var report = nl.runPreflight({ items: [{ kind: "business", businessDir: dir }] }, {}, env);
    var b = report.businesses[0];
    assert.equal(b.eligible, true, JSON.stringify(b.ineligibleReason));
    assert.equal(b.directoryAction, "existing");
    assert.equal(b.outputAction, "proceed");
    assert.equal(b.sourceKind, "manual");
  });
});

test("preflight: registry-driven — template_id non registrato viene rifiutato, mai un fallback silenzioso", function () {
  withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-badtpl", { template_id: "electricians-v9" });
    var report = nl.runPreflight({ items: [{ kind: "business", businessDir: dir }] }, {}, env);
    var b = report.businesses[0];
    assert.equal(b.eligible, false);
    assert.ok(/non registrato/.test(b.ineligibleReason), b.ineligibleReason);
  });
});

test("new-landing.js non contiene alcun riferimento hardcoded a beauty-wellness-v1", function () {
  var src = fs.readFileSync(path.join(__dirname, "new-landing.js"), "utf8");
  assert.equal(src.indexOf("beauty-wellness"), -1);
});

test("preflight: dist/<slug> esistente senza stato attendibile blocca l'output, richiede --overwrite-output", function () {
  withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-b");
    fs.mkdirSync(path.join(env.root, "dist", "smoke-nl-b"), { recursive: true });

    var report1 = nl.runPreflight({ items: [{ kind: "business", businessDir: dir }] }, {}, env);
    assert.equal(report1.businesses[0].eligible, false);
    assert.equal(report1.businesses[0].outputAction, "blocked");

    var report2 = nl.runPreflight({ items: [{ kind: "business", businessDir: dir }] }, { overwriteOutput: true }, env);
    assert.equal(report2.businesses[0].eligible, true, JSON.stringify(report2.businesses[0].ineligibleReason));
    assert.equal(report2.businesses[0].outputAction, "overwrite");
  });
});

test("preflight: dist/<slug> esistente con provenienza corrispondente in lastSuccess procede senza --overwrite-output", function () {
  withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-c");
    fs.mkdirSync(path.join(env.root, "dist", "smoke-nl-c"), { recursive: true });
    var descriptor = nl.manualDirDescriptor("businesses/smoke-nl-c");
    var fp = nl.fingerprintOf(descriptor);
    nl.updateSlugState(env.stateRoot, "smoke-nl-c", { status: "success" }, { sourceKind: "manual", sourceFingerprint: fp, completedAt: new Date().toISOString() });

    var report = nl.runPreflight({ items: [{ kind: "business", businessDir: dir }] }, {}, env);
    var b = report.businesses[0];
    assert.equal(b.eligible, true, JSON.stringify(b.ineligibleReason));
    assert.equal(b.outputAction, "proceed");
    assert.equal(b.outputTrustedMatch, true);
  });
});

// ================= --business: wiring reale (parseArgs -> resolveInputSelection -> resolveBusinessesDir) =================
//
// A differenza dei test sopra (che costruiscono businessDir a mano e lo
// passano direttamente a runPreflight, bypassando resolveInputSelection),
// questi esercitano il percorso pubblico completo via runNewLanding, per
// dimostrare che un valore ostile per --business non può mai bypassare
// resolveBusinessesDir attraverso la wiring reale.

test("--business: un tentativo di path traversal viene rifiutato attraverso la wiring reale", function () {
  return withTempDirs(function (env) {
    var traversal = path.join(env.businessesRoot, "..", "..", "fuori-da-businesses");
    return nl.runNewLanding(["--business", traversal, "--dry-run"], {
      root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {}
    }).then(
      function () { assert.fail("doveva essere rifiutato"); },
      function (err) {
        assert.equal(err.code, "USAGE");
        assert.match(err.message, /Percorso --business non valido/);
      }
    );
  });
});

test("--business: un percorso assoluto esterno a businessesRoot viene rifiutato attraverso la wiring reale", function () {
  return withTempDirs(function (env) {
    var external = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-nl-external-"));
    return nl.runNewLanding(["--business", external, "--dry-run"], {
      root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {}
    }).then(
      function () { assert.fail("doveva essere rifiutato"); },
      function (err) { assert.equal(err.code, "USAGE"); }
    ).finally(function () {
      fs.rmSync(external, { recursive: true, force: true });
    });
  });
});

test("--business: un collegamento simbolico che esce da businessesRoot viene rifiutato attraverso la wiring reale", function () {
  return withTempDirs(function (env) {
    var outsideTarget = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-nl-escapelink-"));
    var link = path.join(env.businessesRoot, "link-evasivo");
    fs.symlinkSync(outsideTarget, link, "dir");
    return nl.runNewLanding(["--business", link, "--dry-run"], {
      root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {}
    }).then(
      function () { assert.fail("doveva essere rifiutato"); },
      function (err) { assert.equal(err.code, "USAGE"); }
    ).finally(function () {
      fs.rmSync(outsideTarget, { recursive: true, force: true });
    });
  });
});

// ================= preflight: modalità CSV =================

test("preflight: riga CSV nuova (nessuna cartella esistente) è idonea con azione 'create'", function () {
  withTempDirs(function (env) {
    var fixtures = writeCsvAndMapping(env.tmpRoot, ["Prova Nuova (test automatico)"]);
    var yaml = require("js-yaml");
    var selection = nl.resolveInputSelection(
      { row: 1, mappingPath: fixtures.mappingPath, file: fixtures.csvPath },
      env
    );
    var report = nl.runPreflight(selection, {}, env);
    var b = report.businesses[0];
    assert.equal(b.eligible, true, JSON.stringify(b.ineligibleReason));
    assert.equal(b.directoryAction, "create");
    assert.equal(b.sourceKind, "csv");
  });
});

test("preflight CSV: cartella già esistente fallisce chiuso per default (nessuna continuazione silenziosa)", function () {
  withTempDirs(function (env) {
    var fixtures = writeCsvAndMapping(env.tmpRoot, ["Prova Import Batch Uno (test automatico)"]);
    var slug = require("./import-csv.js").slugify("Prova Import Batch Uno (test automatico)");
    writeBusinessDir(env.businessesRoot, slug);

    var selection = nl.resolveInputSelection({ row: 1, mappingPath: fixtures.mappingPath, file: fixtures.csvPath }, env);
    var report = nl.runPreflight(selection, {}, env);
    var b = report.businesses[0];
    assert.equal(b.eligible, false);
    assert.equal(b.directoryAction, "blocked");
  });
});

test("preflight CSV: --resume-existing riesce solo se la provenienza registrata corrisponde", function () {
  withTempDirs(function (env) {
    var name = "Prova Resume (test automatico)";
    var fixtures = writeCsvAndMapping(env.tmpRoot, [name]);
    var slug = require("./import-csv.js").slugify(name);

    // stessa provenienza: source_file/source_row coerenti con file+riga corrente
    var sourceFileNormalized = nl.normalizeCsvSourcePath(fixtures.csvPath, env.root);
    writeBusinessDir(env.businessesRoot, slug, { source_file: sourceFileNormalized, source_row: 1 });

    var selection = nl.resolveInputSelection({ row: 1, mappingPath: fixtures.mappingPath, file: fixtures.csvPath }, env);
    var report = nl.runPreflight(selection, { resumeExisting: true }, env);
    assert.equal(report.businesses[0].eligible, true, JSON.stringify(report.businesses[0].ineligibleReason));
    assert.equal(report.businesses[0].directoryAction, "resume");
  });
});

test("preflight CSV: --resume-existing fallisce chiuso se la provenienza non corrisponde", function () {
  withTempDirs(function (env) {
    var name = "Prova Resume Mismatch (test automatico)";
    var fixtures = writeCsvAndMapping(env.tmpRoot, [name]);
    var slug = require("./import-csv.js").slugify(name);
    // provenienza diversa: un altro file/riga
    writeBusinessDir(env.businessesRoot, slug, { source_file: "altro-file.csv", source_row: 99 });

    var selection = nl.resolveInputSelection({ row: 1, mappingPath: fixtures.mappingPath, file: fixtures.csvPath }, env);
    var report = nl.runPreflight(selection, { resumeExisting: true }, env);
    assert.equal(report.businesses[0].eligible, false);
    assert.equal(report.businesses[0].directoryAction, "blocked");
  });
});

test("preflight CSV: --overwrite-business autorizza la sostituzione della cartella, ma non implica --overwrite-output", function () {
  withTempDirs(function (env) {
    var name = "Prova Overwrite (test automatico)";
    var fixtures = writeCsvAndMapping(env.tmpRoot, [name]);
    var slug = require("./import-csv.js").slugify(name);
    writeBusinessDir(env.businessesRoot, slug, { source_file: "altro-file.csv", source_row: 5 });

    // dist/<slug> esiste già, con provenienza che NON corrisponderà al nuovo fingerprint
    fs.mkdirSync(path.join(env.root, "dist", slug), { recursive: true });
    nl.updateSlugState(env.stateRoot, slug, { status: "success" }, {
      sourceKind: "csv",
      sourceFingerprint: nl.fingerprintOf(nl.csvRowDescriptor("altro-file.csv", 5, env.root)),
      completedAt: new Date().toISOString()
    });

    var selection = nl.resolveInputSelection({ row: 1, mappingPath: fixtures.mappingPath, file: fixtures.csvPath }, env);

    // --overwrite-business SENZA --overwrite-output: la cartella verrebbe autorizzata a
    // essere sostituita, ma l'output resta bloccato -> non idoneo, mai import chiamato
    var reportNoOut = nl.runPreflight(selection, { overwriteBusiness: true }, env);
    var bNoOut = reportNoOut.businesses[0];
    assert.equal(bNoOut.directoryAction, "overwrite");
    assert.equal(bNoOut.outputAction, "blocked");
    assert.equal(bNoOut.eligible, false);

    // con ENTRAMBI i flag: idoneo
    var reportBoth = nl.runPreflight(selection, { overwriteBusiness: true, overwriteOutput: true }, env);
    var bBoth = reportBoth.businesses[0];
    assert.equal(bBoth.outputAction, "overwrite");
    assert.equal(bBoth.eligible, true, JSON.stringify(bBoth.ineligibleReason));
  });
});

// ---- CSV: businesses/<slug> è un collegamento simbolico -> sempre ineleggibile, mai bypassabile ----

function withCsvSymlinkFixture(env, name, fn) {
  var fixtures = writeCsvAndMapping(env.tmpRoot, [name]);
  var slug = require("./import-csv.js").slugify(name);
  var outsideTarget = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-nl-csvsymlink-"));
  try {
    fs.symlinkSync(outsideTarget, path.join(env.businessesRoot, slug), "dir");
    var selection = nl.resolveInputSelection({ row: 1, mappingPath: fixtures.mappingPath, file: fixtures.csvPath }, env);
    fn(selection);
  } finally {
    fs.rmSync(outsideTarget, { recursive: true, force: true });
  }
}

test("preflight CSV: businesses/<slug> è un collegamento simbolico -> ineleggibile per default", function () {
  withTempDirs(function (env) {
    withCsvSymlinkFixture(env, "Prova Symlink Csv Default (test automatico)", function (selection) {
      var report = nl.runPreflight(selection, {}, env);
      assert.equal(report.businesses[0].eligible, false);
      assert.match(report.businesses[0].ineligibleReason, /non è un percorso ammissibile/);
    });
  });
});

test("preflight CSV: --resume-existing non bypassa il rifiuto di un collegamento simbolico", function () {
  withTempDirs(function (env) {
    withCsvSymlinkFixture(env, "Prova Symlink Csv Resume (test automatico)", function (selection) {
      var report = nl.runPreflight(selection, { resumeExisting: true }, env);
      assert.equal(report.businesses[0].eligible, false);
      assert.match(report.businesses[0].ineligibleReason, /non è un percorso ammissibile/);
    });
  });
});

test("preflight CSV: --overwrite-business (+ --overwrite-output) non bypassa il rifiuto di un collegamento simbolico", function () {
  withTempDirs(function (env) {
    withCsvSymlinkFixture(env, "Prova Symlink Csv Overwrite (test automatico)", function (selection) {
      var report = nl.runPreflight(selection, { overwriteBusiness: true, overwriteOutput: true }, env);
      assert.equal(report.businesses[0].eligible, false);
      assert.match(report.businesses[0].ineligibleReason, /non è un percorso ammissibile/);
    });
  });
});

test("preflight: slug duplicati tra righe selezionate vengono rilevati a livello di batch", function () {
  withTempDirs(function (env) {
    var fixtures = writeCsvAndMapping(env.tmpRoot, ["Prova Dup Uno (test automatico)", "Prova Dup Due (test automatico)"]);
    var selection = nl.resolveInputSelection({ rows: [1, 2], mappingPath: fixtures.mappingPath, file: fixtures.csvPath }, env);
    // forziamo entrambe le righe sullo stesso slug esplicito? --slug è valido solo con --row singolo
    // nel percorso reale una collisione avviene quando due nomi diversi producono lo stesso slug
    // derivato; qui verifichiamo direttamente runPreflight su una selezione con slug duplicato
    // costruita manualmente per isolare la logica di rilevamento.
    var report = nl.runPreflight(selection, {}, env);
    assert.equal(report.duplicateSlugs.length, 0); // nomi diversi -> slug diversi, nessun duplicato qui

    // ora simuliamo davvero la collisione: due righe che derivano lo STESSO slug
    var fixtures2 = writeCsvAndMapping(env.tmpRoot, ["Prova Identica!!!", "Prova Identica"]);
    var selection2 = nl.resolveInputSelection({ rows: [1, 2], mappingPath: fixtures2.mappingPath, file: fixtures2.csvPath }, env);
    var report2 = nl.runPreflight(selection2, {}, env);
    assert.equal(report2.duplicateSlugs.length, 1);
  });
});

// ================= dry-run: scrittura zero, lock zero =================

test("--dry-run non scrive nulla (nessuna cartella, dist, stato, lock)", function () {
  withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-dry");
    var before = fs.readdirSync(env.tmpRoot).sort();

    return nl.runNewLanding(["--business", dir, "--dry-run"], {
      root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {}
    }).then(function (outcome) {
      assert.equal(outcome.dryRun, true);
      var after = fs.readdirSync(env.tmpRoot).sort();
      assert.deepEqual(after, before);
      assert.equal(fs.existsSync(nl.lockFilePath(env.stateRoot)), false);
      assert.equal(fs.existsSync(nl.statePath(env.stateRoot)), false);
    });
  });
});

test("--dry-run non tocca un lock preesistente, nemmeno il contenuto", function () {
  return withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-dry2");
    fs.mkdirSync(path.join(env.stateRoot, ".landing-factory"), { recursive: true });
    var lockContent = JSON.stringify({ pid: 424242, startedAt: "2020-01-01T00:00:00.000Z", scope: "single", count: 1 });
    fs.writeFileSync(nl.lockFilePath(env.stateRoot), lockContent, "utf8");

    return nl.runNewLanding(["--business", dir, "--dry-run"], {
      root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {}
    }).then(function () {
      assert.equal(fs.readFileSync(nl.lockFilePath(env.stateRoot), "utf8"), lockContent);
    });
  });
});

// ================= lock: mutua esclusione =================

test("un secondo run reale mentre il lock è tenuto viene rifiutato prima di qualunque scrittura", function () {
  return withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-lock");
    fs.mkdirSync(path.join(env.stateRoot, ".landing-factory"), { recursive: true });
    fs.writeFileSync(nl.lockFilePath(env.stateRoot), JSON.stringify({ pid: 1, startedAt: "x", scope: "single", count: 1 }), "utf8");

    return nl.runNewLanding(["--business", dir], {
      root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {}
    }).then(
      function () { assert.fail("doveva essere rifiutato"); },
      function (err) {
        assert.equal(err.code, "LOCK_HELD");
        assert.equal(fs.existsSync(nl.statePath(env.stateRoot)), false);
        assert.equal(fs.existsSync(path.join(env.root, "dist", "smoke-nl-lock")), false);
      }
    );
  });
});

test("releaseLock non cancella mai un lock sostituito da un'altra esecuzione (ownership tramite token)", function () {
  withTempDirs(function (env) {
    var lockA = nl.acquireLock(env.stateRoot, "single", 1);

    // un operatore rimuove manualmente un lock dall'aspetto residuo (unica via
    // sanzionata, mai automatica) e una NUOVA esecuzione ne acquisisce uno proprio
    fs.unlinkSync(nl.lockFilePath(env.stateRoot));
    var lockB = nl.acquireLock(env.stateRoot, "single", 1);
    assert.notEqual(lockA.ownerToken, lockB.ownerToken);

    // il processo A, tardivo (es. finally di un'esecuzione già considerata morta),
    // tenta di rilasciare usando il PROPRIO vecchio token: non deve toccare il lock di B
    nl.releaseLock(env.stateRoot, lockA.ownerToken);
    assert.equal(fs.existsSync(nl.lockFilePath(env.stateRoot)), true, "il lock di B deve restare intatto");
    var stillB = JSON.parse(fs.readFileSync(nl.lockFilePath(env.stateRoot), "utf8"));
    assert.equal(stillB.ownerToken, lockB.ownerToken);

    // B, il legittimo proprietario, può invece rilasciare normalmente il proprio lock
    nl.releaseLock(env.stateRoot, lockB.ownerToken);
    assert.equal(fs.existsSync(nl.lockFilePath(env.stateRoot)), false);
  });
});

test("il preflight autoritativo gira sempre a lock già acquisito in un run reale", function () {
  return withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-order");
    var observed = false;

    return nl.runNewLanding(["--business", dir], {
      root: ROOT, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {},
      qaRunner: STUB_QA_NO_ISSUES,
      onBeforePreflight: function () {
        observed = nl.lockExists(env.stateRoot);
      }
    }).then(function () {
      assert.equal(observed, true);
    }).finally(function () {
      cleanupRealDistAndQa("smoke-nl-order");
    });
  });
});

test("una collisione apparsa dopo un'anteprima --dry-run pulita viene comunque rilevata dal run reale", function () {
  return withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-race");
    var opts = { root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {} };

    return nl.runNewLanding(["--business", dir, "--dry-run"], opts).then(function (preview) {
      assert.equal(preview.report.businesses[0].eligible, true);

      // "nel frattempo" un'altra fonte produce dist/<slug> con provenienza diversa
      fs.mkdirSync(path.join(env.root, "dist", "smoke-nl-race"), { recursive: true });
      nl.updateSlugState(env.stateRoot, "smoke-nl-race", { status: "success" }, {
        sourceKind: "manual",
        sourceFingerprint: "0000000000000000000000000000000000000000000000000000000000000",
        completedAt: new Date().toISOString()
      });

      return nl.runNewLanding(["--business", dir], opts).then(function (outcome) {
        assert.equal(outcome.results[0].status, "failed");
        assert.equal(outcome.results[0].stage, "preflight");
      });
    });
  });
});

// ================= --overwrite-business non tocca mai la cartella prima dell'autorizzazione output =================

test("--overwrite-business non modifica mai la cartella esistente se manca l'autorizzazione --overwrite-output", function () {
  return withTempDirs(function (env) {
    var name = "Prova Protezione (test automatico)";
    var fixtures = writeCsvAndMapping(env.tmpRoot, [name]);
    var slug = require("./import-csv.js").slugify(name);
    var dir = writeBusinessDir(env.businessesRoot, slug, { source_file: "altro-file.csv", source_row: 5 });
    var yamlBefore = fs.readFileSync(path.join(dir, "data.yaml"), "utf8");

    fs.mkdirSync(path.join(env.root, "dist", slug), { recursive: true });
    nl.updateSlugState(env.stateRoot, slug, { status: "success" }, {
      sourceKind: "csv",
      sourceFingerprint: nl.fingerprintOf(nl.csvRowDescriptor("altro-file.csv", 5, env.root)),
      completedAt: new Date().toISOString()
    });

    return nl.runNewLanding(
      ["--file", fixtures.csvPath, "--mapping", fixtures.mappingPath, "--row", "1", "--overwrite-business"],
      { root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {} }
    ).then(function (outcome) {
      assert.equal(outcome.results[0].status, "failed");
      assert.equal(outcome.results[0].stage, "preflight");
      var yamlAfter = fs.readFileSync(path.join(dir, "data.yaml"), "utf8");
      assert.equal(yamlAfter, yamlBefore, "la cartella non deve mai essere toccata prima dell'autorizzazione output");
    });
  });
});

// ================= preflight bloccato: lock rilasciato, nulla cambiato =================

test("un fallimento del preflight rilascia il lock e non lascia alcuna traccia (business/stato/dist/qa)", function () {
  return withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-badreg", { template_id: "does-not-exist-v9" });

    return nl.runNewLanding(["--business", dir], {
      root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {}
    }).then(function (outcome) {
      assert.equal(outcome.results[0].status, "failed");
      assert.equal(fs.existsSync(nl.lockFilePath(env.stateRoot)), false);
      assert.equal(fs.existsSync(nl.statePath(env.stateRoot)), false);
      assert.equal(fs.existsSync(path.join(env.root, "dist", "smoke-nl-badreg")), false);
      assert.equal(fs.existsSync(path.join(env.root, "qa-output", "smoke-nl-badreg")), false);
    });
  });
});

// ================= stato: macchina atomica =================

test("writeStateAtomic scrive tramite file temporaneo + rename, nessun residuo .tmp-*", function () {
  withTempDirs(function (env) {
    nl.writeStateAtomic(env.stateRoot, { foo: { current: { status: "running" }, lastSuccess: null } });
    var dir = path.dirname(nl.statePath(env.stateRoot));
    var leftovers = fs.readdirSync(dir).filter(function (f) { return f.indexOf(".tmp-") !== -1; });
    assert.deepEqual(leftovers, []);
    assert.deepEqual(nl.readState(env.stateRoot).foo.current.status, "running");
  });
});

test("updateSlugState mantiene current e lastSuccess separati", function () {
  withTempDirs(function (env) {
    nl.updateSlugState(env.stateRoot, "x", { status: "running" });
    var afterRunning = nl.readState(env.stateRoot).x;
    assert.equal(afterRunning.current.status, "running");
    assert.equal(afterRunning.lastSuccess, null);

    nl.updateSlugState(env.stateRoot, "x", { status: "failed", failedStage: "build" });
    var afterFailed = nl.readState(env.stateRoot).x;
    assert.equal(afterFailed.current.status, "failed");
    assert.equal(afterFailed.lastSuccess, null, "un fallimento non deve mai toccare lastSuccess");

    nl.updateSlugState(env.stateRoot, "x", { status: "success" }, { sourceKind: "manual", sourceFingerprint: "abc", completedAt: "now" });
    var afterSuccess = nl.readState(env.stateRoot).x;
    assert.equal(afterSuccess.current.status, "success");
    assert.equal(afterSuccess.lastSuccess.sourceFingerprint, "abc");
  });
});

// ================= esecuzione reale end-to-end (QA iniettata, no Playwright) =================

test("run reale completo con QA iniettata senza problemi: successo, stato success, lastSuccess valorizzato", function () {
  return withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-happy");
    return nl.runNewLanding(["--business", dir], {
      root: ROOT, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {},
      qaRunner: STUB_QA_NO_ISSUES
    }).then(function (outcome) {
      assert.equal(outcome.results[0].status, "success");
      var state = nl.readState(env.stateRoot)["smoke-nl-happy"];
      assert.equal(state.current.status, "success");
      assert.ok(state.lastSuccess);
      assert.equal(fs.existsSync(path.join(ROOT, "dist", "smoke-nl-happy", "index.html")), true);
    }).finally(function () {
      cleanupRealDistAndQa("smoke-nl-happy");
    });
  });
});

test("un fallimento riportato in buildBusinesses().failures produce sempre failed/build, mai un successo silenzioso", function () {
  return withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-buildfail");
    var failingBuildRunner = {
      buildBusinesses: function (dirs) {
        // stesso contratto di scripts/build.js: results/failures, mai un'eccezione —
        // questo test dimostra che il solo ritorno di buildBusinesses() non basta:
        // deve essere il contenuto di .failures a decidere l'esito, mai il fatto che
        // la chiamata sia "tornata" senza lanciare.
        return { results: [], failures: [{ dir: dirs[0], error: new Error("boom: fallimento sintetico di build") }] };
      }
    };
    return nl.runNewLanding(["--business", dir], {
      root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {},
      buildRunner: failingBuildRunner
    }).then(function (outcome) {
      assert.equal(outcome.results[0].status, "failed");
      assert.equal(outcome.results[0].stage, "build");
      assert.match(outcome.results[0].message, /boom: fallimento sintetico di build/);
      var state = nl.readState(env.stateRoot)["smoke-nl-buildfail"];
      assert.equal(state.current.status, "failed");
      assert.equal(state.current.failedStage, "build");
      assert.equal(state.lastSuccess, null, "un fallimento di build non deve mai valorizzare lastSuccess");
    });
  });
});

var STUB_BUILD_SUCCESS = {
  buildBusinesses: function (dirs) {
    return {
      results: dirs.map(function (d) {
        return { slug: path.basename(d), distDir: path.join(d, "fake-dist"), warnings: [], photosUsed: 0, reviewsUsed: 0 };
      }),
      failures: []
    };
  }
};

test("run reale con root e businessesRoot distinti: l'import scrive sotto businessesRoot, mai sotto root/businesses; source_file resta relativo a root", function () {
  var rootA = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-nl-rootA-"));
  var rootB = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-nl-rootB-"));
  var businessesRootB = path.join(rootB, "businesses");
  fs.mkdirSync(businessesRootB, { recursive: true });
  var name = "Smoke Nl Root Diviso (test automatico)";
  var fixtures = writeCsvAndMapping(rootA, [name]);
  var opts = {
    root: rootA, businessesRoot: businessesRootB, stateRoot: rootB, print: function () {},
    buildRunner: STUB_BUILD_SUCCESS, qaRunner: STUB_QA_NO_ISSUES
  };

  return nl.runNewLanding(["--file", fixtures.csvPath, "--mapping", fixtures.mappingPath, "--row", "1", "--dry-run"], opts)
    .then(function (preview) {
      var previewBusinessDir = preview.report.businesses[0].businessDir;
      var slug = preview.report.businesses[0].slug;
      assert.equal(previewBusinessDir, path.join(fs.realpathSync(businessesRootB), slug));

      return nl.runNewLanding(["--file", fixtures.csvPath, "--mapping", fixtures.mappingPath, "--row", "1"], opts)
        .then(function (outcome) {
          assert.equal(outcome.results[0].status, "success", JSON.stringify(outcome.results[0]));

          // scritta sotto businessesRoot (rootB), mai sotto rootA/businesses (single source of truth)
          assert.equal(fs.existsSync(path.join(businessesRootB, slug, "data.yaml")), true);
          assert.equal(fs.existsSync(path.join(rootA, "businesses")), false);

          // il preflight (dry-run) e l'esecuzione reale concordano sullo stesso percorso
          assert.equal(path.join(businessesRootB, slug), previewBusinessDir);

          // source_file resta relativo a root (rootA), indipendente da businessesRoot (rootB)
          var writtenData = require("js-yaml").load(fs.readFileSync(path.join(businessesRootB, slug, "data.yaml"), "utf8"));
          assert.equal(writtenData.source_file, nl.normalizeCsvSourcePath(fixtures.csvPath, rootA));
        });
    })
    .finally(function () {
      fs.rmSync(rootA, { recursive: true, force: true });
      fs.rmSync(rootB, { recursive: true, force: true });
    });
});

// ================= batch: blocco dell'intero batch, isolamento per-attività =================

test("batch reale: slug duplicati tra righe blocca l'intero batch, zero scritture per qualunque attività", function () {
  return withTempDirs(function (env) {
    var name = "Smoke Nl Batch Dup (test automatico)";
    var fixtures = writeCsvAndMapping(env.tmpRoot, [name, name]);
    var slug = require("./import-csv.js").slugify(name);

    return nl.runNewLanding(
      ["--file", fixtures.csvPath, "--mapping", fixtures.mappingPath, "--rows", "1,2"],
      { root: env.root, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {} }
    ).then(function (outcome) {
      assert.equal(outcome.blocked, true);
      assert.equal(outcome.reason, "duplicate-slugs");
      assert.equal(outcome.report.duplicateSlugs.length, 1);
      assert.equal(fs.existsSync(path.join(env.businessesRoot, slug)), false);
      assert.equal(fs.existsSync(nl.statePath(env.stateRoot)), false);
      assert.equal(fs.existsSync(nl.lockFilePath(env.stateRoot)), false);
    });
  });
});

test("batch reale: attività valide e non valide restano isolate — le valide riescono, la non valida fallisce da sola", function () {
  return withTempDirs(function (env) {
    var slugify = require("./import-csv.js").slugify;
    var nameOk1 = "Smoke Nl Batch Ok Uno (test automatico)";
    var nameOk2 = "Smoke Nl Batch Ok Due (test automatico)";
    var slugOk1 = slugify(nameOk1);
    var slugOk2 = slugify(nameOk2);
    // riga 2 volutamente senza un nome derivabile in slug (solo simboli):
    // ineleggibile in preflight, isolata dalle altre due righe valide.
    var csvPath = path.join(env.tmpRoot, "leads-batch-isolation.csv");
    fs.writeFileSync(csvPath, "Nome Attività,Priorità\n" + nameOk1 + ",alta\n!!!,alta\n" + nameOk2 + ",alta\n", "utf8");
    var fixtures = writeCsvAndMapping(env.tmpRoot, []); // solo per ottenere un mapping.yaml coerente
    var realBusinessesRoot = path.join(ROOT, "businesses");

    return nl.runNewLanding(
      ["--file", csvPath, "--mapping", fixtures.mappingPath, "--rows", "1,2,3"],
      { root: ROOT, businessesRoot: realBusinessesRoot, stateRoot: env.stateRoot, print: function () {}, qaRunner: STUB_QA_NO_ISSUES }
    ).then(function (outcome) {
      assert.equal(outcome.results.length, 3);
      var bySlug = {};
      outcome.results.forEach(function (r) { bySlug[r.slug || "(nessuno)"] = r; });

      assert.equal(bySlug[slugOk1].status, "success");
      assert.equal(bySlug[slugOk2].status, "success");
      var badResults = outcome.results.filter(function (r) { return r.status === "failed"; });
      assert.equal(badResults.length, 1);
      assert.equal(badResults[0].stage, "preflight");
    }).finally(function () {
      fs.rmSync(path.join(ROOT, "businesses", slugOk1), { recursive: true, force: true });
      fs.rmSync(path.join(ROOT, "businesses", slugOk2), { recursive: true, force: true });
      cleanupRealDistAndQa(slugOk1);
      cleanupRealDistAndQa(slugOk2);
    });
  });
});

test("QA che riporta un problema (via summarize reale) produce sempre failed/qa, mai success", function () {
  return withTempDirs(function (env) {
    var dir = writeBusinessDir(env.businessesRoot, "smoke-nl-qafail");
    var qaRunnerWithIssue = {
      run: async function () { return fakeReportWithIssue(); },
      summarize: require("./qa-screenshots.js").summarize, // funzione REALE, non una finta
      runStaticChecks: function () { return []; }
    };
    return nl.runNewLanding(["--business", dir], {
      root: ROOT, businessesRoot: env.businessesRoot, stateRoot: env.stateRoot, print: function () {},
      qaRunner: qaRunnerWithIssue
    }).then(function (outcome) {
      assert.equal(outcome.results[0].status, "failed");
      assert.equal(outcome.results[0].stage, "qa");
      var state = nl.readState(env.stateRoot)["smoke-nl-qafail"];
      assert.equal(state.current.status, "failed");
      assert.equal(state.lastSuccess, null);
    }).finally(function () {
      cleanupRealDistAndQa("smoke-nl-qafail");
    });
  });
});
