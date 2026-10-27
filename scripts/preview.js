"use strict";

/**
 * Preview protette (INCREMENT-05) — preparazione locale, mai deploy.
 *
 *   node scripts/preview.js bundle --business businesses/<slug> [--expires-in-days N]
 *   node scripts/preview.js revoke --slug <slug>
 *   node scripts/preview.js delete --slug <slug>
 *
 * `bundle` genera dist-preview/<slug>/ (gitignored): public/ (build noindex),
 * worker.mjs (gate Access, copia di preview/worker/index.mjs) e
 * wrangler.jsonc. Il deploy, la creazione dell'applicazione Access e ogni
 * altra operazione Cloudflare restano passi manuali dell'operatore, ciascuno
 * autorizzato a parte: questo script non usa mai la rete.
 *
 * Configurazione locale obbligatoria (gitignored, scritta dall'operatore):
 * .landing-factory/preview-config.json con SOLO due chiavi, entrambe
 * identificativi e non segreti:
 *   { "access_team_domain": "<team>.cloudflareaccess.com", "access_aud": "<64 hex>" }
 * Qualunque altra chiave è rifiutata (nessun token o password vi va mai scritto).
 *
 * Registro locale: .landing-factory/previews.json — solo slug, nome del
 * Worker, modalità, stato e timestamp. Mai email, IP o dati personali.
 */

var fs = require("fs");
var path = require("path");

var buildMod = require("./build.js");
var validateMod = require("./validate.js");
var pathsUtil = require("./security/paths.js");

var ROOT = path.resolve(__dirname, "..");
var WORKER_SRC = path.join(ROOT, "preview", "worker", "index.mjs");
var DEFAULTS = {
  outRoot: path.join(ROOT, "dist-preview"),
  configPath: path.join(ROOT, ".landing-factory", "preview-config.json"),
  registryPath: path.join(ROOT, ".landing-factory", "previews.json")
};

// Stesse regole del Worker (preview/worker/index.mjs): un test ne verifica l'identità.
var TEAM_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
var AUD_RE = /^[a-f0-9]{64}$/;

var COMPATIBILITY_DATE = "2026-09-01";
var WORKER_PREFIX = "lf-preview-";
var DEFAULT_DAYS = 7;
var MAX_DAYS = 30;
var ALLOWED_MODES = ["TEMPLATE_DEMO", "PRIVATE_DEMO"];

function resolveOpts(opts) {
  opts = opts || {};
  var out = {
    outRoot: opts.outRoot || DEFAULTS.outRoot,
    configPath: opts.configPath || DEFAULTS.configPath,
    registryPath: opts.registryPath || DEFAULTS.registryPath,
    now: opts.now !== undefined ? opts.now : Date.now()
  };
  ["outRoot", "configPath", "registryPath"].forEach(function (k) {
    if (typeof out[k] !== "string" || !path.isAbsolute(out[k])) throw new Error("opts." + k + " deve essere un percorso assoluto");
  });
  return out;
}

/** Solo TEMPLATE_DEMO e PRIVATE_DEMO: una build PRODUCTION non diventa mai una preview. */
function assertPreviewMode(mode) {
  if (mode === "PRODUCTION") {
    throw new Error("Preview non ammessa in modalità PRODUCTION: usare TEMPLATE_DEMO o PRIVATE_DEMO.");
  }
  if (ALLOWED_MODES.indexOf(mode) === -1) {
    throw new Error("Modalità non ammessa per una preview: " + mode);
  }
}

function loadPreviewConfig(configPath) {
  var raw;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (err) {
    throw new Error("Configurazione preview mancante: " + path.relative(ROOT, configPath) +
      " (vedi RUNBOOK.md, sezione \"Preview protetta\")");
  }
  var cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    throw new Error("Configurazione preview non è JSON valido");
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) throw new Error("Configurazione preview non valida");
  var keys = Object.keys(cfg).sort();
  if (keys.join(",") !== "access_aud,access_team_domain") {
    throw new Error("Configurazione preview: ammesse solo le chiavi access_team_domain e access_aud");
  }
  if (typeof cfg.access_team_domain !== "string" || !TEAM_DOMAIN_RE.test(cfg.access_team_domain)) {
    throw new Error("access_team_domain deve avere la forma <team>.cloudflareaccess.com");
  }
  if (typeof cfg.access_aud !== "string" || !AUD_RE.test(cfg.access_aud)) {
    throw new Error("access_aud deve essere il tag AUD dell'applicazione Access (64 caratteri esadecimali minuscoli)");
  }
  return { teamDomain: cfg.access_team_domain, aud: cfg.access_aud };
}

