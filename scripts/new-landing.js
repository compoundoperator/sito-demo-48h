"use strict";

/**
 * scripts/new-landing.js
 *
 * Orchestratore sottile della pipeline esistente (import -> validate ->
 * optimize-images -> build -> QA) per un operatore non tecnico: una
 * attività sola (da riga CSV o da cartella businesses/<slug> già
 * preparata) o un batch controllato di righe CSV. Non reimplementa
 * nessuna regola di validazione/sicurezza/escaping/build/QA: chiama
 * esclusivamente le funzioni già esportate dagli script esistenti.
 *
 * Non conosce alcuna famiglia di template per nome: usa solo template_id/
 * preset_id già presenti nei dati, lasciando la registry (via
 * validateBusiness) decidere cosa è ammesso.
 *
 * Uso: vedi RUNBOOK.md.
 */

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var yaml = require("js-yaml");

var importCsv = require("./import-csv.js");
var validateMod = require("./validate.js");
var optimizeImages = require("./optimize-images.js");
var buildMod = require("./build.js");
var qaScreenshots = require("./qa-screenshots.js");
var pathsUtil = require("./security/paths.js");

var ROOT = path.resolve(__dirname, "..");

// ---------- errori tipizzati ----------

function usageError(message) {
  var err = new Error(message);
  err.code = "USAGE";
  return err;
}

// ---------- helper di provenienza / fingerprint (uno condiviso ovunque) ----------

function normalizeCsvSourcePath(rawPath, root) {
  var abs = path.resolve(root, rawPath);
  return path.relative(root, abs).split(path.sep).join("/");
}

function csvRowDescriptor(csvFileRawPath, rowNumber, root) {
  return { kind: "csv", file: normalizeCsvSourcePath(csvFileRawPath, root), row: rowNumber };
}

function manualDirDescriptor(businessDirRelPath) {
  return { kind: "manual", dir: businessDirRelPath };
}

function descriptorFromStoredProvenance(data, businessDirRelPath, root) {
  if (data && data.source_file && data.source_row) {
    return csvRowDescriptor(data.source_file, data.source_row, root);
  }
  return manualDirDescriptor(businessDirRelPath);
}

function fingerprintOf(descriptor) {
  var canonical = JSON.stringify(descriptor, Object.keys(descriptor).sort());
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function relBusinessDir(root, businessDir) {
  return path.relative(root, businessDir).split(path.sep).join("/");
}

// ---------- stato (.landing-factory/state.json) e lock (.landing-factory/run.lock) ----------

function landingFactoryDir(stateRoot) {
  return path.join(stateRoot, ".landing-factory");
}
function statePath(stateRoot) {
  return path.join(landingFactoryDir(stateRoot), "state.json");
}
function lockFilePath(stateRoot) {
  return path.join(landingFactoryDir(stateRoot), "run.lock");
}

function readState(stateRoot) {
  var p = statePath(stateRoot);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    return {};
  }
}

