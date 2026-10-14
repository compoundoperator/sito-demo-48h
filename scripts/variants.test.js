"use strict";

/**
 * Test delle direzioni visive (preset con layer strutturale) e del portale
 * comparativo locale — scripts/build.js (resolveTemplate, buildBusiness con
 * opts, buildVariants) e scripts/variants-portal.js.
 *
 * Dati interamente fittizi: copie temporanee delle fixture committate
 * (TEMPLATE_DEMO / fictional_demo). Ogni output va in cartelle temporanee
 * (opts.distDir / opts.outRoot): questo file non scrive mai sotto dist/,
 * dist-variants/ né businesses/. Unico prefisso slug usato: "smoke-variants-".
 */

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var os = require("os");
var crypto = require("crypto");
var childProcess = require("child_process");
var yaml = require("js-yaml");

var buildMod = require("./build.js");
var qaMod = require("./qa-screenshots.js");
var registry = require("../templates/registry.json");

var ROOT = path.resolve(__dirname, "..");
var BASELINE = require("../fixtures/baselines/standard-build-01b251e.json");
var BW = "beauty-wellness-v1";
var DIRECTIONS = ["trusted-classic", "modern-premium", "distinctive-bold"];

// ---------- helper ----------

function tmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), "landing-factory-variants-" + label + "-"));
}

/** Copia una fixture committata in una cartella temporanea, senza dist-ready/. */
function copyFixture(name, mutate) {
  var dest = path.join(tmpDir("biz"), name);
  fs.cpSync(path.join(ROOT, "businesses", name), dest, {
    recursive: true,
    filter: function (src) { return path.basename(src) !== "dist-ready"; }
  });
  if (mutate) {
    var dataPath = path.join(dest, "data.yaml");
    var data = yaml.load(fs.readFileSync(dataPath, "utf8"));
    mutate(data);
    fs.writeFileSync(dataPath, yaml.dump(data), "utf8");
  }
  return dest;
}

function hashTree(dir) {
  var acc = {};
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true })
      .sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; })
      .forEach(function (e) {
        var abs = path.join(d, e.name);
        if (e.isDirectory()) walk(abs);
        else acc[path.relative(dir, abs).split(path.sep).join("/")] = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
      });
  })(dir);
  return acc;
}

function rm(p) {
  if (p) fs.rmSync(p, { recursive: true, force: true });
}

function themeColorOf(html) {
  var m = html.match(/<meta name="theme-color" content="([^"]+)">/);
  return m ? m[1] : null;
}

/** Variabili :root di un tokens.css, con var(--x) risolte ricorsivamente. */
function readTokens(file) {
  var css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  var raw = {};
  var re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
  var m;
  while ((m = re.exec(css))) raw[m[1]] = m[2].trim();
  function resolve(name, depth) {
    var v = raw[name];
    if (v === undefined || depth > 10) return undefined;
    var ref = v.match(/^var\((--[a-z0-9-]+)\)$/);
    return ref ? resolve(ref[1], depth + 1) : v;
  }
  var out = {};
  Object.keys(raw).forEach(function (k) { out[k] = resolve(k, 0); });
  return out;
}

