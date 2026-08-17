"use strict";

/**
 * scripts/ci-integration-check.js
 *
 * Eseguito solo in CI, non fa parte di `npm test`: crea un'attività
 * sintetica reale sotto businesses/smoke-operations-<id>/, invoca la CLI
 * pubblica reale di new-landing esattamente come farebbe un operatore
 * (--business, quindi passando dal percorso ristretto resolveBusinessesDir,
 * con la QA visiva REALE via Playwright — non iniettata), verifica il
 * risultato, poi ripulisce ogni artefatto in un blocco finally con verifica
 * esplicita di assenza (non si limita a fidarsi di `git status`).
 *
 * Una seconda esecuzione additiva (checkTradesCsvIntegration) esercita la
 * seconda famiglia registrata (trades-v1) attraverso la modalità CSV reale
 * di new-landing.js (--file/--mapping/--row), l'unico modo di attraversare
 * davvero import/mapping — --business parte da una cartella già pronta e
 * bypassa quel percorso. Stessa disciplina di pulizia/verifica esplicita.
 *
 * Dati interamente sintetici, marcati come tali nel nome — non rappresenta
 * nessuna attività reale. Non va mai eseguito puntando a dati reali.
 */

var fs = require("fs");
var os = require("os");
var path = require("path");
var yaml = require("js-yaml");
var childProcess = require("child_process");

var ROOT = path.resolve(__dirname, "..");

