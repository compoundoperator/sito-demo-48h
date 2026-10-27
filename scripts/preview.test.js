"use strict";

/**
 * Test della preparazione locale delle preview protette (scripts/preview.js).
 *
 * Dati interamente fittizi: copie temporanee della fixture committata
 * luce-beauty-studio (TEMPLATE_DEMO). Bundle, configurazione e registro
 * vivono in cartelle temporanee (opts.outRoot/configPath/registryPath):
 * questo file non scrive mai sotto dist/, dist-preview/, .landing-factory/
 * né businesses/. Unico prefisso slug usato: "smoke-preview-".
 */

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var os = require("os");
var childProcess = require("child_process");
var yaml = require("js-yaml");

var previewMod = require("./preview.js");

var ROOT = path.resolve(__dirname, "..");
var TEAM = "smoke-preview-team.cloudflareaccess.com";
var AUD = "0f".repeat(32);
var NOW = Date.parse("2026-10-27T12:00:00Z");
var DAY = 24 * 60 * 60 * 1000;

// Pattern che non devono mai comparire in un bundle (credenziali o chiavi).
var SECRET_PATTERNS = [
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /CLOUDFLARE_API_TOKEN|CF_API_TOKEN|CLOUDFLARE_API_KEY/,
  /api[_-]?token\s*["']?\s*[:=]/i,
  /password\s*["']?\s*[:=]/i,
  /"d"\s*:\s*"[A-Za-z0-9_-]{20,}"/ // componente privata di una JWK
];

function tmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-preview-" + label + "-"));
}

function rm(p) {
  if (p) fs.rmSync(p, { recursive: true, force: true });
}

function copyFixture(slug, mutate) {
  var dest = path.join(tmpDir("biz"), slug);
  fs.cpSync(path.join(ROOT, "businesses", "luce-beauty-studio"), dest, {
    recursive: true,
    filter: function (src) { return path.basename(src) !== "dist-ready"; }
  });
  var dataPath = path.join(dest, "data.yaml");
  var data = yaml.load(fs.readFileSync(dataPath, "utf8"));
  data.business.slug = slug;
  if (mutate) mutate(data);
  fs.writeFileSync(dataPath, yaml.dump(data), "utf8");
  return dest;
}

/** Ambiente temporaneo: outRoot, configurazione valida (sovrascrivibile) e registro. */
function makeEnv(config) {
  var base = tmpDir("env");
  var configPath = path.join(base, "preview-config.json");
  if (config !== null) {
    fs.writeFileSync(configPath, JSON.stringify(config || { access_team_domain: TEAM, access_aud: AUD }), "utf8");
  }
  return {
    base: base,
    opts: { outRoot: path.join(base, "out"), configPath: configPath, registryPath: path.join(base, "previews.json"), now: NOW }
  };
}

function listFiles(dir) {
  var out = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      var abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out.push(abs);
    });
  })(dir);
  return out;
}

test(".gitignore esclude dist-preview/ e .landing-factory/", function () {
  var lines = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8").split(/\r?\n/).map(function (l) { return l.trim(); });
  assert.ok(lines.indexOf("dist-preview/") !== -1, "dist-preview/");
  assert.ok(lines.indexOf(".landing-factory/") !== -1, ".landing-factory/");
});

test("modalità: PRODUCTION e modalità sconosciute rifiutate, TEMPLATE_DEMO e PRIVATE_DEMO ammesse", function () {
  assert.throws(function () { previewMod.assertPreviewMode("PRODUCTION"); }, /PRODUCTION/);
  [undefined, "", "production", "OTHER"].forEach(function (m) {
    assert.throws(function () { previewMod.assertPreviewMode(m); }, /non ammessa/, String(m));
  });
  previewMod.assertPreviewMode("TEMPLATE_DEMO");
  previewMod.assertPreviewMode("PRIVATE_DEMO");
});

test("bundle in PRODUCTION rifiutato senza scrivere nulla", function () {
  var biz = copyFixture("smoke-preview-prod", function (d) { d.mode = "PRODUCTION"; });
  var env = makeEnv();
  try {
    assert.throws(function () { previewMod.bundlePreview(biz, env.opts); }, /PRODUCTION/);
    assert.equal(fs.existsSync(env.opts.outRoot), false);
    assert.equal(fs.existsSync(env.opts.registryPath), false);
  } finally {
    rm(path.dirname(biz));
    rm(env.base);
  }
});

