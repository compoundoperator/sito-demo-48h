"use strict";

/**
 * Integrità dei commenti di TUTTI i CSS sotto templates/ (condivisi, famiglie,
 * preset). Bloccante.
 *
 * Perché: in CSS un commento si chiude al PRIMO "*" + "/". Un percorso con
 * glob scritto dentro un commento (es. "templates/" + "*" + "/presets") lo
 * chiude in anticipo; il testo rimasto diventa il preludio della regola
 * successiva e il browser la scarta. È successo davvero: in base.css la regola
 * @font-face di Inter veniva scartata in ogni build standard (INCREMENT-02).
 *
 * Regole (stessa semantica di commento del tokenizer CSS):
 *  (a) nessun preludio contiene una at-rule non in prima posizione;
 *  (b) nessun preludio contiene "/", ";" o testo discorsivo;
 *  (c) dopo la chiusura di un commento, il resto della riga è vuoto o è CSS;
 *  (d) ogni @font-face scritto fuori dai commenti apre una regola propria.
 */

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");

function listCss(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var abs = path.join(dir, e.name);
    if (e.isDirectory()) listCss(abs, acc);
    else if (e.name.endsWith(".css")) acc.push(abs);
  });
  return acc.sort();
}

function stripComments(css) {
  var out = "";
  var i = 0;
  var closes = [];
  while (i < css.length) {
    if (css[i] === "/" && css[i + 1] === "*") {
      var end = css.indexOf("*/", i + 2);
      if (end === -1) {
        closes.push({ unterminated: true, at: i });
        break;
      }
      closes.push({ at: end + 2 });
      out += " ";
      i = end + 2;
    } else {
      out += css[i];
      i++;
    }
  }
  return { text: out, closes: closes };
}

function checkCss(css) {
  var problems = [];
  var s = stripComments(css);

  s.closes.forEach(function (c) {
    if (c.unterminated) {
      problems.push("commento non terminato all'offset " + c.at);
      return;
    }
    var eol = css.indexOf("\n", c.at);
    var rest = css.slice(c.at, eol === -1 ? css.length : eol).trim();
    if (rest && !/[{};]/.test(rest) && !/^\/\*/.test(rest)) {
      var line = css.slice(0, c.at).split("\n").length;
      problems.push("riga " + line + ": testo dopo la chiusura del commento: \"" + rest.slice(0, 60) + "\"");
    }
  });

  var re = /([^{}]*)\{/g;
  var m;
  var preludes = [];
  while ((m = re.exec(s.text))) {
    var prelude = m[1].replace(/\s+/g, " ").trim();
    if (!prelude) continue;
    preludes.push(prelude);
    if (prelude.indexOf("@") > 0) {
      problems.push("at-rule inglobata da testo spurio: \"" + prelude.slice(0, 60) + "\"");
    } else if (/[\/;]|[—–]|\.\s|\s(il|la|di|che|per|non|solo|mai|sono|questo|file)\s/i.test(prelude)) {
      problems.push("preludio sospetto: \"" + prelude.slice(0, 60) + "\"");
    }
  }

  var written = (s.text.match(/@font-face/g) || []).length;
  var clean = preludes.filter(function (p) { return p === "@font-face"; }).length;
  if (written !== clean) problems.push("@font-face scritti: " + written + ", interpretati come regole: " + clean);

  return problems;
}

test("CSS sotto templates/: nessun commento chiuso in anticipo, nessuna regola scartata dal parser", function () {
  var files = listCss(path.join(ROOT, "templates"), []);
  assert.ok(files.length >= 5, "attesi più file CSS sotto templates/");
  var report = {};
  files.forEach(function (f) {
    var problems = checkCss(fs.readFileSync(f, "utf8"));
    if (problems.length) report[path.relative(ROOT, f)] = problems;
  });
  assert.deepEqual(report, {});
});

test("base.css dichiara sia Inter sia Fraunces come @font-face effettivi", function () {
  var s = stripComments(fs.readFileSync(path.join(ROOT, "templates", "shared", "css", "base.css"), "utf8")).text;
  var faces = s.match(/(?:^|(?<=\}))\s*@font-face\s*\{[^{}]*\}/g) || [];
  var families = faces.map(function (f) { return (f.match(/font-family:\s*"([^"]+)"/) || [])[1]; }).sort();
  assert.deepEqual(families, ["Fraunces", "Inter"]);
});

test("il controllo rileva davvero il difetto storico (commento con glob chiuso in anticipo)", function () {
  var broken = "/*\n  vedi templates/" + "*" + "/presets/" + "*" + "/tokens.css\n*/\n\n@font-face {\n  font-family: \"Inter\";\n}\n";
  var problems = checkCss(broken);
  assert.ok(problems.some(function (p) { return /testo dopo la chiusura del commento/.test(p); }), problems.join(" | "));
  assert.ok(problems.some(function (p) { return /at-rule inglobata/.test(p); }), problems.join(" | "));
  assert.deepEqual(checkCss("/* commento */\n@font-face {\n  font-family: \"Inter\";\n}\n.a { color: red; }\n"), []);
});
