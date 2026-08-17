"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var os = require("os");

var importCsv = require("./import-csv.js");

test("parseCsv gestisce campi tra virgolette con virgole e virgolette escaped", function () {
  var rows = importCsv.parseCsv('a,"b, c","d ""e"""\n1,2,3\n');
  assert.deepEqual(rows[0], ["a", "b, c", 'd "e"']);
  assert.deepEqual(rows[1], ["1", "2", "3"]);
});

test("readRowsAsObjects usa la prima riga come intestazione", function () {
  var rows = importCsv.readRowsAsObjects("Nome,Città\nMario,Roma\n");
  assert.deepEqual(rows, [{ Nome: "Mario", Città: "Roma" }]);
});

test("setPath crea oggetti e array intermedi, inclusi indici", function () {
  var obj = {};
  importCsv.setPath(obj, "business.name", "Test");
  importCsv.setPath(obj, "services[0].name", "Servizio A");
  importCsv.setPath(obj, "services[1].name", "Servizio B");
  assert.equal(obj.business.name, "Test");
  assert.equal(obj.services[0].name, "Servizio A");
  assert.equal(obj.services[1].name, "Servizio B");
});

test("slugify normalizza nome attività in uno slug valido", function () {
  var slug = importCsv.slugify("Estetica Girasole (esempio fittizio)!");
  assert.match(slug, /^[a-z0-9-]+$/);
  assert.ok(slug.indexOf("estetica-girasole") === 0);
});

test("PRIORITY_ALIASES riconosce alta/media/bassa e i valori inglesi", function () {
  assert.equal(importCsv.PRIORITY_ALIASES.alta, "high");
  assert.equal(importCsv.PRIORITY_ALIASES.media, "medium");
  assert.equal(importCsv.PRIORITY_ALIASES.bassa, "low");
  assert.equal(importCsv.PRIORITY_ALIASES.high, "high");
});

test("buildSkeleton marca con TODO_COMPLETARE i campi di provenienza non deducibili", function () {
  var skeleton = importCsv.buildSkeleton();
  assert.equal(skeleton.business.content_origin, importCsv.TODO);
  assert.equal(skeleton.business.private_demo_status, importCsv.TODO);
  assert.equal(skeleton.business.publication_status, importCsv.TODO);
  assert.deepEqual(skeleton.photos, []);
  assert.deepEqual(skeleton.reviews, []);
});

test("applyMapping non inventa campi per colonne assenti o vuote", function () {
  var skeleton = importCsv.buildSkeleton();
  var mapping = { constants: { category: "beauty-wellness" }, columns: { Nome: "business.name", Telefono: "business.phone_display" } };
  var row = { Nome: "Prova", Telefono: "" }; // Telefono vuoto: non deve essere impostato
  var data = importCsv.applyMapping(skeleton, mapping, row, { sourceFile: "x.csv", sourceRow: 1, slug: "prova" });
  assert.equal(data.business.name, "Prova");
  assert.equal(data.business.phone_display, null); // resta il default, mai un valore inventato
  assert.equal(data.category, "beauty-wellness");
  assert.equal(data.source_file, "x.csv");
  assert.equal(data.source_row, 1);
});

