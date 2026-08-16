"use strict";

/**
 * scripts/import-csv.js
 *
 * Crea uno SCAFFOLD di businesses/<slug>/data.yaml a partire da una riga
 * di un file CSV, secondo una mappatura colonna -> campo (vedi
 * column-mapping.example.yaml). Non genera mai una landing pronta al
 * build: riempie solo i campi semplici realmente presenti nella riga,
 * lascia foto e recensioni vuote, e marca con il sentinel
 * "TODO_COMPLETARE" i campi obbligatori (schema) di provenienza che
 * nessuna colonna può compilare in modo affidabile — così
 * `npm run validate` fallisce in modo chiaro finché un operatore umano
 * non li completa, invece di inventare un valore plausibile.
 *
 * Uso:
 *   node scripts/import-csv.js --file fixtures/leads-example.csv \
 *     --mapping column-mapping.example.yaml --row 2 [--slug mio-slug] [--force]
 *   node scripts/import-csv.js --file fixtures/leads-example.csv --list [--priority high]
 */

var fs = require("fs");
var path = require("path");
var yaml = require("js-yaml");
var pathsUtil = require("./security/paths.js");

var ROOT = path.resolve(__dirname, "..");
var TODO = "TODO_COMPLETARE";

var PRIORITY_ALIASES = {
  alta: "high", high: "high",
  media: "medium", medium: "medium",
  bassa: "low", low: "low"
};