function uniqueId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function syntheticBusinessData(slug) {
  return {
    category: "beauty-wellness",
    template_id: "beauty-wellness-v1",
    preset_id: "default",
    lead_id: "LEAD-CI-" + slug.toUpperCase(),
    priority: "medium",
    source_file: null,
    source_row: null,
    mode: "TEMPLATE_DEMO",
    business: {
      name: "Attività Sintetica CI (esempio fittizio — verifica CI)",
      slug: slug,
      logo: null,
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

/**
 * Seconda esecuzione, additiva: dimostra new-landing.js end-to-end per la
 * seconda famiglia registrata (trades-v1) attraverso la modalità CSV reale
 * (--file/--mapping/--row), non --business — --business parte da una
 * cartella business già pronta e non attraversa mai import/mapping, quindi
 * non dimostrerebbe la cosa che questo controllo deve provare. CSV e
 * mapping sono generati in una directory temporanea fresca
 * (fs.mkdtempSync(os.tmpdir())), mai sotto il repo, e la mappatura è
 * volutamente completa (a differenza di column-mapping.trades.example.yaml,
 * committata e intenzionalmente incompleta) così da poter passare
 * validazione e QA reale in modo automatico.
 */
function checkTradesCsvIntegration(problems) {
  var tradesSlug = "smoke-operations-trades-" + uniqueId();
  var distDir = path.join(ROOT, "dist", tradesSlug);
  var qaOutDir = path.join(ROOT, "qa-output", tradesSlug);
  var businessDir = path.join(ROOT, "businesses", tradesSlug);
  var landingFactoryDir = path.join(ROOT, ".landing-factory");
  var statePath = path.join(landingFactoryDir, "state.json");
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-ci-trades-"));

  try {
    var csvPath = path.join(tmpDir, "trades-ci.csv");
    var mappingPath = path.join(tmpDir, "trades-ci-mapping.yaml");

    fs.writeFileSync(
      mappingPath,
      "constants:\n" +
        "  category: trades\n" +
        "  template_id: trades-v1\n" +
        "  preset_id: default\n" +
        "  mode: TEMPLATE_DEMO\n" +
        "  business.content_origin: fictional_demo\n" +
        "  business.private_demo_status: not_applicable\n" +
        "  business.publication_status: not_applicable\n" +
        "columns:\n" +
        '  "Nome Attività": business.name\n' +
        '  "Servizio 1 Nome": services[0].name\n' +
        '  "Zona 1": business.service_areas[0]\n',
      "utf8"
    );
    fs.writeFileSync(
      csvPath,
      "Nome Attività,Servizio 1 Nome,Zona 1\n" +
        "Attività Sintetica CI Trades (esempio fittizio — verifica CI),Servizio di prova,Zona di prova\n",
      "utf8"
    );

    console.log(
      "Controllo di integrazione (trades-v1, CSV mode): node scripts/new-landing.js --file " +
        path.relative(ROOT, csvPath) + " --mapping " + path.relative(ROOT, mappingPath) + " --row 1 --slug " + tradesSlug
    );
    childProcess.execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts", "new-landing.js"), "--file", csvPath, "--mapping", mappingPath, "--row", "1", "--slug", tradesSlug],
      { cwd: ROOT, stdio: "inherit" }
    );

    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      problems.push("dist/" + tradesSlug + "/index.html non è stato generato (trades-v1, CSV mode)");
    }

    var qaReportPath = path.join(qaOutDir, "qa-report.json");
    if (!fs.existsSync(qaReportPath)) {
      problems.push("qa-output/" + tradesSlug + "/qa-report.json non è stato generato (trades-v1, CSV mode)");
    } else {
      var qaReport = JSON.parse(fs.readFileSync(qaReportPath, "utf8"));
      var qaProblems = require("./qa-screenshots.js").summarize(qaReport);
      if (qaProblems.length) {
        problems.push("la QA reale ha riportato problemi (trades-v1, CSV mode): " + qaProblems.join("; "));
      }
    }
  } catch (err) {
    problems.push("eccezione durante l'esecuzione (trades-v1, CSV mode): " + err.message);
  } finally {
    fs.rmSync(businessDir, { recursive: true, force: true });
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.rmSync(qaOutDir, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (fs.existsSync(statePath)) {
      try {
        var state = JSON.parse(fs.readFileSync(statePath, "utf8"));
        if (Object.prototype.hasOwnProperty.call(state, tradesSlug)) {
          delete state[tradesSlug];
        }
        if (Object.keys(state).length === 0) {
          fs.rmSync(statePath, { force: true });
        } else {
          fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
        }
      } catch (err2) {
        // stato illeggibile: non è compito di questo controllo ripararlo,
        // solo assicurarsi di non lasciare la propria voce sintetica
      }
    }

    if (fs.existsSync(landingFactoryDir)) {
      fs.readdirSync(landingFactoryDir)
        .filter(function (f) { return f.indexOf(".tmp-") !== -1; })
        .forEach(function (f) { fs.rmSync(path.join(landingFactoryDir, f), { force: true }); });
      if (fs.readdirSync(landingFactoryDir).length === 0) {
        fs.rmdirSync(landingFactoryDir);
      }
    }

    // Verifica esplicita di assenza — non ci si limita a fidarsi di git status.
    [businessDir, distDir, qaOutDir, tmpDir].forEach(function (p) {
      if (fs.existsSync(p)) problems.push("artefatto non rimosso: " + path.relative(ROOT, p));
    });
    if (fs.existsSync(statePath)) {
      try {
        var stateAfter = JSON.parse(fs.readFileSync(statePath, "utf8"));
        if (Object.prototype.hasOwnProperty.call(stateAfter, tradesSlug)) {
          problems.push("voce di stato non rimossa per " + tradesSlug);
        }
      } catch (err3) {
        problems.push("impossibile rileggere .landing-factory/state.json dopo la pulizia (trades-v1, CSV mode): " + err3.message);
      }
    }
  }
}

function main() {
  var slug = "smoke-operations-" + uniqueId();
  var businessDir = path.join(ROOT, "businesses", slug);
  var distDir = path.join(ROOT, "dist", slug);
  var qaOutDir = path.join(ROOT, "qa-output", slug);
  var landingFactoryDir = path.join(ROOT, ".landing-factory");
  var statePath = path.join(landingFactoryDir, "state.json");

  var problems = [];

  try {
    fs.mkdirSync(businessDir, { recursive: true });
    fs.writeFileSync(path.join(businessDir, "data.yaml"), yaml.dump(syntheticBusinessData(slug), { lineWidth: 100 }), "utf8");

    console.log("Controllo di integrazione: node scripts/new-landing.js --business businesses/" + slug);
    childProcess.execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts", "new-landing.js"), "--business", "businesses/" + slug],
      { cwd: ROOT, stdio: "inherit" }
    );

    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      problems.push("dist/" + slug + "/index.html non è stato generato");
    }

    var qaReportPath = path.join(qaOutDir, "qa-report.json");
    if (!fs.existsSync(qaReportPath)) {
      problems.push("qa-output/" + slug + "/qa-report.json non è stato generato");
    } else {
      var qaReport = JSON.parse(fs.readFileSync(qaReportPath, "utf8"));
      var qaProblems = require("./qa-screenshots.js").summarize(qaReport);
      if (qaProblems.length) {
        problems.push("la QA reale ha riportato problemi: " + qaProblems.join("; "));
      }
    }
  } catch (err) {
    problems.push("eccezione durante l'esecuzione: " + err.message);
  } finally {
    fs.rmSync(businessDir, { recursive: true, force: true });
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.rmSync(qaOutDir, { recursive: true, force: true });

    if (fs.existsSync(statePath)) {
      try {
        var state = JSON.parse(fs.readFileSync(statePath, "utf8"));
        if (Object.prototype.hasOwnProperty.call(state, slug)) {
          delete state[slug];
        }
        if (Object.keys(state).length === 0) {
          // il file non conteneva altro che la nostra voce sintetica (o era
          // già vuoto): rimuoverlo del tutto, non lasciare un "{}" residuo
          fs.rmSync(statePath, { force: true });
        } else {
          fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
        }
      } catch (err2) {
        // stato illeggibile: non è compito di questo controllo ripararlo,
        // solo assicurarsi di non lasciare la propria voce sintetica
      }
    }

    if (fs.existsSync(landingFactoryDir)) {
      fs.readdirSync(landingFactoryDir)
        .filter(function (f) { return f.indexOf(".tmp-") !== -1; })
        .forEach(function (f) { fs.rmSync(path.join(landingFactoryDir, f), { force: true }); });
      if (fs.readdirSync(landingFactoryDir).length === 0) {
        fs.rmdirSync(landingFactoryDir);
      }
    }

    // Verifica esplicita di assenza — non ci si limita a fidarsi di git status.
    [businessDir, distDir, qaOutDir].forEach(function (p) {
      if (fs.existsSync(p)) problems.push("artefatto non rimosso: " + path.relative(ROOT, p));
    });
    if (fs.existsSync(statePath)) {
      try {
        var stateAfter = JSON.parse(fs.readFileSync(statePath, "utf8"));
        if (Object.prototype.hasOwnProperty.call(stateAfter, slug)) {
          problems.push("voce di stato non rimossa per " + slug);
        }
      } catch (err3) {
        problems.push("impossibile rileggere .landing-factory/state.json dopo la pulizia: " + err3.message);
      }
    }
  }

  // Seconda esecuzione additiva, seconda famiglia registrata (trades-v1) via
  // CSV mode reale — vedi checkTradesCsvIntegration sopra per la motivazione.
  checkTradesCsvIntegration(problems);

  // Controllo secondario, non l'unica prova (richiesto esplicitamente: git
  // status da solo non basta a dimostrare che gli artefatti ignorati siano
  // stati rimossi, perché non distinguerebbe "mai creato" da "creato e
  // ripulito correttamente" — le verifiche fs.existsSync sopra sono quelle
  // che contano davvero).
  try {
    var gitStatus = childProcess.execSync("git status --short", { cwd: ROOT, encoding: "utf8" });
    if (gitStatus.indexOf(slug) !== -1) {
      problems.push("git status --short menziona ancora " + slug + " dopo la pulizia:\n" + gitStatus);
    }
  } catch (err4) {
    // git non disponibile: controllo secondario, non bloccante
  }

  if (problems.length) {
    console.error("Controllo di integrazione CI fallito:");
    problems.forEach(function (p) { console.error("  - " + p); });
    process.exit(1);
  }

  console.log(
    "Controllo di integrazione CI superato per entrambe le famiglie registrate: " + slug +
      " (beauty-wellness-v1, --business) e la sua controparte trades-v1 (CSV mode) create, costruite, " +
      "QA reale eseguita e superata, tutti gli artefatti ripuliti."
  );
  process.exit(0);
}

main();