function luminance(hex) {
  var h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
  return [0, 2, 4]
    .map(function (i) {
      var c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce(function (acc, c, i) { return acc + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
}

function contrast(a, b) {
  var la = luminance(a);
  var lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Regole CSS (selettore normalizzato -> dichiarazioni) di un layer, incluse quelle in @media. */
function cssRules(file) {
  var css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  var rules = {};
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  while ((m = re.exec(css))) {
    var selector = m[1].replace(/@media[^{]*$/, "").trim().replace(/\s+/g, " ");
    var decls = rules[selector] || (rules[selector] = {});
    m[2].split(";").forEach(function (d) {
      var i = d.indexOf(":");
      if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    });
  }
  return rules;
}

function presetFile(id, name) {
  return path.join(ROOT, "templates", BW, "presets", id, name);
}

function assertPairwiseDistinct(label, valuesById) {
  var ids = Object.keys(valuesById);
  for (var i = 0; i < ids.length; i++) {
    for (var j = i + 1; j < ids.length; j++) {
      assert.notEqual(
        JSON.stringify(valuesById[ids[i]]),
        JSON.stringify(valuesById[ids[j]]),
        label + ": " + ids[i] + " e " + ids[j] + " non devono coincidere"
      );
    }
  }
}

// Coppie testo/sfondo realmente usate da base.css, theme.css e dai layer.
var CONTRAST_PAIRS = [
  ["--color-ink", "--color-bg"], ["--color-ink", "--color-surface"], ["--color-ink", "--color-bg-alt"],
  ["--color-ink-soft", "--color-bg"], ["--color-ink-soft", "--color-surface"], ["--color-ink-soft", "--color-bg-alt"],
  ["--color-accent", "--color-bg"], ["--color-accent", "--color-surface"], ["--color-accent", "--color-bg-alt"],
  ["--color-on-accent", "--color-accent"], ["--color-on-accent", "--color-accent-strong"],
  ["--color-bg", "--color-ink"], ["--color-gold", "--color-ink"], ["--color-ink", "--color-gold"],
  ["--color-ink", "--color-whatsapp"], ["--color-ink", "--color-whatsapp-deep"],
  ["--color-sage-deep", "--color-bg"], ["--color-sage-deep", "--color-surface"],
  ["--color-gold-deep", "--color-bg"], ["--color-gold-deep", "--color-bg-alt"],
  ["--color-bg", "--color-accent-base"], ["--color-bg", "--color-atmosfera-tone2-a"], ["--color-bg", "--color-sage"]
];

function contrastReport(tokensPath) {
  var tokens = readTokens(tokensPath);
  return CONTRAST_PAIRS.map(function (pair) {
    var fg = tokens[pair[0]];
    var bg = tokens[pair[1]];
    if (!fg || !bg || fg[0] !== "#" || bg[0] !== "#") return { pair: pair, ratio: null };
    return { pair: pair, ratio: contrast(fg, bg) };
  });
}

// ---------- 1. preset sconosciuti o malevoli ----------

test("resolveTemplate rifiuta preset sconosciuti, malformati o con path traversal", function () {
  ["unknown", "../default", "default/../../etc", "..%2fdefault", "%2e%2e", "DEFAULT", "trusted-classic/", "", null, undefined, 42]
    .forEach(function (bad) {
      assert.throws(function () { buildMod.resolveTemplate(BW, bad); }, /preset_id non registrato/, String(bad));
    });
  // Un preset di un'altra famiglia non è valido qui.
  assert.throws(function () { buildMod.resolveTemplate("trades-v1", "trusted-classic"); }, /preset_id non registrato/);
});

test("buildBusiness rifiuta un presetId non registrato senza scrivere output", function () {
  var biz = copyFixture("luce-beauty-studio", function (d) { d.business.slug = "smoke-variants-reject"; });
  var out = path.join(tmpDir("reject"), "out");
  try {
    assert.throws(function () { buildMod.buildBusiness(biz, { presetId: "../../etc", distDir: out }); }, /preset_id non registrato/);
    assert.equal(fs.existsSync(out), false);
    assert.throws(function () { buildMod.buildBusiness(biz, { distDir: "relativo/out" }); }, /percorso assoluto/);
  } finally {
    rm(path.dirname(biz));
    rm(path.dirname(out));
  }
});

test("buildVariants: PRODUCTION rifiutata, famiglia senza varianti rifiutata", function () {
  var prod = copyFixture("luce-beauty-studio", function (d) { d.mode = "PRODUCTION"; d.business.slug = "smoke-variants-prod"; });
  var trades = copyFixture("minimal-trades-demo", function (d) { d.business.slug = "smoke-variants-trades"; });
  var outRoot = tmpDir("refuse");
  try {
    assert.throws(function () { buildMod.buildVariants(prod, { outRoot: outRoot }); }, /PRODUCTION/);
    assert.throws(function () { buildMod.buildVariants(trades, { outRoot: outRoot }); }, /Nessuna variante registrata/);
    assert.deepEqual(fs.readdirSync(outRoot), []);
  } finally {
    rm(path.dirname(prod));
    rm(path.dirname(trades));
    rm(outRoot);
  }
});

test("registry: ogni variante è un preset registrato, con tokens.css, layer.css e theme_color hex", function () {
  var entry = registry[BW];
  assert.deepEqual(entry.variants, DIRECTIONS);
  DIRECTIONS.forEach(function (id) {
    assert.ok(entry.presets.indexOf(id) !== -1, id);
    assert.ok(fs.existsSync(presetFile(id, "tokens.css")), id + " tokens.css");
    assert.ok(fs.existsSync(presetFile(id, "layer.css")), id + " layer.css");
    assert.match(entry.preset_meta[id].theme_color, /^#[0-9a-f]{6}$/);
    assert.ok(entry.preset_meta[id].label && entry.preset_meta[id].summary, id + " label/summary");
  });
  // "default" resta senza layer: output storico invariato.
  assert.equal(fs.existsSync(presetFile("default", "layer.css")), false);
  assert.equal(buildMod.resolveTemplate(BW, "default").layerPath, null);
});

// ---------- 2 + 3 + 7 + 9. output isolati, determinismo, theme-color, noindex, portale ----------

test("buildVariants: output isolati, deterministici, noindex, theme-color del preset, portale sicuro", function () {
  var slug = "smoke-variants-luce";
  var biz = copyFixture("luce-beauty-studio", function (d) {
    d.business.slug = slug;
    d.business.name = 'Luce <script>alert(1)</script> "Studio"';
  });
  var outA = tmpDir("outA");
  var outB = tmpDir("outB");
  try {
    var res = buildMod.buildVariants(biz, { outRoot: outA });
    var root = path.join(outA, slug);
    assert.equal(res.variantRoot, root);

    // Isolamento: solo le tre varianti + il portale; nulla in dist/ o dist-variants/ del repository.
    assert.deepEqual(fs.readdirSync(outA), [slug]);
    assert.deepEqual(fs.readdirSync(root).sort(), DIRECTIONS.slice().sort().concat([]).concat(["index.html"]).sort());
    assert.equal(fs.existsSync(path.join(ROOT, "dist", slug)), false);
    assert.equal(fs.existsSync(path.join(ROOT, "dist-variants", slug)), false);

    var cssById = {};
    DIRECTIONS.forEach(function (id) {
      var dir = path.join(root, id);
      var html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      cssById[id] = fs.readFileSync(path.join(dir, "css", "style.css"), "utf8");

      assert.match(html, /<meta name="robots" content="noindex, nofollow">/, id + " noindex");
      assert.equal(html.indexOf('rel="canonical"'), -1, id + " nessun canonical");
      assert.equal(themeColorOf(html), registry[BW].preset_meta[id].theme_color, id + " theme-color");
      assert.equal(html.indexOf("<script>alert(1)</script>"), -1, id + " nome escapato");

      // Il CSS di ogni variante contiene i propri tokens e il proprio layer, in coda.
      assert.ok(cssById[id].indexOf("presets/" + id + "/tokens.css") !== -1, id + " tokens");
      assert.ok(/presets\/[a-z-]+\/layer\.css --- \*\/[\s\S]*$/.test(cssById[id]), id + " layer");
      assert.ok(cssById[id].lastIndexOf("presets/" + id + "/layer.css") > cssById[id].indexOf("css/theme.css"), id + " layer dopo theme");
      DIRECTIONS.filter(function (o) { return o !== id; }).forEach(function (other) {
        assert.equal(cssById[id].indexOf("presets/" + other + "/"), -1, id + " non contiene " + other);
      });
    });
    assertPairwiseDistinct("style.css", cssById);

    // Determinismo: una seconda build in un'altra radice produce file identici.
    buildMod.buildVariants(biz, { outRoot: outB });
    assert.deepEqual(hashTree(path.join(outB, slug)), hashTree(root));
    // ...e una ricostruzione nella stessa radice elimina eventuali residui.
    fs.mkdirSync(path.join(root, "obsoleta"));
    buildMod.buildVariants(biz, { outRoot: outA });
    assert.equal(fs.existsSync(path.join(root, "obsoleta")), false);

    // Portale: noindex, escaping, solo link relativi alle tre varianti, nessuna risorsa esterna.
    var portal = fs.readFileSync(path.join(root, "index.html"), "utf8");
    assert.match(portal, /<meta name="robots" content="noindex, nofollow">/);
    assert.equal(portal.indexOf("<script"), -1, "nessuno script nel portale");
    assert.ok(portal.indexOf("&lt;script&gt;alert(1)&lt;/script&gt;") !== -1);
    assert.equal(/https?:\/\//i.test(portal), false, "nessun URL esterno");
    assert.equal(/<link\b/i.test(portal), false, "nessun foglio di stile esterno");
    var hrefs = Array.from(portal.matchAll(/(?:href|src)="([^"]+)"/g)).map(function (m) { return m[1]; });
    hrefs.forEach(function (h) {
      assert.ok(/^#dir-[a-z-]+$/.test(h) || /^\.\/[a-z-]+\/index\.html$/.test(h), "riferimento inatteso: " + h);
    });
    DIRECTIONS.forEach(function (id) {
      assert.ok(hrefs.indexOf("./" + id + "/index.html") !== -1, "portale collega " + id);
    });
  } finally {
    rm(path.dirname(biz));
    rm(outA);
    rm(outB);
  }
});

test("theme_color di ogni direzione coincide con un token del proprio preset", function () {
  DIRECTIONS.forEach(function (id) {
    var tokens = readTokens(presetFile(id, "tokens.css"));
    var values = Object.keys(tokens).map(function (k) { return String(tokens[k]).toLowerCase(); });
    assert.ok(values.indexOf(registry[BW].preset_meta[id].theme_color.toLowerCase()) !== -1, id);
  });
  assertPairwiseDistinct("theme_color", DIRECTIONS.reduce(function (acc, id) {
    acc[id] = registry[BW].preset_meta[id].theme_color;
    return acc;
  }, {}));
});

// ---------- 4. build standard invariata rispetto alla baseline 01b251e ----------

test("build standard: output identico byte per byte alla baseline generata dal codice 01b251e", function () {
  assert.equal(BASELINE.commit, "01b251e94001aa832ff1814af3fb9d05c5d31fcf");
  var names = Object.keys(BASELINE.businesses);
  assert.deepEqual(names.slice().sort(), fs.readdirSync(path.join(ROOT, "businesses")).filter(function (n) {
    return fs.statSync(path.join(ROOT, "businesses", n)).isDirectory();
  }).sort(), "baseline e fixture committate devono coincidere");

  names.forEach(function (name) {
    var biz = copyFixture(name);
    var out = path.join(tmpDir("std"), "out");
    try {
      buildMod.buildBusiness(biz, { distDir: out });
      assert.deepEqual(hashTree(out), BASELINE.businesses[name], name);
    } finally {
      rm(path.dirname(biz));
      rm(path.dirname(out));
    }
  });
});

test("build standard: theme-color storico invariato per entrambe le famiglie", function () {
  [["luce-beauty-studio", "#C1653A"], ["minimal-trades-demo", "#1d4863"]].forEach(function (c) {
    var biz = copyFixture(c[0]);
    var out = path.join(tmpDir("tc"), "out");
    try {
      buildMod.buildBusiness(biz, { distDir: out });
      assert.equal(themeColorOf(fs.readFileSync(path.join(out, "index.html"), "utf8")), c[1]);
    } finally {
      rm(path.dirname(biz));
      rm(path.dirname(out));
    }
  });
});

// ---------- 6. contrasto WCAG ----------

test("contrasto WCAG AA (>= 4.5) su tutte le coppie usate, per ognuna delle tre direzioni", function () {
  DIRECTIONS.forEach(function (id) {
    contrastReport(presetFile(id, "tokens.css")).forEach(function (r) {
      assert.notEqual(r.ratio, null, id + " token mancante per " + r.pair.join(" su "));
      assert.ok(r.ratio >= 4.5, id + ": " + r.pair.join(" su ") + " = " + r.ratio.toFixed(2) + ":1");
    });
  });
});

test("contrasto dei preset default esistenti: solo misurato e riportato (token mai modificati)", function (t) {
  Object.keys(registry).forEach(function (templateId) {
    var tokensPath = path.join(ROOT, "templates", templateId, "presets", "default", "tokens.css");
    var below = contrastReport(tokensPath).filter(function (r) { return r.ratio !== null && r.ratio < 4.5; });
    t.diagnostic(
      templateId + "/default: " + (below.length
        ? below.map(function (r) { return r.pair.join(" su ") + "=" + r.ratio.toFixed(2); }).join("; ")
        : "nessuna coppia sotto 4.5")
    );
  });
});

// ---------- 8. differenza strutturale reale fra le tre direzioni ----------

test("le tre direzioni differiscono per tipografia, spaziatura, CTA, hero e sezioni, non solo per palette", function () {
  var rulesById = {};
  DIRECTIONS.forEach(function (id) { rulesById[id] = cssRules(presetFile(id, "layer.css")); });

  function pick(id, selector, prop) {
    var r = rulesById[id][selector];
    return r ? r[prop] : undefined;
  }

  var typography = {};
  var spacing = {};
  var cta = {};
  var hero = {};
  var sections = {};
  DIRECTIONS.forEach(function (id) {
    var root = rulesById[id][":root"] || {};
    ["--font-display", "--font-body", "--fs-h1", "--fs-h2", "--section-padding-y", "--radius-pill", "--radius-card"].forEach(function (v) {
      assert.ok(root[v], id + " deve definire " + v);
    });
    var h1Weight = pick(id, "h1, h2, h3", "font-weight") || pick(id, "h1, h2", "font-weight");
    assert.ok(h1Weight, id + " deve definire il peso dei titoli");

    typography[id] = [root["--font-display"].split(",")[0], h1Weight, root["--fs-h1"], root["--fs-h2"]];
    spacing[id] = [root["--section-padding-y"], pick(id, ".hero", "padding-top"), pick(id, ".section-head", "margin-bottom")];
    cta[id] = [root["--radius-pill"], pick(id, ".btn", "text-transform") || "none", pick(id, ".btn--primary", "background") || "base", pick(id, ".btn", "box-shadow") || "base"];
    hero[id] = [pick(id, ".hero__visual", "aspect-ratio") || "base", pick(id, ".hero__visual", "box-shadow"), pick(id, ".hero", "background") || "base", pick(id, ".hero h1", "max-width")];
    sections[id] = [root["--radius-card"], JSON.stringify(rulesById[id][".service-card"] || {}), pick(id, ".kicker", "background") || "none"];
  });

  assertPairwiseDistinct("tipografia (ruolo display, peso, scala)", typography);
  assertPairwiseDistinct("spaziatura e ritmo", spacing);
  assertPairwiseDistinct("trattamento CTA", cta);
  assertPairwiseDistinct("trattamento hero", hero);
  assertPairwiseDistinct("trattamento sezioni", sections);

  // Ruoli tipografici: almeno una direzione assegna Inter al display (inversione reale dei ruoli).
  var displayFonts = DIRECTIONS.map(function (id) { return typography[id][0]; });
  assert.ok(displayFonts.indexOf('"Inter"') !== -1 && displayFonts.indexOf('"Fraunces"') !== -1, displayFonts.join(","));

  // Nessun colore letterale nei layer: solo var(--color-*) del preset. L'unica url()
  // ammessa è il file font locale già incluso nell'output (Inter, vedi layer.css).
  var LOCAL_INTER = 'url("../assets/fonts/inter/inter-latin-variable.woff2")';
  DIRECTIONS.forEach(function (id) {
    var css = fs.readFileSync(presetFile(id, "layer.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.equal(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(css), false, id + " contiene un colore letterale");
    var withoutLocalFont = css.split(LOCAL_INTER).join("");
    assert.equal(/@import|url\(|https?:/i.test(withoutLocalFont), false, id + " riferisce una risorsa non locale");
  });
});

/**
 * Preludi (selettori / at-rule) di un file CSS dopo la rimozione dei commenti.
 * Un commento chiuso in anticipo (es. "presets/*" + "/tokens.css" dentro il
 * commento) lascia testo libero che diventa parte del preludio della regola
 * successiva: il browser scarta quella regola. Un preludio legittimo nei nostri
 * file non contiene mai "/" né parole separate da punteggiatura testuale.
 */
function suspiciousPreludes(file) {
  var css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  var bad = [];
  var re = /([^{}]*)\{/g;
  var m;
  while ((m = re.exec(css))) {
    var prelude = m[1].trim();
    if (!prelude) continue;
    var strayBeforeAtRule = prelude.indexOf("@") > 0; // es. "presets @font-face": regola scartata
    if (strayBeforeAtRule || /[\/;]|[—–]|\.\s|\s(il|la|di|che|per|non|solo|mai|sono|questo|file)\s/i.test(prelude)) {
      bad.push(prelude.replace(/\s+/g, " ").slice(0, 80));
    }
  }
  return bad;
}

test("CSS dei preset: nessun commento chiuso in anticipo (regole scartate dal parser)", function (t) {
  DIRECTIONS.forEach(function (id) {
    ["tokens.css", "layer.css"].forEach(function (name) {
      assert.deepEqual(suspiciousPreludes(presetFile(id, name)), [], id + "/" + name);
    });
    var tokens = fs.readFileSync(presetFile(id, "tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(tokens, /^\s*:root\s*\{[^{}]*\}\s*$/, id + "/tokens.css deve contenere solo un blocco :root");
  });
  // File condivisi preesistenti: solo misurati e riportati (mai modificati qui).
  ["templates/shared/css/base.css", "templates/beauty-wellness-v1/css/theme.css"].forEach(function (rel) {
    var bad = suspiciousPreludes(path.join(ROOT, rel));
    t.diagnostic(rel + ": " + (bad.length ? "preludi sospetti (regola scartata): " + bad.join(" | ") : "nessun preludio sospetto"));
  });
});

test("solo font locali: nessun layer o token introduce Google Fonts o famiglie diverse da Inter/Fraunces", function () {
  DIRECTIONS.forEach(function (id) {
    var root = cssRules(presetFile(id, "layer.css"))[":root"];
    Object.keys(root).filter(function (k) { return /^--font-/.test(k); }).forEach(function (k) {
      var primary = root[k].split(",")[0].trim();
      assert.ok(primary === '"Inter"' || primary === '"Fraunces"', id + " " + k + " = " + primary);
    });
  });
});

// ---------- QA: mappatura percorsi (standard invariata, varianti separate) ----------

test("qa-screenshots: build standard invariata, dist-variants mappata su businesses/<slug>", function () {
  var std = qaMod.resolveQaTarget(path.join(ROOT, "dist", "luce-beauty-studio"));
  assert.equal(std.businessDir, path.join(ROOT, "businesses", "luce-beauty-studio"));
  assert.equal(std.outDir, path.join(ROOT, "qa-output", "luce-beauty-studio"));

  var other = qaMod.resolveQaTarget("/tmp/qualunque/smoke-x");
  assert.equal(other.businessDir, path.join(ROOT, "businesses", "smoke-x"));
  assert.equal(other.outDir, path.join(ROOT, "qa-output", "smoke-x"));

  var variant = qaMod.resolveQaTarget(path.join(ROOT, "dist-variants", "luce-beauty-studio", "modern-premium"));
  assert.equal(variant.businessDir, path.join(ROOT, "businesses", "luce-beauty-studio"));
  assert.equal(variant.outDir, path.join(ROOT, "qa-output", "variants", "luce-beauty-studio", "modern-premium"));

  var portal = qaMod.resolveQaTarget(path.join(ROOT, "dist-variants", "luce-beauty-studio"));
  assert.equal(portal.businessDir, path.join(ROOT, "businesses", "luce-beauty-studio"));
  assert.equal(portal.outDir, path.join(ROOT, "qa-output", "variants", "luce-beauty-studio", "portal"));
});

// ---------- CLI: percorsi di errore (nessuna scrittura) ----------

test("CLI build: flag sconosciuti, --variants senza cartella o fuori da businesses/ falliscono", function () {
  var outside = tmpDir("cli");
  try {
    [["--variants"], ["--bogus"], ["businesses/luce-beauty-studio", "--force"], [outside, "--variants"], ["businesses/../package.json", "--variants"]]
      .forEach(function (args) {
        var r = childProcess.spawnSync(process.execPath, [path.join(ROOT, "scripts", "build.js")].concat(args), { cwd: ROOT, encoding: "utf8" });
        assert.equal(r.status, 2, args.join(" ") + " -> " + r.stderr);
      });
  } finally {
    rm(outside);
  }
});
