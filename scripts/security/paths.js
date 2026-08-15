"use strict";

var path = require("path");

/** slug, template_id, preset_id: regola stretta, minuscolo/numeri/trattino. */
var ID_RE = /^[a-z0-9-]+$/;
function isValidId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 80 && ID_RE.test(value);
}

/**
 * Rileva tentativi di path traversal in una stringa (percorso relativo o
 * segmento), incluse forme codificate/backslash usate per uscire dalla
 * cartella consentita.
 */
function containsTraversal(relPath) {
  if (typeof relPath !== "string") return true;
  var candidates = [relPath];
  try {
    candidates.push(decodeURIComponent(relPath));
  } catch (err) {
    // stringa percent-encoded malformata: trattata comunque come sospetta
    return true;
  }
  for (var i = 0; i < candidates.length; i++) {
    var normalized = candidates[i].replace(/\\/g, "/");
    var segments = normalized.split("/");
    if (segments.indexOf("..") !== -1) return true;
    if (/%2e%2e/i.test(candidates[i])) return true;
  }
  return false;
}

/**
 * Risolve in modo sicuro il percorso locale di un asset (es. photos[].local_file)
 * rispetto alla cartella dossier/ dell'attività. Ritorna il percorso assoluto
 * risolto oppure null se il valore non è ammissibile (assoluto, traversal,
 * fuori dalla cartella consentita).
 */
function resolveDossierAsset(businessDir, relPath) {
  if (typeof relPath !== "string" || relPath.trim() === "") return null;
  if (path.isAbsolute(relPath)) return null;
  if (/^[a-zA-Z]:[\\/]/.test(relPath)) return null; // percorso assoluto stile Windows (C:\...)
  if (containsTraversal(relPath)) return null;

  var dossierRoot = path.resolve(businessDir, "dossier");
  var resolved = path.resolve(dossierRoot, relPath);
  var withSep = dossierRoot.endsWith(path.sep) ? dossierRoot : dossierRoot + path.sep;
  if (resolved !== dossierRoot && resolved.indexOf(withSep) !== 0) return null;
  return resolved;
}

module.exports = { isValidId, containsTraversal, resolveDossierAsset };