test("la mappatura trades committata (column-mapping.trades.example.yaml) produce uno scaffold della forma corretta, incluso service_areas indicizzato — solo forma, non pronto per la validazione senza intervento umano", function () {
  var yaml = require("js-yaml");
  var mappingPath = path.join(path.resolve(__dirname, ".."), "column-mapping.trades.example.yaml");
  var mapping = yaml.load(fs.readFileSync(mappingPath, "utf8"));
  var csvText =
    "Nome Attività,Città,Telefono,Priorità,Servizio 1 Nome,Servizio 2 Nome,Zona 1,Zona 2,Zona 3\n" +
    "Prova Elettricista,Roma,351 123 4567,alta,Impianti civili,Quadri elettrici,Zona Roma Est,Zona Roma Centro,Comuni limitrofi\n";
  var rows = importCsv.readRowsAsObjects(csvText);
  var skeleton = importCsv.buildSkeleton();
  var data = importCsv.applyMapping(skeleton, mapping, rows[0], { sourceFile: "trades-ci.csv", sourceRow: 1, slug: "prova-elettricista" });

  assert.equal(data.category, "trades");
  assert.equal(data.template_id, "trades-v1");
  assert.equal(data.preset_id, "default");
  assert.equal(data.mode, "PRIVATE_DEMO");
  assert.equal(data.business.name, "Prova Elettricista");
  assert.equal(data.business.address.line, "Roma");
  assert.equal(data.business.phone_display, "351 123 4567");
  assert.equal(data.priority, "high");
  assert.equal(data.services[0].name, "Impianti civili");
  assert.equal(data.services[1].name, "Quadri elettrici");
  assert.deepEqual(data.business.service_areas, ["Zona Roma Est", "Zona Roma Centro", "Comuni limitrofi"]);

  // Coerente con la mappatura beauty esistente (mai modificata in questa PR):
  // questo è uno scaffold da rivedere, non una landing pronta al build senza
  // intervento umano — content_origin/private_demo_status/publication_status
  // restano il sentinel TODO_COMPLETARE, esattamente come per la mappatura
  // beauty. La copertura di una pipeline CSV-mode realmente pronta alla
  // validazione per trades-v1 è dimostrata separatamente da
  // scripts/ci-integration-check.js, con una mappatura temporanea completa.
  assert.equal(data.business.content_origin, importCsv.TODO);
  assert.equal(data.business.private_demo_status, importCsv.TODO);
  assert.equal(data.business.publication_status, importCsv.TODO);
});