test("configurazione: mancante, chiavi extra, team domain o AUD non validi -> errore, nessuna scrittura", function () {
  var biz = copyFixture("smoke-preview-cfg");
  var cases = [
    [null, /mancante/],
    [{ access_team_domain: TEAM, access_aud: AUD, api_token: "x" }, /solo le chiavi/],
    [{ access_team_domain: TEAM }, /solo le chiavi/],
    [{ access_team_domain: "https://" + TEAM, access_aud: AUD }, /cloudflareaccess\.com/],
    [{ access_team_domain: "evil.example.com", access_aud: AUD }, /cloudflareaccess\.com/],
    [{ access_team_domain: TEAM + ".evil.com", access_aud: AUD }, /cloudflareaccess\.com/],
    [{ access_team_domain: TEAM, access_aud: AUD.toUpperCase() }, /AUD/],
    [{ access_team_domain: TEAM, access_aud: "abc" }, /AUD/]
  ];
  try {
    cases.forEach(function (c) {
      var env = makeEnv(c[0]);
      try {
        assert.throws(function () { previewMod.bundlePreview(biz, env.opts); }, c[1], JSON.stringify(c[0]));
        assert.equal(fs.existsSync(env.opts.outRoot), false);
        assert.equal(fs.existsSync(env.opts.registryPath), false);
      } finally {
        rm(env.base);
      }
    });
  } finally {
    rm(path.dirname(biz));
  }
});

test("scadenza: intero da 1 a 30 giorni, predefinita 7", function () {
  assert.equal(previewMod.parseDays(undefined), 7);
  assert.equal(previewMod.parseDays(1), 1);
  assert.equal(previewMod.parseDays("30"), 30);
  [0, 31, -1, 1.5, "1.5", "abc", "", "7d", null].forEach(function (bad) {
    assert.throws(function () { previewMod.parseDays(bad); }, /da 1 a 30/, String(bad));
  });
});

test("nome Worker: solo slug validi, mai traversal, entro 63 caratteri", function () {
  assert.equal(previewMod.workerNameFor("luce-beauty-studio"), "lf-preview-luce-beauty-studio");
  ["../x", "a/b", "A", "", "fine-", "x".repeat(53), null].forEach(function (bad) {
    assert.throws(function () { previewMod.workerNameFor(bad); }, String(bad));
  });
});

