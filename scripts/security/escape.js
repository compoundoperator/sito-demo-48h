"use strict";

/**
 * Utility di escaping centralizzate. Ogni funzione di rendering che
 * interpola dati provenienti da businesses/<slug>/data.yaml in una
 * stringa HTML DEVE passare da qui, mai interpolazione diretta.
 */

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Per i template di questo progetto gli attributi sono sempre delimitati
// da doppi apici: lo stesso escaping del testo e' sufficiente e corretto.
function escapeAttr(value) {
  return escapeHtml(value);
}

var LINE_SEPARATOR = String.fromCharCode(0x2028);
var PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
var LINE_SEPARATOR_RE = new RegExp(LINE_SEPARATOR, "g");
var PARAGRAPH_SEPARATOR_RE = new RegExp(PARAGRAPH_SEPARATOR, "g");

/**
 * Serializza un valore JSON per l'inserimento sicuro dentro un tag
 * <script type="application/ld+json"> (o qualunque altro <script> inline),
 * neutralizzando le sequenze che potrebbero chiudere il tag o introdurre
 * problemi di parsing (</script>, U+2028, U+2029).
 */
function safeJsonForScriptTag(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPARATOR_RE, "\\u2028")
    .replace(PARAGRAPH_SEPARATOR_RE, "\\u2029");
}

module.exports = { escapeHtml, escapeAttr, safeJsonForScriptTag };