test("importRow crea lo scaffold e rifiuta la sovrascrittura senza --force", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-test-"));
  var csvPath = path.join(tmpRoot, "leads.csv");
  var mappingPath = path.join(tmpRoot, "mapping.yaml");
  fs.writeFileSync(csvPath, "Nome Attività,Priorità\nProva Import,alta\n");
  fs.writeFileSync(
    mappingPath,
    "constants:\n  category: beauty-wellness\n  template_id: beauty-wellness-v1\n  preset_id: default\n  mode: PRIVATE_DEMO\ncolumns:\n  \"Nome Attività\": business.name\n  \"Priorità\": priority\n"
  );

  var originalRoot = process.cwd();
  // importRow scrive sempre sotto <repo>/businesses/<slug>: usiamo uno slug
  // dedicato e puliamo a fine test per non lasciare file di scarto.
  var result;
  try {
    result = importCsv.importRow({ file: csvPath, mapping: mappingPath, row: 1 });
    assert.equal(result.data.business.name, "Prova Import");
    assert.equal(result.data.priority, "high");
    assert.ok(fs.existsSync(path.join(result.businessDir, "data.yaml")));
    assert.ok(fs.existsSync(path.join(result.businessDir, "dossier", "photos", ".gitkeep")));

    assert.throws(function () {
      importCsv.importRow({ file: csvPath, mapping: mappingPath, row: 1 });
    }, /esiste già/);
  } finally {
    if (result && result.businessDir) fs.rmSync(result.businessDir, { recursive: true, force: true });
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("listRows filtra per priorità senza inventare righe", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-test-"));
  var csvPath = path.join(tmpRoot, "leads.csv");
  fs.writeFileSync(csvPath, "Nome,Priorità\nA,alta\nB,bassa\nC,alta\n");
  var mapping = { columns: { Priorità: "priority" } };
  var high = importCsv.listRows(csvPath, "high", mapping);
  assert.equal(high.length, 2);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------- scalabilità: parsing, slug sicuri, import ripetuti ----------

test("parseCsv gestisce un campo tra virgolette con newline incorporato", function () {
  var rows = importCsv.parseCsv('a,"riga1\nriga2",c\n1,2,3\n');
  assert.deepEqual(rows[0], ["a", "riga1\nriga2", "c"]);
  assert.deepEqual(rows[1], ["1", "2", "3"]);
});

test("importRow rifiuta uno --slug esplicito con tentativo di path traversal, senza creare nulla", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-test-"));
  var csvPath = path.join(tmpRoot, "leads.csv");
  var mappingPath = path.join(tmpRoot, "mapping.yaml");
  fs.writeFileSync(csvPath, "Nome Attività,Priorità\nProva Traversal (test automatico),alta\n");
  fs.writeFileSync(
    mappingPath,
    "constants:\n  category: beauty-wellness\n  template_id: beauty-wellness-v1\n  preset_id: default\n  mode: PRIVATE_DEMO\ncolumns:\n  \"Nome Attività\": business.name\n  \"Priorità\": priority\n"
  );
  var businessesDir = path.join(path.resolve(__dirname, ".."), "businesses");
  var before = fs.readdirSync(businessesDir).sort();
  try {
    assert.throws(function () {
      importCsv.importRow({ file: csvPath, mapping: mappingPath, row: 1, slug: "../../etc/passwd" });
    }, /Impossibile derivare uno slug valido/);
    var after = fs.readdirSync(businessesDir).sort();
    assert.deepEqual(after, before);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("un nome attività che si riduce a slug vuoto richiede --slug esplicito", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-test-"));
  var csvPath = path.join(tmpRoot, "leads.csv");
  var mappingPath = path.join(tmpRoot, "mapping.yaml");
  fs.writeFileSync(csvPath, "Nome Attività,Priorità\n!!!,alta\n");
  fs.writeFileSync(
    mappingPath,
    "constants:\n  category: beauty-wellness\n  template_id: beauty-wellness-v1\n  preset_id: default\n  mode: PRIVATE_DEMO\ncolumns:\n  \"Nome Attività\": business.name\n  \"Priorità\": priority\n"
  );
  try {
    assert.throws(function () {
      importCsv.importRow({ file: csvPath, mapping: mappingPath, row: 1 });
    }, /Impossibile derivare uno slug valido/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("importRow ripetuto su più righe distinte produce scaffold isolati, senza contaminazione reciproca", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-test-"));
  var csvPath = path.join(tmpRoot, "leads.csv");
  var mappingPath = path.join(tmpRoot, "mapping.yaml");
  fs.writeFileSync(
    csvPath,
    "Nome Attività,Priorità\n" +
      "Prova Import Batch Uno (test automatico),alta\n" +
      "Prova Import Batch Due (test automatico),bassa\n" +
      "Prova Import Batch Tre (test automatico),media\n"
  );
  fs.writeFileSync(
    mappingPath,
    "constants:\n  category: beauty-wellness\n  template_id: beauty-wellness-v1\n  preset_id: default\n  mode: PRIVATE_DEMO\ncolumns:\n  \"Nome Attività\": business.name\n  \"Priorità\": priority\n"
  );

  var results = [];
  try {
    for (var row = 1; row <= 3; row++) {
      results.push(importCsv.importRow({ file: csvPath, mapping: mappingPath, row: row }));
    }
    assert.equal(results.length, 3);
    var slugs = results.map(function (r) { return r.slug; });
    assert.equal(new Set(slugs).size, 3);

    results.forEach(function (res, i) {
      var yamlText = fs.readFileSync(path.join(res.businessDir, "data.yaml"), "utf8");
      assert.ok(yamlText.indexOf(res.data.business.name) !== -1);
      results.forEach(function (other, j) {
        if (i === j) return;
        assert.equal(yamlText.indexOf(other.data.business.name), -1);
      });
    });
  } finally {
    results.forEach(function (r) { fs.rmSync(r.businessDir, { recursive: true, force: true }); });
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("due righe distinte che normalizzano allo stesso slug: la seconda importazione fallisce senza --force", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-test-"));
  var csvPath = path.join(tmpRoot, "leads.csv");
  var mappingPath = path.join(tmpRoot, "mapping.yaml");
  fs.writeFileSync(
    csvPath,
    "Nome Attività,Priorità\n" +
      "Prova Collisione Slug (test automatico),alta\n" +
      "Prova Collisione Slug (test automatico)!!!,bassa\n"
  );
  fs.writeFileSync(
    mappingPath,
    "constants:\n  category: beauty-wellness\n  template_id: beauty-wellness-v1\n  preset_id: default\n  mode: PRIVATE_DEMO\ncolumns:\n  \"Nome Attività\": business.name\n  \"Priorità\": priority\n"
  );

  var first;
  try {
    first = importCsv.importRow({ file: csvPath, mapping: mappingPath, row: 1 });
    assert.throws(function () {
      importCsv.importRow({ file: csvPath, mapping: mappingPath, row: 2 });
    }, /esiste già/);
  } finally {
    if (first && first.businessDir) fs.rmSync(first.businessDir, { recursive: true, force: true });
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

// ---------- root/businessesRoot: fonte unica di verità con new-landing.js ----------

function writeCsvFixture(dir, name) {
  var csvPath = path.join(dir, "leads.csv");
  var mappingPath = path.join(dir, "mapping.yaml");
  fs.writeFileSync(csvPath, "Nome Attività,Priorità\n" + name + ",alta\n");
  fs.writeFileSync(
    mappingPath,
    "constants:\n  category: beauty-wellness\n  template_id: beauty-wellness-v1\n  preset_id: default\n  mode: PRIVATE_DEMO\ncolumns:\n  \"Nome Attività\": business.name\n  \"Priorità\": priority\n"
  );
  return { csvPath: csvPath, mappingPath: mappingPath };
}

test("importRow: businessesRoot esplicito, diverso da root/businesses, viene onorato — root governa solo source_file", function () {
  var rootA = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-rootA-"));
  var rootB = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-rootB-"));
  var businessesRootB = path.join(rootB, "businesses");
  fs.mkdirSync(businessesRootB, { recursive: true });
  try {
    var fixtures = writeCsvFixture(rootA, "Prova Root Diviso (test automatico)");
    var result = importCsv.importRow({
      file: fixtures.csvPath,
      mapping: fixtures.mappingPath,
      row: 1,
      root: rootA,
      businessesRoot: businessesRootB
    });

    // scritto sotto businessesRoot (rootB), MAI sotto rootA/businesses
    assert.equal(result.businessDir, path.join(fs.realpathSync(businessesRootB), result.slug));
    assert.equal(fs.existsSync(path.join(rootA, "businesses")), false);
    assert.ok(fs.existsSync(path.join(result.businessDir, "data.yaml")));

    // source_file resta relativo a root (rootA), non a businessesRoot (rootB)
    assert.equal(result.data.source_file, path.relative(rootA, fixtures.csvPath));
  } finally {
    fs.rmSync(rootA, { recursive: true, force: true });
    fs.rmSync(rootB, { recursive: true, force: true });
  }
});

test("importRow: opts.root/opts.businessesRoot espliciti ma vuoti falliscono subito, senza scrivere nulla (mai un fallback silenzioso)", function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-validate-"));
  try {
    var fixtures = writeCsvFixture(tmpRoot, "Prova Validazione Opts (test automatico)");
    var before = fs.readdirSync(tmpRoot).sort();

    assert.throws(function () {
      importCsv.importRow({ file: fixtures.csvPath, mapping: fixtures.mappingPath, row: 1, root: "" });
    }, /opts\.root non valido/);
    assert.throws(function () {
      importCsv.importRow({ file: fixtures.csvPath, mapping: fixtures.mappingPath, row: 1, businessesRoot: "" });
    }, /opts\.businessesRoot non valido/);
    assert.throws(function () {
      importCsv.importRow({ file: fixtures.csvPath, mapping: fixtures.mappingPath, row: 1, root: 42 });
    }, /opts\.root non valido/);

    var after = fs.readdirSync(tmpRoot).sort();
    assert.deepEqual(after, before, "nessun file scritto dopo un rifiuto");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("importRow (standalone): rifiuta un collegamento simbolico al posto della cartella business, anche con force:true", function () {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-symlink-"));
  var businessesRoot = path.join(root, "businesses");
  fs.mkdirSync(businessesRoot, { recursive: true });
  var outsideTarget = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-symlink-target-"));
  try {
    var fixtures = writeCsvFixture(root, "Prova Symlink Standalone (test automatico)");
    var slug = importCsv.slugify("Prova Symlink Standalone (test automatico)");
    var link = path.join(businessesRoot, slug);
    fs.symlinkSync(outsideTarget, link, "dir");

    assert.throws(function () {
      importCsv.importRow({
        file: fixtures.csvPath, mapping: fixtures.mappingPath, row: 1,
        root: root, businessesRoot: businessesRoot, force: true
      });
    }, /non è un percorso ammissibile/);

    // il collegamento simbolico stesso non è stato toccato/seguito
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    assert.equal(fs.readdirSync(outsideTarget).length, 0);
  } finally {
    fs.unlinkSync(path.join(businessesRoot, importCsv.slugify("Prova Symlink Standalone (test automatico)")));
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outsideTarget, { recursive: true, force: true });
  }
});
