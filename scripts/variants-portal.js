"use strict";

/**
 * scripts/variants-portal.js
 *
 * Genera il portale comparativo LOCALE delle direzioni visive di una
 * attività (dist-variants/<slug>/index.html): una pagina autonoma, senza
 * risorse esterne, che collega e mostra in anteprima (desktop e mobile) le
 * varianti costruite da scripts/build.js (buildVariants). Sempre
 * noindex,nofollow — che resta solo una richiesta ai motori di ricerca, non
 * un controllo di accesso: il portale non va mai pubblicato.
 *
 * Ogni testo proveniente da dati o registry passa da escapeHtml/escapeAttr;
 * id e theme_color sono già stati verificati (isValidId / hex) dal chiamante.
 */

var esc = require("./security/escape.js");

var escapeHtml = esc.escapeHtml;
var escapeAttr = esc.escapeAttr;

var STYLE = [
  ":root{--bg:#f4f4f2;--card:#ffffff;--ink:#16181b;--soft:#4b5058;--line:#d9dad6;--link:#1f4f7a}",
  "*{box-sizing:border-box;margin:0}",
  "body{background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;padding:32px 16px 64px}",
  ".wrap{max-width:1400px;margin:0 auto}",
  "header{margin-bottom:32px}",
  ".eyebrow{font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}",
  "h1{font-size:clamp(26px,3vw,36px);line-height:1.15;margin:8px 0 12px}",
  ".note{max-width:72ch;color:var(--soft)}",
  ".toc{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;padding:0;list-style:none}",
  ".toc a{display:inline-block;padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--link);text-decoration:none;font-weight:600}",
  ".dir{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px;margin-bottom:24px}",
  ".dir__head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin-bottom:12px}",
  ".swatch{width:28px;height:28px;border-radius:6px;border:1px solid var(--line);flex-shrink:0}",
  "h2{font-size:22px;line-height:1.2}",
  "code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--bg);padding:2px 6px;border-radius:4px}",
  ".summary{color:var(--soft);max-width:80ch;margin-bottom:12px}",
  ".open{color:var(--link);font-weight:600}",
  ".previews{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;margin-top:16px}",
  "figure{margin:0}",
  "figcaption{font-size:13px;color:var(--soft);margin-top:6px}",
  ".frame{overflow:hidden;border:1px solid var(--line);border-radius:6px;background:#fff}",
  ".frame iframe{border:0;transform-origin:0 0;display:block}",
  ".frame--desktop{width:640px;height:400px}",
  ".frame--desktop iframe{width:1280px;height:800px;transform:scale(.5)}",
  ".frame--mobile{width:234px;height:506px}",
  ".frame--mobile iframe{width:390px;height:844px;transform:scale(.6)}",
  "@media (max-width:760px){.preview--desktop{display:none}}"
].join("\n");

/**
 * input: { businessName, slug, variants: [{ id, label, summary, themeColor }] }
 * Ritorna l'HTML completo del portale.
 */
function renderVariantsPortal(input) {
  var name = escapeHtml(input.businessName);
  var toc = input.variants
    .map(function (v, i) {
      return '<li><a href="#dir-' + escapeAttr(v.id) + '">' + (i + 1) + ". " + escapeHtml(v.label) + "</a></li>";
    })
    .join("");

  var sections = input.variants
    .map(function (v, i) {
      var href = "./" + v.id + "/index.html";
      var swatch = v.themeColor
        ? '<span class="swatch" style="background:' + escapeAttr(v.themeColor) + '" aria-hidden="true"></span>'
        : "";
      return (
        '<section class="dir" id="dir-' + escapeAttr(v.id) + '" aria-labelledby="dir-title-' + escapeAttr(v.id) + '">' +
        '<div class="dir__head">' + swatch +
        '<h2 id="dir-title-' + escapeAttr(v.id) + '">' + (i + 1) + ". " + escapeHtml(v.label) + "</h2>" +
        "<code>" + escapeHtml(v.id) + "</code>" +
        '<a class="open" href="' + escapeAttr(href) + '">Apri la variante a schermo intero</a></div>' +
        '<p class="summary">' + escapeHtml(v.summary || "") + "</p>" +
        '<div class="previews">' +
        '<figure class="preview--desktop"><div class="frame frame--desktop">' +
        '<iframe src="' + escapeAttr(href) + '" title="Anteprima desktop — ' + escapeAttr(v.label) + '" loading="lazy" tabindex="-1"></iframe>' +
        "</div><figcaption>Desktop (1280px, scala 50%)</figcaption></figure>" +
        '<figure class="preview--mobile"><div class="frame frame--mobile">' +
        '<iframe src="' + escapeAttr(href) + '" title="Anteprima mobile — ' + escapeAttr(v.label) + '" loading="lazy" tabindex="-1"></iframe>' +
        "</div><figcaption>Mobile (390px, scala 60%)</figcaption></figure>" +
        "</div></section>"
      );
    })
    .join("\n    ");

  return (
    "<!doctype html>\n<html lang=\"it\">\n<head>\n" +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '  <meta name="robots" content="noindex, nofollow">\n' +
    "  <!-- Portale locale: noindex non è un controllo di accesso. Non pubblicare questo URL. -->\n" +
    "  <title>Confronto direzioni visive — " + name + "</title>\n" +
    "  <style>\n" + STYLE + "\n  </style>\n" +
    "</head>\n<body>\n" +
    '  <div class="wrap">\n' +
    "  <header>\n" +
    '    <p class="eyebrow">Portale locale di confronto — anteprima riservata</p>\n' +
    "    <h1>Direzioni visive: " + name + "</h1>\n" +
    '    <p class="note">Tre direzioni generate dagli stessi dati. Questo portale e le varianti sono solo per revisione locale: non pubblicare l\'URL (noindex non impedisce l\'accesso a chi conosce l\'indirizzo).</p>\n' +
    '    <ul class="toc">' + toc + "</ul>\n" +
    "  </header>\n" +
    "  <main>\n    " + sections + "\n  </main>\n" +
    "  </div>\n" +
    "</body>\n</html>\n"
  );
}

module.exports = { renderVariantsPortal };
