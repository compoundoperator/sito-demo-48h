"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var os = require("os");

var optimizeMod = require("./optimize-images.js");
var sharpLib = optimizeMod.loadSharp();

test("loadSharp non lancia eccezioni se il modulo non è disponibile", function () {
  assert.doesNotThrow(function () { optimizeMod.loadSharp(); });
});

test(
  "optimizeBusiness ridimensiona, converte in WebP e rimuove i metadati EXIF di una foto idonea",
  { skip: !sharpLib ? "sharp non disponibile in questo ambiente" : false },
  async function () {
    var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-imgtest-"));
    var businessDir = path.join(tmpRoot, "foto-test");
    fs.mkdirSync(path.join(businessDir, "dossier", "photos"), { recursive: true });

    // Immagine sintetica 2000x1000 con metadati EXIF (dettagli fotocamera fittizi).
    var srcPath = path.join(businessDir, "dossier", "photos", "hero.jpg");
    await sharpLib({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 200, g: 120, b: 80 } }
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Make: "FotocameraDiProva", Model: "ModelloDiProva" } } })
      .toFile(srcPath);

    var dataYaml =
      "category: beauty-wellness\n" +
      "template_id: beauty-wellness-v1\n" +
      "preset_id: default\n" +
      "lead_id: TEST-IMG-001\n" +
      "priority: medium\n" +
      "source_file: null\n" +
      "source_row: null\n" +
      "mode: PRODUCTION\n" +
      "business:\n" +
      "  name: Attività Test Immagini\n" +
      "  slug: foto-test\n" +
      "  content_origin: client_provided\n" +
      "  publication_status: approved_for_publication\n" +
      "  private_demo_status: not_applicable\n" +
      "services: []\n" +
      "strengths: []\n" +
      "atmosfera: []\n" +
      "reviews: []\n" +
      "faq: []\n" +
      "photos:\n" +
      "  - id: hero\n" +
      "    local_file: photos/hero.jpg\n" +
      "    alt_text: Foto di prova\n" +
      "    usage: hero\n" +
      "    contains_recognizable_people: false\n" +
      "    contains_recognizable_minors: false\n" +
      "    consent_confirmed: false\n" +
      "    content_origin: client_provided\n" +
      "    publication_status: approved_for_publication\n";
    fs.writeFileSync(path.join(businessDir, "data.yaml"), dataYaml, "utf8");

    try {
      var report = await optimizeMod.optimizeBusiness(businessDir);
      assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
      assert.equal(report.processed.length, 1);

      var destPath = path.join(businessDir, "dist-ready", "photos", "hero.webp");
      assert.ok(fs.existsSync(destPath));

      var meta = await sharpLib(destPath).metadata();
      assert.equal(meta.format, "webp");
      assert.ok(meta.width <= 1600, "la larghezza deve rispettare il limite per usage=hero (1600px)");
      assert.equal(meta.exif, undefined, "i metadati EXIF non devono essere presenti nell'output ottimizzato");
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
);

test(
  "optimizeBusiness lancia un errore bloccante in PRODUCTION se sharp non è disponibile",
  { skip: sharpLib ? "richiede un ambiente senza sharp (npm ci --omit=optional)" : false },
  async function () {
    var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-imgtest-nosharp-"));
    var businessDir = path.join(tmpRoot, "foto-test-no-sharp");
    fs.mkdirSync(businessDir, { recursive: true });

    // Nessun file immagine reale necessario: il ramo "sharp assente" di
    // optimizeBusiness() lancia l'errore prima di toccare il file sorgente,
    // ma serve comunque almeno una foto idonea (contains_recognizable_people:
    // false, nessun minore, publication_status approvato) perché il codice
    // raggiunga quel ramo invece di tornare subito con un report vuoto.
    var dataYaml =
      "category: beauty-wellness\n" +
      "template_id: beauty-wellness-v1\n" +
      "preset_id: default\n" +
      "lead_id: TEST-IMG-NOSHARP-001\n" +
      "priority: medium\n" +
      "source_file: null\n" +
      "source_row: null\n" +
      "mode: PRODUCTION\n" +
      "business:\n" +
      "  name: Attività Test No-Sharp (esempio fittizio)\n" +
      "  slug: foto-test-no-sharp\n" +
      "  content_origin: client_provided\n" +
      "  publication_status: approved_for_publication\n" +
      "  private_demo_status: not_applicable\n" +
      "services: []\n" +
      "strengths: []\n" +
      "atmosfera: []\n" +
      "reviews: []\n" +
      "faq: []\n" +
      "photos:\n" +
      "  - id: hero\n" +
      "    local_file: photos/hero.jpg\n" +
      "    alt_text: Foto di prova\n" +
      "    usage: hero\n" +
      "    contains_recognizable_people: false\n" +
      "    contains_recognizable_minors: false\n" +
      "    consent_confirmed: false\n" +
      "    content_origin: client_provided\n" +
      "    publication_status: approved_for_publication\n";
    fs.writeFileSync(path.join(businessDir, "data.yaml"), dataYaml, "utf8");

    try {
      await assert.rejects(
        optimizeMod.optimizeBusiness(businessDir),
        function (err) {
          return /sharp non è disponibile/.test(err.message) && /PRODUCTION/.test(err.message);
        }
      );
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
);

test("optimizeBusiness non produce output se non ci sono foto idonee (array vuoto)", async function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-imgtest-"));
  var businessDir = path.join(tmpRoot, "senza-foto");
  fs.mkdirSync(businessDir, { recursive: true });
  fs.writeFileSync(
    path.join(businessDir, "data.yaml"),
    "category: beauty-wellness\ntemplate_id: beauty-wellness-v1\npreset_id: default\nlead_id: X\npriority: low\nsource_file: null\nsource_row: null\nmode: TEMPLATE_DEMO\nbusiness:\n  name: X\n  slug: senza-foto\n  content_origin: fictional_demo\n  private_demo_status: not_applicable\n  publication_status: not_applicable\nservices: []\nstrengths: []\natmosfera: []\nphotos: []\nreviews: []\nfaq: []\n",
    "utf8"
  );
  var report = await optimizeMod.optimizeBusiness(businessDir);
  assert.deepEqual(report.processed, []);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