function parseDays(value) {
  if (value === undefined) return DEFAULT_DAYS;
  var n = typeof value === "number" ? value : (/^\d+$/.test(String(value)) ? parseInt(value, 10) : NaN);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) {
    throw new Error("--expires-in-days deve essere un intero da 1 a " + MAX_DAYS);
  }
  return n;
}

function workerNameFor(slug) {
  if (!pathsUtil.isValidId(slug)) throw new Error("slug non valido: " + slug);
  var name = WORKER_PREFIX + slug;
  if (name.length > 63 || /-$/.test(name)) throw new Error("slug troppo lungo o non valido per un nome Worker: " + slug);
  return name;
}

function wranglerConfig(workerName, cfg, expiresAt, status) {
  return {
    name: workerName,
    main: "worker.mjs",
    compatibility_date: COMPATIBILITY_DATE,
    workers_dev: true,
    preview_urls: false,
    observability: { enabled: false },
    assets: { directory: "./public", binding: "ASSETS", run_worker_first: true },
    vars: {
      ACCESS_TEAM_DOMAIN: cfg.teamDomain,
      ACCESS_AUD: cfg.aud,
      PREVIEW_EXPIRES_AT: expiresAt,
      PREVIEW_STATUS: status
    }
  };
}

function readRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) return { version: 1, previews: {} };
  var reg = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!reg || reg.version !== 1 || typeof reg.previews !== "object") throw new Error("Registro preview non valido: " + registryPath);
  return reg;
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  var tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function updateRegistry(registryPath, slug, fields) {
  var reg = readRegistry(registryPath);
  var entry = reg.previews[slug] || {};
  Object.keys(fields).forEach(function (k) { entry[k] = fields[k]; });
  reg.previews[slug] = entry;
  writeJsonAtomic(registryPath, reg);
  return entry;
}

/**
 * Prepara dist-preview/<slug>/ per una singola attività. Tutti i controlli
 * (modalità, configurazione, scadenza, slug) avvengono prima di scrivere.
 */
function bundlePreview(businessDir, opts) {
  var o = resolveOpts(opts);
  var days = parseDays(opts && opts.expiresInDays);

  var data = validateMod.loadBusinessData(businessDir);
  if (!data || typeof data !== "object") throw new Error("data.yaml illeggibile in " + businessDir);
  assertPreviewMode(data.mode);
  var cfg = loadPreviewConfig(o.configPath);
  var slug = data.business && data.business.slug;
  var workerName = workerNameFor(slug);
  var validation = validateMod.validateBusinessDir(businessDir);
  if (!validation.valid) {
    throw new Error("Validazione fallita per " + businessDir + ":\n  - " + validation.errors.join("\n  - "));
  }

  var previewRoot = path.join(o.outRoot, slug);
  fs.rmSync(previewRoot, { recursive: true, force: true });
  var publicDir = path.join(previewRoot, "public");
  var build = buildMod.buildBusiness(businessDir, { distDir: publicDir, forceNoindex: true });
  // Gli header li imposta il Worker (run_worker_first): nessun _headers servito o interpretato.
  fs.rmSync(path.join(publicDir, "_headers"), { force: true });

  fs.copyFileSync(WORKER_SRC, path.join(previewRoot, "worker.mjs"));
  var expiresAt = new Date(o.now + days * 24 * 60 * 60 * 1000).toISOString();
  writeJsonAtomic(path.join(previewRoot, "wrangler.jsonc"), wranglerConfig(workerName, cfg, expiresAt, "active"));

  updateRegistry(o.registryPath, slug, {
    worker_name: workerName,
    mode: data.mode,
    status: "active",
    created_at: new Date(o.now).toISOString(),
    expires_at: expiresAt,
    revoked_at: null,
    deleted_at: null
  });

  return { slug: slug, workerName: workerName, previewRoot: previewRoot, expiresAt: expiresAt, warnings: build.warnings };
}

