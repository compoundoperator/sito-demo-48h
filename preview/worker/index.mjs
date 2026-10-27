/**
 * Worker "gate" delle preview protette (INCREMENT-05).
 *
 * Serve gli asset statici di UNA preview (dist-preview/<slug>/public) solo
 * dopo aver verificato, a ogni richiesta, il JWT che Cloudflare Access
 * aggiunge all'header Cf-Access-Jwt-Assertion. Access resta il primo
 * controllo (deny-by-default, login via One-time PIN): questo Worker è la
 * seconda barriera, fallisce sempre chiuso (403) se il token manca, non è
 * valido o la configurazione è incompleta — anche se l'applicazione Access
 * fosse configurata male o rimossa.
 *
 * Nessun segreto qui: ACCESS_TEAM_DOMAIN e ACCESS_AUD sono identificativi,
 * non credenziali. L'URL dei certificati è costruito internamente dal solo
 * team domain validato: nessun URL arbitrario configurabile. Il Worker non
 * registra mai email, IP o altri dati personali.
 *
 * Variabili (wrangler.jsonc -> vars, generate da scripts/preview.js):
 *   ACCESS_TEAM_DOMAIN   <team>.cloudflareaccess.com
 *   ACCESS_AUD           tag AUD dell'applicazione Access (64 hex)
 *   PREVIEW_EXPIRES_AT   scadenza ISO 8601: dopo -> 410
 *   PREVIEW_STATUS       "active" | "revoked" (revoked -> 410)
 */

export const TEAM_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
export const AUD_RE = /^[a-f0-9]{64}$/;

const KEYS_TTL_MS = 10 * 60 * 1000;

const BASE_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()"
};

export function isValidTeamDomain(value) {
  return typeof value === "string" && TEAM_DOMAIN_RE.test(value);
}

export function isValidAud(value) {
  return typeof value === "string" && AUD_RE.test(value);
}

export function certsUrl(teamDomain) {
  if (!isValidTeamDomain(teamDomain)) throw new Error("team domain non valido");
  return "https://" + teamDomain + "/cdn-cgi/access/certs";
}

function b64urlToBytes(segment) {
  if (typeof segment !== "string" || !/^[A-Za-z0-9_-]*$/.test(segment)) throw new Error("base64url non valido");
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((segment.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJsonSegment(segment) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)));
}

const keysCache = new Map();

/** Chiavi pubbliche del team Access, con cache in memoria (10 minuti). */
export async function fetchAccessKeys(teamDomain) {
  const cached = keysCache.get(teamDomain);
  if (cached && cached.expires > Date.now()) return cached.keys;
  const res = await fetch(certsUrl(teamDomain), { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("certs non disponibili");
  const body = await res.json();
  if (!body || !Array.isArray(body.keys)) throw new Error("certs malformati");
  keysCache.set(teamDomain, { keys: body.keys, expires: Date.now() + KEYS_TTL_MS });
  return body.keys;
}

/**
 * Verifica un JWT di Access: RS256, firma su una chiave del team (per kid),
 * iss = https://<teamDomain>, aud contiene l'AUD atteso, exp nel futuro,
 * nbf (se presente) non nel futuro. Ritorna true/false, mai eccezioni.
 */
export async function verifyAccessJwt(token, opts) {
  try {
    if (typeof token !== "string" || token.length > 8192) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const header = decodeJsonSegment(parts[0]);
    const payload = decodeJsonSegment(parts[1]);
    if (!header || header.alg !== "RS256" || typeof header.kid !== "string") return false;

    const keys = await opts.getKeys(opts.teamDomain);
    const jwk = Array.isArray(keys) ? keys.find((k) => k && k.kid === header.kid && k.kty === "RSA") : null;
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), signed);
    if (!ok) return false;

    const nowSec = Math.floor(opts.now / 1000);
    if (payload.iss !== "https://" + opts.teamDomain) return false;
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (auds.indexOf(opts.aud) === -1) return false;
    if (typeof payload.exp !== "number" || payload.exp <= nowSec) return false;
    if (payload.nbf !== undefined && (typeof payload.nbf !== "number" || payload.nbf > nowSec)) return false;
    return true;
  } catch (err) {
    return false;
  }
}

function withHeaders(response) {
  const out = new Response(response.body, response);
  Object.keys(BASE_HEADERS).forEach((name) => out.headers.set(name, BASE_HEADERS[name]));
  return out;
}

function textResponse(status, text) {
  return withHeaders(new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8" } }));
}

/**
 * Handler parametrico: i test iniettano getKeys (chiavi locali) e now.
 * Ordine dei controlli: metodo -> configurazione -> stato -> scadenza -> JWT.
 */
export function createHandler(deps) {
  const getKeys = (deps && deps.getKeys) || fetchAccessKeys;
  const clock = (deps && deps.now) || (() => Date.now());
  return {
    async fetch(request, env) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return textResponse(405, "Metodo non consentito.");
      }
      env = env || {};
      const expiresAt = Date.parse(env.PREVIEW_EXPIRES_AT);
      const configOk = isValidTeamDomain(env.ACCESS_TEAM_DOMAIN) && isValidAud(env.ACCESS_AUD) &&
        Number.isFinite(expiresAt) && (env.PREVIEW_STATUS === "active" || env.PREVIEW_STATUS === "revoked") &&
        env.ASSETS && typeof env.ASSETS.fetch === "function";
      if (!configOk) return textResponse(403, "Accesso negato.");

      if (env.PREVIEW_STATUS !== "active") return textResponse(410, "Anteprima non più disponibile.");
      const now = clock();
      if (now >= expiresAt) return textResponse(410, "Anteprima non più disponibile.");

      const token = request.headers.get("Cf-Access-Jwt-Assertion");
      const valid = await verifyAccessJwt(token, { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, now, getKeys });
      if (!valid) return textResponse(403, "Accesso negato.");

      return withHeaders(await env.ASSETS.fetch(request));
    }
  };
}

export default createHandler();
