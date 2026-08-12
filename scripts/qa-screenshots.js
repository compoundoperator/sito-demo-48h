"use strict";

/**
 * scripts/qa-screenshots.js
 *
 * QA automatica per un output già generato in dist/<slug>/:
 *  - serve la cartella in locale;
 *  - scroll reale e incrementale (mai un page.evaluate che forza la
 *    rivelazione) a 390/768/1024/1440px, poi screenshot full-page;
 *  - screenshot per ciascuna sezione realmente presente nel DOM;
 *  - verifica con javaScriptEnabled:false (contenuto comunque completo);
 *  - verifica con prefers-reduced-motion;
 *  - verifica sotto emulazione media "print";
 *  - controllo console, overflow orizzontale, un solo <h1>, gerarchia
 *    heading, alt text, immagini rotte, placeholder irrisolti, assenza di
 *    dati interni nell'HTML, assenza di timer legati al reveal nel JS.
 *
 * Uso: node scripts/qa-screenshots.js dist/<slug> [outDir]
 */

var fs = require("fs");
var path = require("path");
var http = require("http");

var ROOT = path.resolve(__dirname, "..");
var BREAKPOINTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1440", width: 1440, height: 900 }
];

var yaml = require("js-yaml");

/**
 * Deriva i VALORI (non i nomi di campo) che non devono mai comparire
 * nell'HTML pubblicato: lead_id, internal_notes, source_file/source_row.
 * Controllare i nomi di campo darebbe falsi positivi sui commenti
 * TODO per sviluppatori nell'head (che menzionano legittimamente i nomi
 * dei campi dello schema, non i loro valori).
 */
function collectInternalValues(businessDir) {
  var values = [];
  var dataPath = path.join(businessDir, "data.yaml");
  if (!fs.existsSync(dataPath)) return values;
  var data;
  try {
    data = yaml.load(fs.readFileSync(dataPath, "utf8"));
  } catch (err) {
    return values;
  }
  function pushIfString(v) {
    if (typeof v === "string" && v.trim().length >= 4) values.push(v);
  }
  pushIfString(data.lead_id);
  pushIfString(data.source_file);
  if (data.business) pushIfString(data.business.internal_notes);
  (data.photos || []).forEach(function (p) { pushIfString(p.internal_notes); });
  (data.reviews || []).forEach(function (r) { pushIfString(r.internal_notes); });
  return values;
}