/** Imposta PREVIEW_STATUS=revoked nel bundle: al prossimo deploy il Worker risponde 410. */
function revokePreview(slug, opts) {
  var o = resolveOpts(opts);
  workerNameFor(slug);
  var configFile = path.join(o.outRoot, slug, "wrangler.jsonc");
  if (!fs.existsSync(configFile)) throw new Error("Nessun bundle preview per " + slug);
  var conf = JSON.parse(fs.readFileSync(configFile, "utf8"));
  conf.vars.PREVIEW_STATUS = "revoked";
  writeJsonAtomic(configFile, conf);
  return updateRegistry(o.registryPath, slug, { status: "revoked", revoked_at: new Date(o.now).toISOString() });
}

/** Elimina il bundle locale e lo registra come eliminato (il Worker remoto si elimina con wrangler delete). */
function deletePreview(slug, opts) {
  var o = resolveOpts(opts);
  workerNameFor(slug);
  var previewRoot = path.join(o.outRoot, slug);
  if (!fs.existsSync(previewRoot) && !readRegistry(o.registryPath).previews[slug]) {
    throw new Error("Nessuna preview registrata per " + slug);
  }
  fs.rmSync(previewRoot, { recursive: true, force: true });
  return updateRegistry(o.registryPath, slug, { status: "deleted", deleted_at: new Date(o.now).toISOString() });
}

function parseCliArgs(argv) {
  var cmd = argv[0];
  var rest = argv.slice(1);
  var allowed = { bundle: ["--business", "--expires-in-days"], revoke: ["--slug"], delete: ["--slug"] };
  if (!Object.prototype.hasOwnProperty.call(allowed, cmd)) return { error: "Comando sconosciuto: " + (cmd || "(nessuno)") };
  var args = {};
  for (var i = 0; i < rest.length; i += 2) {
    var flag = rest[i];
    var value = rest[i + 1];
    if (allowed[cmd].indexOf(flag) === -1) return { error: "Flag non riconosciuto per " + cmd + ": " + flag };
    if (value === undefined || value.indexOf("--") === 0) return { error: flag + " richiede un valore" };
    if (Object.prototype.hasOwnProperty.call(args, flag)) return { error: flag + " ripetuto" };
    args[flag] = value;
  }
  if (cmd === "bundle" && !args["--business"]) return { error: "bundle richiede --business businesses/<slug>" };
  if (cmd !== "bundle" && !args["--slug"]) return { error: cmd + " richiede --slug <slug>" };
  return { cmd: cmd, args: args };
}

module.exports = {
  TEAM_DOMAIN_RE, AUD_RE, assertPreviewMode, loadPreviewConfig, parseDays, workerNameFor,
  bundlePreview, revokePreview, deletePreview, parseCliArgs
};

if (require.main === module) {
  var cli = parseCliArgs(process.argv.slice(2));
  if (cli.error) {
    console.error("ERRORE: " + cli.error);
    console.error("Uso: node scripts/preview.js bundle --business businesses/<slug> [--expires-in-days N]");
    console.error("     node scripts/preview.js revoke --slug <slug> | delete --slug <slug>");
    process.exit(2);
  }
  try {
    if (cli.cmd === "bundle") {
      var dir = pathsUtil.resolveBusinessesDir(cli.args["--business"], path.join(ROOT, "businesses"));
      if (!dir) {
        console.error("ERRORE: --business accetta solo una cartella reale direttamente sotto businesses/");
        process.exit(2);
      }
      var res = bundlePreview(dir, { expiresInDays: cli.args["--expires-in-days"] });
      console.log("OK  preview " + res.slug + " -> " + path.relative(ROOT, res.previewRoot) + " (Worker " + res.workerName + ", scade " + res.expiresAt + ")");
      res.warnings.forEach(function (w) { console.log("     avviso: " + w); });
      console.log("     Nessun deploy eseguito. Il deploy è un passo manuale autorizzato a parte (RUNBOOK.md).");
    } else if (cli.cmd === "revoke") {
      revokePreview(cli.args["--slug"]);
      console.log("OK  preview " + cli.args["--slug"] + " revocata nel bundle locale: ridistribuire e revocare i token Access (RUNBOOK.md).");
    } else {
      deletePreview(cli.args["--slug"]);
      console.log("OK  bundle locale di " + cli.args["--slug"] + " eliminato: eliminare anche il Worker remoto (RUNBOOK.md).");
    }
    process.exit(0);
  } catch (err) {
    console.error("ERRORE preview: " + err.message);
    process.exit(1);
  }
}
