"use strict";

/**
 * Validatori di URL specifici per contesto. Non esiste un unico
 * "sanitizeUrl" generico: ogni campo dei dati ha un uso diverso e quindi
 * una allowlist di protocolli/forma diversa. Tutte le funzioni restituiscono
 * la stringa validata (invariata) oppure null se il valore va scartato —
 * non lanciano mai eccezioni per input scorretto, così un dato non valido
 * ricade semplicemente nel comportamento "assente" (mai un link rotto).
 */

function tryParseUrl(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  var trimmed = raw.trim();
  // Protocolli espliciti sempre rifiutati, indipendentemente dal contesto.
  if (/^\s*(javascript|data|vbscript|file):/i.test(trimmed)) return null;
  // URL "protocol-relative" (//host/...) sono ambigui sul protocollo reale: rifiutati.
  if (/^\/\//.test(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch (err) {
    return null;
  }
}

function isAllowedAbsoluteUrl(raw, allowedProtocols) {
  var parsed = tryParseUrl(raw);
  if (!parsed) return null;
  if (allowedProtocols.indexOf(parsed.protocol) === -1) return null;
  // Nessuna credenziale incorporata nell'URL (user:pass@host).
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}

/** source_url (foto/recensioni): http/https assoluto. */
function sanitizeSourceUrl(raw) {
  return isAllowedAbsoluteUrl(raw, ["http:", "https:"]);
}

/** Link social: http/https assoluto. */
function sanitizeSocialUrl(raw) {
  return isAllowedAbsoluteUrl(raw, ["http:", "https:"]);
}

/** canonical_url: soltanto https assoluto. */
function sanitizeCanonicalUrl(raw) {
  return isAllowedAbsoluteUrl(raw, ["https:"]);
}

/** contact_form.endpoint: soltanto https assoluto. */
function sanitizeFormEndpoint(raw) {
  return isAllowedAbsoluteUrl(raw, ["https:"]);
}

/** map_url: http/https assoluto (non usato in v1: si usa placeholder SVG, ma la validazione resta pronta). */
function sanitizeMapUrl(raw) {
  return isAllowedAbsoluteUrl(raw, ["http:", "https:"]);
}

/**
 * Email: pattern volutamente stretto (solo caratteri comuni e sicuri per
 * local-part/dominio), per evitare che simboli come ":" "(" ")" permettano
 * di incorporare altri schemi/URI dentro un indirizzo apparentemente valido.
 */
var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
function sanitizeEmail(raw) {
  if (typeof raw !== "string") return null;
  var trimmed = raw.trim();
  if (!EMAIL_RE.test(trimmed)) return null;
  if (trimmed.indexOf("..") !== -1) return null;
  return trimmed;
}
function buildMailto(rawEmail) {
  var email = sanitizeEmail(rawEmail);
  return email ? "mailto:" + email : null;
}

/**
 * Telefono per link tel:. Accetta cifre, spazi, trattini, parentesi e un
 * "+" iniziale in ingresso; normalizza a "+" opzionale seguito solo da
 * cifre. Rifiuta tutto il resto.
 */
function normalizePhoneForTel(raw) {
  if (typeof raw !== "string") return null;
  var trimmed = raw.trim();
  if (!/^\+?[0-9()\-\s]{6,20}$/.test(trimmed)) return null;
  var digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 6 || digits.length > 15) return null;
  var hasPlus = trimmed.trim().charAt(0) === "+";
  return (hasPlus ? "+" : "") + digits;
}
function buildTel(raw) {
  var normalized = normalizePhoneForTel(raw);
  return normalized ? "tel:" + normalized : null;
}

/**
 * Numero WhatsApp per wa.me: soltanto cifre, "+" iniziale rimosso prima
 * della costruzione dell'URL, lunghezza plausibile (8-15 cifre, E.164).
 */
function normalizeWhatsappNumber(raw) {
  if (typeof raw !== "string") return null;
  var trimmed = raw.trim();
  if (!/^\+?[0-9]{8,15}$/.test(trimmed)) return null;
  var digitsOnly = trimmed.replace(/^\+/, "");
  if (!/^[0-9]{8,15}$/.test(digitsOnly)) return null;
  return digitsOnly;
}
function buildWhatsappLink(raw, message) {
  var number = normalizeWhatsappNumber(raw);
  if (!number) return null;
  var url = "https://wa.me/" + number;
  if (message) {
    url += "?text=" + encodeURIComponent(message);
  }
  return url;
}

module.exports = {
  sanitizeSourceUrl,
  sanitizeSocialUrl,
  sanitizeCanonicalUrl,
  sanitizeFormEndpoint,
  sanitizeMapUrl,
  sanitizeEmail,
  buildMailto,
  normalizePhoneForTel,
  buildTel,
  normalizeWhatsappNumber,
  buildWhatsappLink
};