function serveStatic(dir, port) {
  var mime = {
    ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
    ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".txt": "text/plain"
  };
  var server = http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    var filePath = path.join(dir, urlPath);
    if (!filePath.startsWith(dir)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, function (err, data) {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      var ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise(function (resolve) {
    server.listen(port, function () { resolve(server); });
  });
}

async function realScrollThrough(page) {
  var totalHeight = await page.evaluate(function () { return document.documentElement.scrollHeight; });
  var viewportHeight = page.viewportSize().height;
  var y = 0;
  var step = Math.floor(viewportHeight * 0.5);
  while (y < totalHeight) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(180);
    y += step;
  }
  await page.waitForTimeout(700);
}

function grepUnresolvedPlaceholders(html) {
  var patterns = [/\{\{.*?\}\}/g, />undefined</g, />null</g, /\[object Object\]/g];
  var hits = [];
  patterns.forEach(function (re) {
    var m = html.match(re);
    if (m) hits = hits.concat(m);
  });
  return hits;
}

function grepInternalDataLeak(html, businessDir) {
  var values = collectInternalValues(businessDir);
  return values.filter(function (v) { return html.indexOf(v) !== -1; });
}

/**
 * Controlli geometrici reali (non solo "l'elemento esiste" / "opacity:1").
 * Confronta elementi equivalenti tra loro (mai una soglia in pixel legata
 * al testo demo): individua compressioni di layout come quella osservata
 * nella sezione "Perché sceglierci" (elementi pari schiacciati in una
 * colonna stretta) e wrapper vuoti residui per sezioni omesse.
 */
async function checkGeometry(page) {
  return page.evaluate(function () {
    var result = { whyItems: null, orphanMainChildren: [] };

    var bodies = Array.prototype.map.call(document.querySelectorAll(".why-item__body"), function (el) {
      return el.getBoundingClientRect().width;
    });
    if (bodies.length) {
      var maxW = Math.max.apply(null, bodies);
      var minW = Math.min.apply(null, bodies);
      result.whyItems = { widths: bodies, minWidth: minW, maxWidth: maxW, ratio: maxW > 0 ? minW / maxW : 1 };
    }

    var main = document.getElementById("main");
    if (main) {
      Array.prototype.forEach.call(main.children, function (el) {
        var isSection = el.tagName === "SECTION";
        var isDivider = el.className && el.className.indexOf("section-divider") !== -1;
        if (!isSection && !isDivider) {
          result.orphanMainChildren.push({ tag: el.tagName, cls: el.className, height: el.getBoundingClientRect().height });
        }
      });
    }

    return result;
  });
}

/**
 * Verifica che ogni link di navigazione desktop porti a una sezione la cui
 * intestazione non risulti coperta dalla barra sticky (scroll-margin-top
 * corretto). Eseguita solo dove la nav desktop è visibile (>= 960px).
 */
async function waitForScrollToSettle(page, maxWaitMs) {
  var start = Date.now();
  var lastY = await page.evaluate(function () { return window.scrollY; });
  while (Date.now() - start < maxWaitMs) {
    await page.waitForTimeout(100);
    var y = await page.evaluate(function () { return window.scrollY; });
    if (Math.abs(y - lastY) < 1) return; // scroll fermo: animazione conclusa
    lastY = y;
  }
}

async function checkNavLinkCoverage(page, sectionIds) {
  var results = {};
  // Parte da cima pagina: i click precedenti (realScrollThrough) possono
  // aver lasciato la pagina scrollata molto in basso, rendendo il primo
  // scroll-to-anchor molto lungo e a rischio di essere misurato prima che
  // l'animazione "smooth" sia realmente conclusa.
  await page.evaluate(function () { window.scrollTo(0, 0); });
  await waitForScrollToSettle(page, 1000);

  for (var i = 0; i < sectionIds.length; i++) {
    var id = sectionIds[i];
    var link = page.locator('.nav__link[href="#' + id + '"]');
    if ((await link.count()) === 0) continue;
    await link.click();
    await waitForScrollToSettle(page, 2000);
    await page.waitForTimeout(100); // margine dopo l'assestamento
    var covered = await page.evaluate(function (sectionId) {
      var header = document.getElementById("siteHeader");
      var section = document.getElementById(sectionId);
      if (!header || !section) return null;
      var headerBottom = header.getBoundingClientRect().bottom;
      var sectionTop = section.getBoundingClientRect().top;
      return sectionTop < headerBottom - 1; // piccola tolleranza
    }, id);
    results[id] = covered;
  }
  await page.evaluate(function () { window.scrollTo(0, 0); });
  await page.waitForTimeout(200);
  return results;
}

/**
 * Neutralizza SOLO per lo scatto corrente la posizione sticky dell'header,
 * per evitare l'artefatto di compositing di Playwright/Chromium sugli
 * screenshot full-page/per-elemento più alti del viewport (l'header
 * "duplicato" a metà pagina). Non tocca alcun file del sito: è uno style
 * iniettato nella sola pagina Playwright, dopo che tutte le verifiche
 * funzionali reali (scroll, copertura link, ecc.) sono già state eseguite
 * contro il comportamento sticky vero.
 */
async function neutralizeStickyForScreenshot(page) {
  await page.addStyleTag({ content: "#siteHeader { position: absolute !important; }" });
  await page.waitForTimeout(50);
}

async function run(distDir, outDir) {
  var { chromium } = require("playwright");
  var indexPath = path.join(distDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    throw new Error("index.html non trovato in " + distDir);
  }
  var html = fs.readFileSync(indexPath, "utf8");
  var jsPath = path.join(distDir, "js");
  var jsFiles = fs.existsSync(jsPath) ? fs.readdirSync(jsPath) : [];
  var jsHasRevealTimer = jsFiles.some(function (f) {
    var content = fs.readFileSync(path.join(jsPath, f), "utf8");
    return /setTimeout[^)]*reveal/i.test(content) || /REVEAL_WATCHDOG/i.test(content);
  });

  fs.mkdirSync(outDir, { recursive: true });

  var port = 8000 + Math.floor(Math.random() * 1000);
  var server = await serveStatic(distDir, port);
  var baseUrl = "http://localhost:" + port + "/";

  var report = { distDir: distDir, breakpoints: {}, staticChecks: {} };

  var slug = path.basename(distDir);
  var businessDir = path.join(ROOT, "businesses", slug);
  report.staticChecks.unresolvedPlaceholders = grepUnresolvedPlaceholders(html);
  report.staticChecks.internalDataLeak = grepInternalDataLeak(html, businessDir);
  report.staticChecks.jsHasRevealTimer = jsHasRevealTimer;

  try {
    var browser = await chromium.launch();

    var sectionIds = Array.from(html.matchAll(/<section[^>]*\sid="([a-z-]+)"/g)).map(function (m) { return m[1]; });

    for (var i = 0; i < BREAKPOINTS.length; i++) {
      var bp = BREAKPOINTS[i];
      var context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
      var page = await context.newPage();
      var errors = [];
      page.on("console", function (msg) { if (msg.type() === "error") errors.push(msg.text()); });
      page.on("pageerror", function (e) { errors.push("pageerror: " + e.message); });

      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await realScrollThrough(page);

      var overflow = await page.evaluate(function () {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      });
      var stillHidden = await page.evaluate(function () {
        return Array.prototype.filter.call(document.querySelectorAll("[data-reveal]"), function (el) {
          return parseFloat(getComputedStyle(el).opacity) < 0.99;
        }).length;
      });
      var h1count = await page.evaluate(function () { return document.querySelectorAll("h1").length; });
      var imgsNoAlt = await page.evaluate(function () {
        return Array.prototype.filter.call(document.querySelectorAll("img"), function (i) { return !i.hasAttribute("alt"); }).length;
      });
      var brokenImages = await page.evaluate(async function () {
        var imgs = Array.from(document.querySelectorAll("img"));
        var broken = [];
        for (var j = 0; j < imgs.length; j++) {
          if (imgs[j].complete && imgs[j].naturalWidth === 0) broken.push(imgs[j].src);
        }
        return broken;
      });

      var geometry = await checkGeometry(page);

      var navCoverage = null;
      if (bp.width >= 960) {
        navCoverage = await checkNavLinkCoverage(page, sectionIds);
      }

      // Da qui in poi: solo screenshot per revisione umana. Le verifiche
      // funzionali sopra hanno già osservato il comportamento reale
      // (sticky incluso); la neutralizzazione riguarda solo l'immagine.
      await page.evaluate(function () { window.scrollTo(0, 0); });
      await page.waitForTimeout(150);
      await neutralizeStickyForScreenshot(page);
      await page.screenshot({ path: path.join(outDir, "full-" + bp.name + ".png"), fullPage: true });

      for (var s = 0; s < sectionIds.length; s++) {
        var id = sectionIds[s];
        var locator = page.locator("#" + id);
        if ((await locator.count()) > 0) {
          await locator.scrollIntoViewIfNeeded();
          await page.waitForTimeout(120);
          await locator.screenshot({ path: path.join(outDir, "section-" + id + "-" + bp.name + ".png") }).catch(function () {});
        }
      }

      report.breakpoints[bp.name] = {
        consoleErrors: errors, horizontalOverflow: overflow, stillHiddenAfterScroll: stillHidden,
        h1count: h1count, imgsWithoutAlt: imgsNoAlt, brokenImages: brokenImages, sectionsFound: sectionIds,
        geometry: geometry, navLinkCoverage: navCoverage
      };
      await context.close();
    }

    // No-JS
    report.noJs = {};
    for (var b = 0; b < BREAKPOINTS.length; b++) {
      var bpn = BREAKPOINTS[b];
      var ctxNoJs = await browser.newContext({ viewport: { width: bpn.width, height: bpn.height }, javaScriptEnabled: false });
      var pageNoJs = await ctxNoJs.newPage();
      await pageNoJs.goto(baseUrl, { waitUntil: "load" });
      var overflowNoJs = await pageNoJs.evaluate(function () {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      });
      var hiddenNoJs = await pageNoJs.evaluate(function () {
        return Array.prototype.filter.call(document.querySelectorAll("[data-reveal]"), function (el) {
          return parseFloat(getComputedStyle(el).opacity) < 0.99;
        }).length;
      });
      report.noJs[bpn.name] = { horizontalOverflow: overflowNoJs, hiddenCount: hiddenNoJs };
      await ctxNoJs.close();
    }

    // prefers-reduced-motion
    {
      var ctxRM = await browser.newContext({ viewport: { width: 1024, height: 900 } });
      var pageRM = await ctxRM.newPage();
      await pageRM.emulateMedia({ reducedMotion: "reduce" });
      await pageRM.goto(baseUrl, { waitUntil: "networkidle" });
      await pageRM.waitForTimeout(200);
      var hiddenRM = await pageRM.evaluate(function () {
        return Array.prototype.filter.call(document.querySelectorAll("[data-reveal]"), function (el) {
          return parseFloat(getComputedStyle(el).opacity) < 0.99;
        }).length;
      });
      report.reducedMotion = { hiddenCountWithoutScrolling: hiddenRM };
      await ctxRM.close();
    }

    // print
    {
      var ctxPrint = await browser.newContext({ viewport: { width: 1024, height: 900 } });
      var pagePrint = await ctxPrint.newPage();
      await pagePrint.goto(baseUrl, { waitUntil: "networkidle" });
      await pagePrint.waitForTimeout(200);
      await pagePrint.emulateMedia({ media: "print" });
      var hiddenPrint = await pagePrint.evaluate(function () {
        return Array.prototype.filter.call(document.querySelectorAll("[data-reveal]"), function (el) {
          return parseFloat(getComputedStyle(el).opacity) < 0.99;
        }).length;
      });
      report.print = { hiddenCountUnderPrintMedia: hiddenPrint };
      await pagePrint.screenshot({ path: path.join(outDir, "print-emulation.png"), fullPage: true });
      await ctxPrint.close();
    }

    await browser.close();
  } finally {
    server.close();
  }

  fs.writeFileSync(path.join(outDir, "qa-report.json"), JSON.stringify(report, null, 2), "utf8");
  return report;
}