test("bundle: public noindex senza _headers, worker identico, wrangler.jsonc chiuso, registro senza dati personali", function () {
  var slug = "smoke-preview-luce";
  var biz = copyFixture(slug);
  var env = makeEnv();
  try {
    var res = previewMod.bundlePreview(biz, Object.assign({ expiresInDays: 3 }, env.opts));
    var root = path.join(env.opts.outRoot, slug);
    assert.equal(res.previewRoot, root);
    assert.equal(res.workerName, "lf-preview-" + slug);
    assert.deepEqual(fs.readdirSync(root).sort(), ["public", "worker.mjs", "wrangler.jsonc"]);

    var html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.equal(html.indexOf('rel="canonical"'), -1);
    assert.equal(fs.existsSync(path.join(root, "public", "_headers")), false);
    assert.equal(fs.readFileSync(path.join(root, "worker.mjs"), "utf8"),
      fs.readFileSync(path.join(ROOT, "preview", "worker", "index.mjs"), "utf8"));

    var conf = JSON.parse(fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));
    assert.equal(conf.name, "lf-preview-" + slug);
    assert.equal(conf.main, "worker.mjs");
    assert.equal(conf.workers_dev, true);
    assert.equal(conf.preview_urls, false);
    assert.deepEqual(conf.observability, { enabled: false });
    assert.deepEqual(conf.assets, { directory: "./public", binding: "ASSETS", run_worker_first: true });
    assert.deepEqual(conf.vars, {
      ACCESS_TEAM_DOMAIN: TEAM,
      ACCESS_AUD: AUD,
      PREVIEW_EXPIRES_AT: new Date(NOW + 3 * DAY).toISOString(),
      PREVIEW_STATUS: "active"
    });
    assert.equal(conf.routes, undefined, "nessuna route o dominio personalizzato");

    var reg = JSON.parse(fs.readFileSync(env.opts.registryPath, "utf8"));
    assert.deepEqual(Object.keys(reg.previews), [slug]);
    assert.deepEqual(Object.keys(reg.previews[slug]).sort(),
      ["created_at", "deleted_at", "expires_at", "mode", "revoked_at", "status", "worker_name"]);
    assert.equal(/@|email|ip/i.test(JSON.stringify(Object.keys(reg.previews[slug]))), false);
    assert.equal(reg.previews[slug].mode, "TEMPLATE_DEMO");

    // Nessun segreto in alcun file di testo del bundle.
    listFiles(root).filter(function (f) { return /\.(html|css|js|mjs|jsonc|svg|txt)$/.test(f); }).forEach(function (f) {
      var text = fs.readFileSync(f, "utf8");
      SECRET_PATTERNS.forEach(function (re) {
        assert.equal(re.test(text), false, path.relative(root, f) + " contiene " + re);
      });
    });

    // Isolamento: nulla scritto nelle cartelle reali del repository.
    assert.equal(fs.existsSync(path.join(ROOT, "dist", slug)), false);
    assert.equal(fs.existsSync(path.join(ROOT, "dist-preview", slug)), false);
  } finally {
    rm(path.dirname(biz));
    rm(env.base);
  }
});

test("revoca e eliminazione: stato revoked nel bundle, cartella rimossa, registro aggiornato", function () {
  var slug = "smoke-preview-revoke";
  var biz = copyFixture(slug);
  var env = makeEnv();
  try {
    previewMod.bundlePreview(biz, env.opts);
    var later = Object.assign({}, env.opts, { now: NOW + DAY });

    previewMod.revokePreview(slug, later);
    var conf = JSON.parse(fs.readFileSync(path.join(env.opts.outRoot, slug, "wrangler.jsonc"), "utf8"));
    assert.equal(conf.vars.PREVIEW_STATUS, "revoked");
    var entry = JSON.parse(fs.readFileSync(env.opts.registryPath, "utf8")).previews[slug];
    assert.equal(entry.status, "revoked");
    assert.equal(entry.revoked_at, new Date(NOW + DAY).toISOString());

    previewMod.deletePreview(slug, later);
    assert.equal(fs.existsSync(path.join(env.opts.outRoot, slug)), false);
    entry = JSON.parse(fs.readFileSync(env.opts.registryPath, "utf8")).previews[slug];
    assert.equal(entry.status, "deleted");
    assert.equal(entry.deleted_at, new Date(NOW + DAY).toISOString());

    assert.throws(function () { previewMod.revokePreview(slug, later); }, /Nessun bundle/);
    assert.throws(function () { previewMod.deletePreview("smoke-preview-ignota", later); }, /Nessuna preview/);
    assert.throws(function () { previewMod.deletePreview("../fuori", later); });
  } finally {
    rm(path.dirname(biz));
    rm(env.base);
  }
});

test("CLI: comandi, flag e cartelle non ammessi falliscono con codice 2", function () {
  var outside = tmpDir("cli");
  try {
    [[], ["deploy"], ["bundle"], ["bundle", "--business"], ["bundle", "--business", "../package.json"],
      ["bundle", "--business", outside], ["bundle", "--business", "businesses/luce-beauty-studio", "--force", "x"],
      ["bundle", "--business", "businesses/luce-beauty-studio", "--business", "businesses/luce-beauty-studio"],
      ["revoke"], ["revoke", "--slug"], ["delete", "--business", "x"]]
      .forEach(function (args) {
        var r = childProcess.spawnSync(process.execPath, [path.join(ROOT, "scripts", "preview.js")].concat(args), { cwd: ROOT, encoding: "utf8" });
        assert.equal(r.status, 2, args.join(" ") + " -> " + r.stderr);
      });
  } finally {
    rm(outside);
  }
});