function writeStateAtomic(stateRoot, state) {
  var dir = landingFactoryDir(stateRoot);
  fs.mkdirSync(dir, { recursive: true });
  var p = statePath(stateRoot);
  var tmp = p + ".tmp-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

function updateSlugState(stateRoot, slug, currentPatch, lastSuccessValue) {
  var state = readState(stateRoot);
  var entry = state[slug] || { current: null, lastSuccess: null };
  entry.current = Object.assign({}, entry.current, currentPatch);
  if (lastSuccessValue !== undefined) entry.lastSuccess = lastSuccessValue;
  state[slug] = entry;
  writeStateAtomic(stateRoot, state);
  return entry;
}

function lockExists(stateRoot) {
  return fs.existsSync(lockFilePath(stateRoot));
}

function acquireLock(stateRoot, scope, count) {
  var dir = landingFactoryDir(stateRoot);
  fs.mkdirSync(dir, { recursive: true });
  var p = lockFilePath(stateRoot);
  var ownerToken = crypto.randomBytes(16).toString("hex");
  var info = { pid: process.pid, startedAt: new Date().toISOString(), scope: scope, count: count, ownerToken: ownerToken };
  try {
    fs.writeFileSync(p, JSON.stringify(info, null, 2), { flag: "wx" });
  } catch (err) {
    if (err.code === "EEXIST") {
      var existing = null;
      try {
        existing = JSON.parse(fs.readFileSync(p, "utf8"));
      } catch (e2) {
        existing = null;
      }
      var lockErr = new Error(
        "Un'altra esecuzione di new-landing è già in corso" +
        (existing ? " (PID " + existing.pid + ", avviata alle " + existing.startedAt + ")" : "") +
        ". Attendine il completamento. Se sei certo che si tratti di un residuo di " +
        "un'esecuzione interrotta, rimuovi manualmente .landing-factory/run.lock prima di riprovare."
      );
      lockErr.code = "LOCK_HELD";
      throw lockErr;
    }
    throw err;
  }
  return { path: p, ownerToken: ownerToken };
}

/**
 * Rimuove run.lock SOLO se contiene ancora l'ownerToken di QUESTA esecuzione.
 * Se nel frattempo un operatore ha rimosso manualmente un lock dall'aspetto
 * residuo e un'altra esecuzione ne ha acquisito uno nuovo, un rilascio
 * tardivo di questa esecuzione (es. finally di un processo lento/già
 * considerato morto) non deve mai cancellare il lock altrui: lo lascia
 * intatto, senza sollevare errori.
 */
function releaseLock(stateRoot, ownerToken) {
  var p = lockFilePath(stateRoot);
  var current;
  try {
    current = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    return; // assente o illeggibile: nulla che questa esecuzione possa rimuovere in sicurezza
  }
  if (!ownerToken || current.ownerToken !== ownerToken) {
    return; // il lock presente non è quello acquisito da questa esecuzione
  }
  try {
    fs.unlinkSync(p);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

// ---------- parsing argomenti ----------

function parseArgs(argv) {
  function getFlagValue(name) {
    var i = argv.indexOf("--" + name);
    return i !== -1 ? argv[i + 1] : undefined;
  }
  function hasFlag(name) {
    return argv.indexOf("--" + name) !== -1;
  }

  var args = {
    file: getFlagValue("file"),
    mappingPath: getFlagValue("mapping"),
    business: getFlagValue("business"),
    slug: getFlagValue("slug"),
    dryRun: hasFlag("dry-run"),
    resumeExisting: hasFlag("resume-existing"),
    overwriteBusiness: hasFlag("overwrite-business"),
    overwriteOutput: hasFlag("overwrite-output")
  };

  var rowRaw = getFlagValue("row");
  var rowsRaw = getFlagValue("rows");
  var priorityRaw = getFlagValue("priority");

  var selectionModesGiven = [rowRaw !== undefined, rowsRaw !== undefined, priorityRaw !== undefined, args.business !== undefined]
    .filter(Boolean).length;
  if (selectionModesGiven !== 1) {
    throw usageError("Specificare esattamente una modalità di selezione: --row, --rows, --priority oppure --business.");
  }

  if (rowRaw !== undefined) {
    var rowNum = Number(rowRaw);
    if (!Number.isInteger(rowNum) || rowNum < 1) throw usageError("--row deve essere un intero positivo.");
    args.row = rowNum;
  }
  if (rowsRaw !== undefined) {
    args.rows = String(rowsRaw).split(",").map(function (s) { return Number(s.trim()); });
    if (!args.rows.length || args.rows.some(function (n) { return !Number.isInteger(n) || n < 1; })) {
      throw usageError("--rows deve essere un elenco di interi positivi separati da virgola (es. 1,2,3).");
    }
  }
  if (priorityRaw !== undefined) {
    if (["low", "medium", "high"].indexOf(priorityRaw) === -1) {
      throw usageError('--priority deve essere "low", "medium" o "high".');
    }
    args.priority = priorityRaw;
  }

  if (args.business !== undefined) {
    if (args.file || args.mappingPath || rowRaw !== undefined || rowsRaw !== undefined || priorityRaw !== undefined || args.slug !== undefined) {
      throw usageError("--business non si combina con --file/--mapping/--row/--rows/--priority/--slug.");
    }
    if (args.resumeExisting || args.overwriteBusiness) {
      throw usageError("--resume-existing e --overwrite-business sono validi solo con input da CSV, non con --business.");
    }
  } else {
    if (!args.file || !args.mappingPath) {
      throw usageError("--file e --mapping sono obbligatori con --row/--rows/--priority.");
    }
    if (args.slug !== undefined && rowRaw === undefined) {
      throw usageError("--slug è valido solo insieme a --row.");
    }
  }

  if (args.resumeExisting && args.overwriteBusiness) {
    throw usageError("--resume-existing e --overwrite-business sono incompatibili tra loro.");
  }

  return args;
}

// ---------- selezione input (sola lettura) ----------

function resolveInputSelection(args, opts) {
  var root = opts.root;
  var businessesRoot = opts.businessesRoot;

  if (args.business !== undefined) {
    var resolved = pathsUtil.resolveBusinessesDir(args.business, businessesRoot);
    if (!resolved) {
      throw usageError(
        "Percorso --business non valido: deve essere una cartella reale, contenuta " +
        "direttamente in businesses/, senza collegamenti simbolici che escano da quella cartella."
      );
    }
    return { items: [{ kind: "business", businessDir: resolved }] };
  }

  var mapping = yaml.load(fs.readFileSync(args.mappingPath, "utf8"));
  var rowNumbers;
  if (args.row !== undefined) {
    rowNumbers = [args.row];
  } else if (args.rows !== undefined) {
    rowNumbers = args.rows;
  } else {
    var listed = importCsv.listRows(args.file, args.priority, mapping);
    rowNumbers = listed.map(function (e) { return e.rowNumber; });
  }

  var items = rowNumbers.map(function (n) {
    return {
      kind: "csv",
      file: args.file,
      mappingPath: args.mappingPath,
      mapping: mapping,
      row: n,
      slugOverride: args.row !== undefined ? args.slug : undefined
    };
  });
  return { items: items };
}

// ---------- preflight (autoritativo, condiviso da dry-run e run reale) ----------

function preflightOne(item, args, opts) {
  var root = opts.root;
  var businessesRoot = opts.businessesRoot;
  var stateRoot = opts.stateRoot;

  var result = {
    kind: item.kind,
    slug: null,
    businessDir: null,
    data: null,
    validation: null,
    sourceKind: null,
    sourceFingerprint: null,
    directoryExists: false,
    directoryAction: null,
    directoryBlockReason: null,
    outputExists: false,
    outputTrustedMatch: false,
    outputAction: null,
    outputBlockReason: null,
    eligible: false,
    ineligibleReason: null,
    csvFile: item.kind === "csv" ? item.file : null,
    mappingPath: item.kind === "csv" ? item.mappingPath : null,
    csvRow: item.kind === "csv" ? item.row : null
  };

  if (item.kind === "business") {
    var data;
    try {
      data = validateMod.loadBusinessData(item.businessDir);
    } catch (err) {
      result.ineligibleReason = "Impossibile leggere data.yaml: " + err.message;
      return result;
    }
    result.businessDir = item.businessDir;
    result.slug = data.business && data.business.slug;
    result.data = data;
    result.directoryExists = true;
    result.directoryAction = "existing";

    var relDir = relBusinessDir(root, result.businessDir);
    var descriptor = descriptorFromStoredProvenance(data, relDir, root);
    result.sourceKind = descriptor.kind;
    result.sourceFingerprint = fingerprintOf(descriptor);

    result.validation = validateMod.validateBusiness(result.data, result.businessDir);
  } else {
    var csvText;
    try {
      csvText = fs.readFileSync(item.file, "utf8");
    } catch (err) {
      result.ineligibleReason = "Impossibile leggere il file CSV: " + err.message;
      return result;
    }
    var rows = importCsv.readRowsAsObjects(csvText);
    if (item.row < 1 || item.row > rows.length) {
      result.ineligibleReason = "Riga " + item.row + " non trovata (il file ha " + rows.length + " righe di dati).";
      return result;
    }
    var row = rows[item.row - 1];
    var mapping = item.mapping;
    var nameHeader = Object.keys(mapping.columns || {}).find(function (h) { return mapping.columns[h] === "business.name"; });
    var derivedName = nameHeader ? row[nameHeader] : null;
    var slug = item.slugOverride || (derivedName ? importCsv.slugify(derivedName) : null);
    if (!slug || !pathsUtil.isValidId(slug)) {
      result.ineligibleReason = "Impossibile derivare uno slug valido dalla riga " + item.row + ": specificare --slug esplicitamente.";
      return result;
    }

    result.slug = slug;
    var candidate = pathsUtil.resolveBusinessSlugDir(businessesRoot, slug);
    if (!candidate) {
      result.ineligibleReason =
        "businesses/" + slug + " non è un percorso ammissibile (collegamento simbolico, radice non valida, o fuori da businessesRoot).";
      return result;
    }
    result.businessDir = candidate.path;
    result.directoryExists = candidate.exists;

    var csvDescriptor = csvRowDescriptor(item.file, item.row, root);
    result.sourceKind = csvDescriptor.kind;
    result.sourceFingerprint = fingerprintOf(csvDescriptor);

    var skeleton = importCsv.buildSkeleton();
    var simulatedData = importCsv.applyMapping(skeleton, mapping, row, {
      sourceFile: csvDescriptor.file,
      sourceRow: item.row,
      slug: slug
    });

    if (!result.directoryExists) {
      result.directoryAction = "create";
      result.data = simulatedData;
    } else if (args.overwriteBusiness) {
      result.directoryAction = "overwrite";
      result.data = simulatedData;
    } else if (args.resumeExisting) {
      var existingData = null;
      try {
        existingData = validateMod.loadBusinessData(result.businessDir);
      } catch (err) {
        existingData = null;
      }
      var matches = false;
      if (existingData) {
        var relDir2 = relBusinessDir(root, result.businessDir);
        var existingDescriptor = descriptorFromStoredProvenance(existingData, relDir2, root);
        matches = fingerprintOf(existingDescriptor) === result.sourceFingerprint;
      }
      if (matches) {
        result.directoryAction = "resume";
        result.data = existingData;
      } else {
        result.directoryAction = "blocked";
        result.directoryBlockReason =
          "businesses/" + slug + " esiste già ma la sua provenienza registrata non corrisponde " +
          "a questo file/riga CSV: --resume-existing rifiutato.";
        result.data = existingData || simulatedData;
      }
    } else {
      result.directoryAction = "blocked";
      result.directoryBlockReason =
        "businesses/" + slug + " esiste già. Usa --resume-existing (se la provenienza corrisponde) " +
        "oppure --overwrite-business (sostituzione esplicita).";
      result.data = simulatedData;
    }

    var validationBusinessDir = result.directoryAction === "resume" ? result.businessDir : null;
    result.validation = validateMod.validateBusiness(result.data, validationBusinessDir);
  }

  // decisione di collisione sull'output (dist/<slug>) — qualunque modalità di input,
  // usando l'impronta che questa esecuzione avrebbe, PRIMA di qualunque scrittura
  if (result.slug) {
    var distDir = path.join(root, "dist", result.slug);
    result.outputExists = fs.existsSync(distDir);
    if (!result.outputExists) {
      result.outputAction = "proceed";
    } else {
      var state = readState(stateRoot);
      var entry = state[result.slug];
      var lastSuccess = entry && entry.lastSuccess;
      var trusted = Boolean(
        lastSuccess &&
        lastSuccess.sourceKind === result.sourceKind &&
        lastSuccess.sourceFingerprint === result.sourceFingerprint
      );
      result.outputTrustedMatch = trusted;
      if (trusted) {
        result.outputAction = "proceed";
      } else if (args.overwriteOutput) {
        result.outputAction = "overwrite";
      } else {
        result.outputAction = "blocked";
        result.outputBlockReason =
          "dist/" + result.slug + " esiste già e la sua provenienza registrata non corrisponde a " +
          "questa esecuzione. Usa --overwrite-output per sostituirlo esplicitamente.";
      }
    }
  }

  if (result.ineligibleReason) {
    result.eligible = false;
  } else if (!result.validation || !result.validation.valid) {
    result.eligible = false;
    result.ineligibleReason = "Validazione fallita: " + (result.validation ? result.validation.errors.join("; ") : "errore sconosciuto");
  } else if (result.directoryAction === "blocked") {
    result.eligible = false;
    result.ineligibleReason = result.directoryBlockReason;
  } else if (result.outputAction === "blocked") {
    result.eligible = false;
    result.ineligibleReason = result.outputBlockReason;
  } else {
    result.eligible = true;
  }

  return result;
}

function runPreflight(selection, args, opts) {
  var businesses = selection.items.map(function (item) {
    return preflightOne(item, args, opts);
  });

  var slugToIndices = {};
  businesses.forEach(function (b, i) {
    if (!b.slug) return;
    if (!slugToIndices[b.slug]) slugToIndices[b.slug] = [];
    slugToIndices[b.slug].push(i);
  });
  var duplicateSlugs = Object.keys(slugToIndices)
    .filter(function (slug) { return slugToIndices[slug].length > 1; })
    .map(function (slug) { return { slug: slug, indices: slugToIndices[slug] }; });

  return { businesses: businesses, duplicateSlugs: duplicateSlugs };
}

// ---------- esecuzione reale per una singola attività (già idonea al preflight) ----------

async function executeOne(preflightResult, opts) {
  var root = opts.root;
  var businessesRoot = opts.businessesRoot;
  var stateRoot = opts.stateRoot;
  var slug = preflightResult.slug;
  var businessDir = preflightResult.businessDir;
  var nowIso = function () { return new Date().toISOString(); };

  function fail(stage, message) {
    updateSlugState(stateRoot, slug, {
      status: "failed",
      sourceKind: preflightResult.sourceKind,
      sourceFingerprint: preflightResult.sourceFingerprint,
      failedStage: stage,
      updatedAt: nowIso()
    });
    return { slug: slug, status: "failed", stage: stage, message: message };
  }

  updateSlugState(stateRoot, slug, {
    status: "running",
    sourceKind: preflightResult.sourceKind,
    sourceFingerprint: preflightResult.sourceFingerprint,
    failedStage: null,
    startedAt: nowIso(),
    updatedAt: nowIso()
  });

  if (preflightResult.kind === "csv" && preflightResult.directoryAction !== "resume") {
    try {
      importCsv.importRow({
        file: preflightResult.csvFile,
        mapping: preflightResult.mappingPath,
        row: preflightResult.csvRow,
        slug: slug,
        force: preflightResult.directoryAction === "overwrite",
        root: root,
        businessesRoot: businessesRoot
      });
    } catch (err) {
      return fail("import", err.message);
    }
  }

  var validation;
  try {
    validation = validateMod.validateBusinessDir(businessDir);
  } catch (err) {
    return fail("validate", err.message);
  }
  if (!validation.valid) {
    return fail("validate", validation.errors.join("; "));
  }

  try {
    await optimizeImages.optimizeBusiness(businessDir);
  } catch (err) {
    return fail("optimize", err.message);
  }

  var built;
  try {
    var buildBusinessesFn = (opts.buildRunner && opts.buildRunner.buildBusinesses) || buildMod.buildBusinesses;
    var batchResult = buildBusinessesFn([businessDir]);
    if (batchResult.failures.length) {
      return fail("build", batchResult.failures[0].error.message);
    }
    built = batchResult.results[0];
  } catch (err) {
    return fail("build", err.message);
  }

  var qaOutDir = path.join(root, "qa-output", slug);

  var staticChecksFn = (opts.qaRunner && opts.qaRunner.runStaticChecks) || qaScreenshots.runStaticChecks;
  try {
    var staticProblems = staticChecksFn(built.distDir, businessDir);
    if (staticProblems && staticProblems.length) {
      return fail("qa-preflight", staticProblems.join("; "));
    }
  } catch (err) {
    return fail("qa-preflight", err.message);
  }

  var qaRunFn = (opts.qaRunner && opts.qaRunner.run) || qaScreenshots.run;
  var qaSummarizeFn = (opts.qaRunner && opts.qaRunner.summarize) || qaScreenshots.summarize;
  var qaReport;
  try {
    qaReport = await qaRunFn(built.distDir, qaOutDir);
  } catch (err) {
    return fail("qa", err.message);
  }
  var problems = qaSummarizeFn(qaReport);
  if (problems.length > 0) {
    return fail("qa", problems.join("; "));
  }

  updateSlugState(
    stateRoot,
    slug,
    { status: "success", sourceKind: preflightResult.sourceKind, sourceFingerprint: preflightResult.sourceFingerprint, failedStage: null, updatedAt: nowIso() },
    { sourceKind: preflightResult.sourceKind, sourceFingerprint: preflightResult.sourceFingerprint, completedAt: nowIso() }
  );

  return {
    slug: slug,
    status: "success",
    distDir: built.distDir,
    photosUsed: built.photosUsed,
    reviewsUsed: built.reviewsUsed,
    warnings: (validation.warnings || []).concat(built.warnings || [])
  };
}

// ---------- stampa (operatore non tecnico) ----------

function printPreflightReport(report, print, ctx) {
  print("== Anteprima (--dry-run: nessuna scrittura è stata effettuata) ==");
  if (ctx.lockPresent) {
    print("Nota: .landing-factory/run.lock è presente — un'altra esecuzione potrebbe essere in corso; questa anteprima potrebbe non riflettere uno stato stabile del repository.");
  }
  report.businesses.forEach(function (b) {
    print("--- " + (b.slug || "(slug non derivabile)") + " ---");
    if (b.ineligibleReason) {
      print("  NON procederebbe: " + b.ineligibleReason);
      return;
    }
    print("  cartella: " + (b.directoryAction === "existing" ? "già esistente (--business)" : b.directoryAction));
    print("  output dist/: " + b.outputAction + (b.outputTrustedMatch ? " (provenienza corrispondente)" : ""));
    if (b.validation && b.validation.warnings && b.validation.warnings.length) {
      b.validation.warnings.forEach(function (w) { print("  avviso (decisione umana richiesta): " + w); });
    }
    print("  procederebbe con: import" + (b.kind === "business" || b.directoryAction === "resume" ? " (saltato)" : "") + " -> validate -> optimize-images -> build -> qa-preflight -> QA completa");
  });
  if (report.duplicateSlugs.length) {
    print("BLOCCO BATCH: slug duplicati tra le righe selezionate:");
    report.duplicateSlugs.forEach(function (d) { print("  - \"" + d.slug + "\" usato da più righe (indici " + d.indices.join(", ") + ")"); });
  }
  print("Nota: l'ottimizzazione immagini e il risultato della QA visiva non possono essere garantiti da un'anteprima — vengono verificati solo eseguendo realmente la pipeline.");
}

function printDuplicateSlugsError(duplicateSlugs, print) {
  print("Slug duplicati rilevati: esecuzione interrotta, nessuna attività è stata toccata.");
  duplicateSlugs.forEach(function (d) { print("  - \"" + d.slug + "\" usato da più righe (indici " + d.indices.join(", ") + ")"); });
}

function printBatchSummary(results, print) {
  var success = results.filter(function (r) { return r.status === "success"; });
  var failed = results.filter(function (r) { return r.status !== "success"; });
  results.forEach(function (r) {
    if (r.status === "success") {
      print("OK  " + r.slug + " -> " + r.distDir);
      (r.warnings || []).forEach(function (w) { print("     avviso: " + w); });
    } else {
      print("ERRORE " + r.slug + " [stage: " + r.stage + "]: " + r.message);
    }
  });
  print("Riepilogo: " + success.length + " completate, " + failed.length + " non riuscite (su " + results.length + ").");
}

// ---------- entry point condiviso ----------

/**
 * Default a ROOT SOLO quando opts.root è esattamente undefined. Un valore
 * esplicito non valido (non stringa, vuoto) fallisce subito con un errore
 * controllato — mai un fallback silenzioso (`opts.root || ROOT`) che
 * tratterebbe una stringa vuota o un bug del chiamante come "non fornito".
 */
function resolveOptRoot(opts) {
  if (opts.root === undefined) return ROOT;
  if (typeof opts.root !== "string" || opts.root.trim() === "") {
    throw usageError("opts.root non valido: deve essere un percorso non vuoto.");
  }
  return opts.root;
}

/**
 * Stessa logica di resolveOptRoot per opts.businessesRoot: default a
 * <root>/businesses SOLO se esattamente undefined, altrimenti il valore
 * esplicito deve essere una stringa non vuota o si fallisce subito, prima
 * di qualunque parsing/selezione/scrittura.
 */
function resolveOptBusinessesRoot(opts, root) {
  if (opts.businessesRoot === undefined) return path.join(root, "businesses");
  if (typeof opts.businessesRoot !== "string" || opts.businessesRoot.trim() === "") {
    throw usageError("opts.businessesRoot non valido: deve essere un percorso non vuoto.");
  }
  return opts.businessesRoot;
}

async function runNewLanding(argv, opts) {
  opts = opts || {};
  var root = resolveOptRoot(opts);
  var businessesRoot = resolveOptBusinessesRoot(opts, root);
  var stateRoot = opts.stateRoot || root;
  var print = opts.print || function (s) { console.log(s); };

  var args = parseArgs(argv);
  var selection = resolveInputSelection(args, { root: root, businessesRoot: businessesRoot });
  var preflightOpts = { root: root, businessesRoot: businessesRoot, stateRoot: stateRoot };

  if (args.dryRun) {
    var previewReport = runPreflight(selection, args, preflightOpts);
    printPreflightReport(previewReport, print, { lockPresent: lockExists(stateRoot) });
    return { dryRun: true, report: previewReport };
  }

  var lockHandle = acquireLock(stateRoot, selection.items.length > 1 ? "batch" : "single", selection.items.length);
  try {
    // Seam usato solo dai test per verificare che il preflight autoritativo
    // giri sempre a lock già acquisito (mai chiamato dal CLI reale).
    if (opts.onBeforePreflight) opts.onBeforePreflight();
    var report = runPreflight(selection, args, preflightOpts);

    if (report.duplicateSlugs.length) {
      printDuplicateSlugsError(report.duplicateSlugs, print);
      return { blocked: true, reason: "duplicate-slugs", report: report };
    }

    var results = [];
    for (var i = 0; i < report.businesses.length; i++) {
      var b = report.businesses[i];
      if (!b.eligible) {
        results.push({ slug: b.slug, status: "failed", stage: "preflight", message: b.ineligibleReason });
        continue;
      }
      var r = await executeOne(b, { root: root, businessesRoot: businessesRoot, stateRoot: stateRoot, qaRunner: opts.qaRunner, buildRunner: opts.buildRunner });
      results.push(r);
    }

    printBatchSummary(results, print);
    return { results: results };
  } finally {
    releaseLock(stateRoot, lockHandle.ownerToken);
  }
}

module.exports = {
  parseArgs: parseArgs,
  resolveInputSelection: resolveInputSelection,
  preflightOne: preflightOne,
  runPreflight: runPreflight,
  executeOne: executeOne,
  runNewLanding: runNewLanding,
  acquireLock: acquireLock,
  releaseLock: releaseLock,
  lockExists: lockExists,
  lockFilePath: lockFilePath,
  statePath: statePath,
  readState: readState,
  writeStateAtomic: writeStateAtomic,
  updateSlugState: updateSlugState,
  fingerprintOf: fingerprintOf,
  csvRowDescriptor: csvRowDescriptor,
  manualDirDescriptor: manualDirDescriptor,
  descriptorFromStoredProvenance: descriptorFromStoredProvenance,
  normalizeCsvSourcePath: normalizeCsvSourcePath,
  resolveOptRoot: resolveOptRoot,
  resolveOptBusinessesRoot: resolveOptBusinessesRoot
};

if (require.main === module) {
  runNewLanding(process.argv.slice(2))
    .then(function (outcome) {
      if (outcome.dryRun) {
        process.exit(0);
        return;
      }
      if (outcome.blocked) {
        process.exit(1);
        return;
      }
      var anyFailed = outcome.results.some(function (r) { return r.status !== "success"; });
      process.exit(anyFailed ? 1 : 0);
    })
    .catch(function (err) {
      console.error("Errore: " + err.message);
      process.exit(err.code === "LOCK_HELD" || err.code === "USAGE" ? 1 : 2);
    });
}
