"use strict";

var fs = require("fs");
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

/**
 * Risolve in modo sicuro un percorso "business dir" fornito dall'operatore
 * (es. --business su new-landing) rispetto alla cartella businesses/ del
 * repository. A differenza di resolveDossierAsset (percorso relativo
 * interno noto), qui l'input è un percorso arbitrario da riga di comando:
 * risolve i symlink sia per la radice sia per il candidato (fs.realpathSync,
 * per rilevare anche un symlink che punta fuori da businesses/), verifica
 * un contenimento stretto con confine di separatore corretto, e richiede
 * che il candidato sia esattamente un livello sotto businesses/ (mai
 * annidato più in profondità, mai businesses/ stessa, mai un file).
 * Ritorna il percorso assoluto risolto oppure null se il valore non è
 * ammissibile. businessesRoot è un parametro esplicito (non hardcoded)
 * così i test possono iniettare una radice temporanea; il CLI reale usa
 * sempre il percorso reale del repository.
 */
function resolveBusinessesDir(candidate, businessesRoot) {
  if (typeof candidate !== "string" || candidate.trim() === "") return null;
  if (typeof businessesRoot !== "string" || businessesRoot.trim() === "") return null;

  var resolvedRoot;
  try {
    resolvedRoot = fs.realpathSync(businessesRoot);
  } catch (err) {
    return null;
  }

  var candidateAbs = path.resolve(process.cwd(), candidate);
  var resolvedCandidate;
  try {
    resolvedCandidate = fs.realpathSync(candidateAbs);
  } catch (err) {
    return null;
  }

  var stat;
  try {
    stat = fs.statSync(resolvedCandidate);
  } catch (err) {
    return null;
  }
  if (!stat.isDirectory()) return null;

  if (resolvedCandidate === resolvedRoot) return null;
  var withSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (resolvedCandidate.indexOf(withSep) !== 0) return null;

  var rel = path.relative(resolvedRoot, resolvedCandidate);
  if (rel.split(path.sep).length !== 1) return null;

  return resolvedCandidate;
}

/**
 * Risolve businesses/<slug> per l'input CSV/batch, dove slug è già stato
 * validato da isValidId ma la cartella può non esistere ancora ("create").
 * A differenza di resolveBusinessesDir, non richiede che il candidato
 * esista già.
 *
 * Fallisce sempre chiuso (ritorna null): businessesRoot inesistente, non
 * risolvibile (incluso un loop di symlink) o non una cartella reale;
 * candidato che è un collegamento simbolico (incluso "dangling", il cui
 * target non esiste: lstat ha comunque successo perché non segue il
 * link, quindi va controllato esplicitamente, mai dedotto dall'assenza di
 * errore); qualunque errore diverso da ENOENT nel verificare il
 * candidato (EACCES, ENOTDIR, ELOOP, errori I/O...) — SOLO ENOENT è
 * trattato come "cartella non ancora creata".
 *
 * Ritorna { path, exists } oppure null se non ammissibile.
 */
function resolveBusinessSlugDir(businessesRoot, slug) {
  if (!isValidId(slug)) return null;
  if (typeof businessesRoot !== "string" || businessesRoot.trim() === "") return null;

  var resolvedRoot;
  try {
    resolvedRoot = fs.realpathSync(businessesRoot);
  } catch (err) {
    return null; // inesistente, non risolvibile (incl. ELOOP), ecc.
  }
  var rootStat;
  try {
    rootStat = fs.statSync(resolvedRoot);
  } catch (err) {
    return null;
  }
  if (!rootStat.isDirectory()) return null; // esiste ma non è una cartella

  var candidate = path.join(resolvedRoot, slug);
  // invariante esplicito: slug rispetta ID_RE (nessun separatore, nessun
  // ".."), quindi il genitore diretto di candidate è sempre resolvedRoot —
  // verificato qui, non solo assunto dalla forma della stringa.
  if (path.dirname(candidate) !== resolvedRoot) return null;

  var lst;
  try {
    lst = fs.lstatSync(candidate);
  } catch (err) {
    if (err.code === "ENOENT") {
      // non esiste ancora: percorso sicuro per costruzione (radice
      // canonica già validata come cartella reale + slug validato +
      // containment del genitore già verificato sopra).
      return { path: candidate, exists: false };
    }
    return null; // EACCES, ENOTDIR, ELOOP, I/O, ecc.: mai "sicuro da creare qui"
  }

  // symlink, incluso uno "dangling": mai seguito, mai ammesso, anche se il
  // suo target risultasse dentro businessesRoot.
  if (lst.isSymbolicLink()) return null;

  var resolvedCandidate;
  try {
    resolvedCandidate = fs.realpathSync(candidate);
  } catch (err) {
    return null;
  }
  var withSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (resolvedCandidate !== candidate || resolvedCandidate.indexOf(withSep) !== 0) return null;

  var stat;
  try {
    stat = fs.statSync(resolvedCandidate);
  } catch (err) {
    return null;
  }
  if (!stat.isDirectory()) return null;

  return { path: resolvedCandidate, exists: true };
}

module.exports = { isValidId, containsTraversal, resolveDossierAsset, resolveBusinessesDir, resolveBusinessSlugDir };