/** Parser CSV minimale ma corretto per campi tra virgolette con virgole/virgolette escaped (""). */
function parseCsv(text) {
  var rows = [];
  var row = [];
  var field = "";
  var inQuotes = false;
  var i = 0;
  function endField() { row.push(field); field = ""; }
  function endRow() { endField(); rows.push(row); row = []; }

  while (i < text.length) {
    var c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { endField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { endRow(); i++; continue; }
    field += c;
    i++;
  }
  if (field.length || row.length) endRow();
  return rows.filter(function (r) { return !(r.length === 1 && r[0] === ""); });
}

function readRowsAsObjects(csvText) {
  var table = parseCsv(csvText);
  if (!table.length) return [];
  var header = table[0];
  return table.slice(1).map(function (r) {
    var obj = {};
    header.forEach(function (h, i) { obj[h] = r[i] !== undefined ? r[i] : ""; });
    return obj;
  });
}

/** Imposta obj.a.b[0].c = value, creando oggetti/array intermedi se necessario. */
function setPath(obj, pathExpr, value) {
  var tokens = [];
  pathExpr.split(".").forEach(function (part) {
    var m = part.match(/^([a-zA-Z_]+)(\[(\d+)\])?$/);
    if (!m) throw new Error("percorso non valido nella mappatura: " + pathExpr);
    tokens.push(m[1]);
    if (m[3] !== undefined) tokens.push(Number(m[3]));
  });
  var cur = obj;
  for (var i = 0; i < tokens.length - 1; i++) {
    var key = tokens[i];
    var nextKey = tokens[i + 1];
    var nextIsIndex = typeof nextKey === "number";
    if (cur[key] === undefined || cur[key] === null) {
      cur[key] = nextIsIndex ? [] : {};
    }
    cur = cur[key];
  }
  cur[tokens[tokens.length - 1]] = value;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildSkeleton() {
  return {
    category: TODO,
    template_id: TODO,
    preset_id: TODO,
    lead_id: null,
    priority: "medium",
    source_file: null,
    source_row: null,
    mode: TODO,
    business: {
      name: TODO,
      slug: TODO,
      logo: null,
      tagline: null,
      intro: null,
      address: null,
      hours: null,
      phone_display: null,
      eyebrow: null,
      trust_stats: null,
      whatsapp: { number: null, default_message: null },
      social: { instagram: null, facebook: null },
      content_origin: TODO,
      source_url: null,
      source_channel: null,
      captured_at: null,
      private_demo_status: TODO,
      publication_status: TODO,
      internal_notes: null,
      canonical_url: null
    },
    services: [],
    strengths: [],
    atmosfera: [],
    photos: [],
    reviews: [],
    faq: [],
    contact_form: { endpoint: null },
    disclaimers: { demo_banner: "Concept commerciale non ufficiale, preparato per il titolare." }
  };
}

function applyMapping(skeleton, mapping, row, meta) {
  var data = skeleton;
  Object.keys(mapping.constants || {}).forEach(function (fieldPath) {
    setPath(data, fieldPath, mapping.constants[fieldPath]);
  });
  Object.keys(mapping.columns || {}).forEach(function (header) {
    var fieldPath = mapping.columns[header];
    var raw = row[header];
    if (raw === undefined || raw === null || String(raw).trim() === "") return; // colonna vuota: non si inventa nulla
    var value = String(raw).trim();
    if (fieldPath === "priority") {
      var normalized = PRIORITY_ALIASES[value.toLowerCase()];
      if (!normalized) {
        console.warn('Valore di priorità non riconosciuto "' + value + '" (colonna "' + header + '"): campo lasciato al default.');
        return;
      }
      value = normalized;
    }
    if (/price_from$/.test(fieldPath)) {
      var num = Number(value.replace(",", "."));
      value = isNaN(num) ? value : num;
    }
    setPath(data, fieldPath, value);
  });

  data.source_file = meta.sourceFile;
  data.source_row = meta.sourceRow;
  if (data.business.name && data.business.name !== TODO) {
    data.business.slug = meta.slug;
  }
  data.lead_id = meta.slug ? meta.slug.toUpperCase() + "-" + meta.sourceRow : null;

  return data;
}

/**
 * opts.root controlla SOLO la normalizzazione di provenienza (source_file),
 * mai il percorso della cartella business: default alla costante ROOT del
 * modulo se non fornito esplicitamente. Un valore esplicito non valido
 * (non stringa, vuoto) fa fallire subito con un errore chiaro — mai un
 * fallback silenzioso che nasconderebbe un bug del chiamante.
 */
function resolveImportRoot(opts) {
  if (opts.root === undefined) return ROOT;
  if (typeof opts.root !== "string" || opts.root.trim() === "") {
    throw new Error("opts.root non valido: deve essere un percorso non vuoto.");
  }
  return opts.root;
}

/**
 * opts.businessesRoot controlla SOLO dove viene scritta/cercata la
 * cartella business: default a <effectiveRoot>/businesses se non fornito
 * esplicitamente (stessa formula già usata da new-landing.js). Indipendente
 * da opts.root: new-landing.js passa qui la propria businessesRoot già
 * autoritativa (la stessa usata dal preflight), mai ri-derivata da root.
 */
function resolveImportBusinessesRoot(opts, effectiveRoot) {
  if (opts.businessesRoot === undefined) return path.join(effectiveRoot, "businesses");
  if (typeof opts.businessesRoot !== "string" || opts.businessesRoot.trim() === "") {
    throw new Error("opts.businessesRoot non valido: deve essere un percorso non vuoto.");
  }
  return opts.businessesRoot;
}

function importRow(opts) {
  var root = resolveImportRoot(opts);
  var businessesRoot = resolveImportBusinessesRoot(opts, root);

  var csvText = fs.readFileSync(opts.file, "utf8");
  var rows = readRowsAsObjects(csvText);
  if (opts.row < 1 || opts.row > rows.length) {
    throw new Error("Riga " + opts.row + " non trovata (il file ha " + rows.length + " righe di dati).");
  }
  var row = rows[opts.row - 1];
  var mapping = yaml.load(fs.readFileSync(opts.mapping, "utf8"));

  var nameHeader = Object.keys(mapping.columns || {}).find(function (h) { return mapping.columns[h] === "business.name"; });
  var derivedName = nameHeader ? row[nameHeader] : null;
  var slug = opts.slug || (derivedName ? slugify(derivedName) : null);
  if (!slug || !pathsUtil.isValidId(slug)) {
    throw new Error("Impossibile derivare uno slug valido: specificare --slug esplicitamente.");
  }

  // Stesso helper usato dal preflight di new-landing.js (mai una coppia
  // existsSync+lstatSync duplicata qui): ri-validato appena prima della
  // scrittura, così un collegamento simbolico introdotto dopo il preflight
  // viene comunque rifiutato. force/--overwrite-business/--resume-existing
  // non possono mai bypassare un risultato null: quel controllo avviene
  // solo DOPO.
  var candidate = pathsUtil.resolveBusinessSlugDir(businessesRoot, slug);
  if (!candidate) {
    throw new Error("businesses/" + slug + " non è un percorso ammissibile (collegamento simbolico, radice non valida, o fuori da businessesRoot).");
  }
  if (candidate.exists && !opts.force) {
    throw new Error("businesses/" + slug + " esiste già. Usa --force per sovrascrivere esplicitamente (mai automatico).");
  }
  var businessDir = candidate.path;

  var skeleton = buildSkeleton();
  var data = applyMapping(skeleton, mapping, row, {
    sourceFile: path.relative(root, path.resolve(opts.file)),
    sourceRow: opts.row,
    slug: slug
  });

  fs.mkdirSync(path.join(businessDir, "dossier", "photos"), { recursive: true });
  fs.mkdirSync(path.join(businessDir, "dossier", "reviews"), { recursive: true });
  fs.writeFileSync(path.join(businessDir, "dossier", "photos", ".gitkeep"), "Cartella vuota: nessuna foto importata automaticamente.\n");
  fs.writeFileSync(path.join(businessDir, "dossier", "reviews", ".gitkeep"), "Cartella vuota: nessuna recensione importata automaticamente.\n");

  var header = "# Scaffold generato da scripts/import-csv.js — INCOMPLETO.\n" +
    "# I campi con valore \"" + TODO + "\" non possono essere dedotti dal CSV e vanno\n" +
    "# completati a mano (provenienza, modalità, ecc.) prima di eseguire il build.\n" +
    "# npm run validate -- businesses/" + slug + "  mostrerà esattamente cosa manca.\n\n";
  fs.writeFileSync(path.join(businessDir, "data.yaml"), header + yaml.dump(data, { lineWidth: 100 }), "utf8");

  return { slug: slug, businessDir: businessDir, data: data };
}

function listRows(file, priorityFilter, mapping) {
  var csvText = fs.readFileSync(file, "utf8");
  var rows = readRowsAsObjects(csvText);
  var priorityHeader = mapping && Object.keys(mapping.columns || {}).find(function (h) { return mapping.columns[h] === "priority"; });
  return rows
    .map(function (row, i) {
      var rawPriority = priorityHeader ? row[priorityHeader] : "";
      var normalized = PRIORITY_ALIASES[String(rawPriority).toLowerCase()] || null;
      return { rowNumber: i + 1, row: row, priority: normalized };
    })
    .filter(function (entry) { return !priorityFilter || entry.priority === priorityFilter; });
}

module.exports = { parseCsv, readRowsAsObjects, setPath, slugify, buildSkeleton, applyMapping, importRow, listRows, TODO, PRIORITY_ALIASES };

if (require.main === module) {
  var args = process.argv.slice(2);
  function getArg(name) {
    var i = args.indexOf("--" + name);
    return i !== -1 ? args[i + 1] : undefined;
  }
  var hasFlag = function (name) { return args.indexOf("--" + name) !== -1; };

  var file = getArg("file");
  if (!file) {
    console.error("Uso: node scripts/import-csv.js --file <csv> --mapping <mapping.yaml> --row N [--slug s] [--force]");
    console.error("     node scripts/import-csv.js --file <csv> --list [--mapping <mapping.yaml>] [--priority high]");
    process.exit(2);
  }

  try {
    if (hasFlag("list")) {
      var mappingForList = getArg("mapping") ? yaml.load(fs.readFileSync(getArg("mapping"), "utf8")) : null;
      var entries = listRows(file, getArg("priority"), mappingForList);
      entries.forEach(function (e) {
        console.log(e.rowNumber + ". " + JSON.stringify(e.row) + (e.priority ? " [priority=" + e.priority + "]" : ""));
      });
      process.exit(0);
    }

    var mappingPath = getArg("mapping");
    var rowNum = Number(getArg("row"));
    if (!mappingPath || !rowNum) {
      console.error("--mapping e --row sono obbligatori (fuori dalla modalità --list).");
      process.exit(2);
    }
    var result = importRow({ file: file, mapping: mappingPath, row: rowNum, slug: getArg("slug"), force: hasFlag("force") });
    console.log("Scaffold creato: businesses/" + result.slug + "/data.yaml");
    console.log("Esegui ora: npm run validate -- businesses/" + result.slug);
  } catch (err) {
    console.error("Errore import: " + err.message);
    process.exit(1);
  }
}