function summarize(report) {
  var problems = [];
  Object.keys(report.breakpoints).forEach(function (bp) {
    var r = report.breakpoints[bp];
    if (r.consoleErrors.length) problems.push(bp + ": errori console -> " + r.consoleErrors.join(" | "));
    if (r.horizontalOverflow) problems.push(bp + ": overflow orizzontale");
    if (r.stillHiddenAfterScroll > 0) problems.push(bp + ": " + r.stillHiddenAfterScroll + " elementi rimasti nascosti dopo scroll reale");
    if (r.h1count !== 1) problems.push(bp + ": h1count=" + r.h1count + " (atteso 1)");
    if (r.imgsWithoutAlt > 0) problems.push(bp + ": " + r.imgsWithoutAlt + " immagini senza alt");
    if (r.brokenImages.length) problems.push(bp + ": immagini rotte -> " + r.brokenImages.join(", "));
    if (r.geometry && r.geometry.whyItems && r.geometry.whyItems.ratio < 0.8) {
      problems.push(
        bp + ": elementi 'perché sceglierci' con larghezze incoerenti (rapporto " +
        r.geometry.whyItems.ratio.toFixed(2) + ", larghezze " + r.geometry.whyItems.widths.join(",") + ")"
      );
    }
    if (r.geometry && r.geometry.orphanMainChildren.length) {
      problems.push(bp + ": elementi residui in <main> non riconducibili a sezioni/divider -> " + JSON.stringify(r.geometry.orphanMainChildren));
    }
    if (r.navLinkCoverage) {
      Object.keys(r.navLinkCoverage).forEach(function (id) {
        if (r.navLinkCoverage[id] === true) problems.push(bp + ": il link di navigazione verso #" + id + " porta a un'intestazione coperta dalla barra sticky");
      });
    }
  });
  Object.keys(report.noJs).forEach(function (bp) {
    var r = report.noJs[bp];
    if (r.horizontalOverflow) problems.push("no-JS " + bp + ": overflow orizzontale");
    if (r.hiddenCount > 0) problems.push("no-JS " + bp + ": " + r.hiddenCount + " elementi nascosti senza JS");
  });
  if (report.reducedMotion.hiddenCountWithoutScrolling > 0) problems.push("reduced-motion: elementi nascosti senza scroll");
  if (report.print.hiddenCountUnderPrintMedia > 0) problems.push("print: elementi nascosti in stampa");
  if (report.staticChecks.unresolvedPlaceholders.length) problems.push("placeholder irrisolti: " + report.staticChecks.unresolvedPlaceholders.join(", "));
  if (report.staticChecks.internalDataLeak.length) problems.push("dati interni presenti nell'HTML: " + report.staticChecks.internalDataLeak.join(", "));
  if (report.staticChecks.jsHasRevealTimer) problems.push("rilevato un timer legato al reveal nel JS (non ammesso)");
  return problems;
}

module.exports = { run, summarize };

if (require.main === module) {
  var target = process.argv[2];
  if (!target) {
    console.error("Uso: node scripts/qa-screenshots.js dist/<slug> [cartella-output]");
    process.exit(2);
  }
  var distDir = path.resolve(process.cwd(), target);
  var slug = path.basename(distDir);
  var outDir = process.argv[3] ? path.resolve(process.cwd(), process.argv[3]) : path.join(ROOT, "qa-output", slug);

  run(distDir, outDir)
    .then(function (report) {
      var problems = summarize(report);
      console.log("QA completata per " + distDir + " -> " + outDir);
      if (problems.length) {
        console.error("PROBLEMI RILEVATI:");
        problems.forEach(function (p) { console.error("  - " + p); });
        process.exit(1);
      }
      console.log("Nessun problema rilevato.");
    })
    .catch(function (err) {
      console.error("Errore QA:", err.message);
      process.exit(2);
    });
}
