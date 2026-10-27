"use strict";

/**
 * Test del Worker "gate" delle preview protette (preview/worker/index.mjs).
 *
 * Nessuna rete e nessun account: le chiavi Access sono una coppia RSA
 * generata localmente a ogni esecuzione, iniettata via createHandler({ getKeys }).
 * Dimostrano che l'accesso anonimo o con token non valido è negato, che
 * l'accesso autorizzato funziona, e che revoca e scadenza chiudono la preview.
 */

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var url = require("url");

var previewMod = require("./preview.js");

var ROOT = path.resolve(__dirname, "..");
var WORKER_URL = url.pathToFileURL(path.join(ROOT, "preview", "worker", "index.mjs")).href;

var TEAM = "smoke-preview-team.cloudflareaccess.com";
var AUD = "ab".repeat(32);
var NOW = Date.parse("2026-10-27T12:00:00Z");
var LATER = "2026-11-03T12:00:00.000Z";

var subtle = globalThis.crypto.subtle;
var ALG = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function makeKey(kid) {
  var pair = await subtle.generateKey(ALG, true, ["sign", "verify"]);
  var jwk = await subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = kid;
  return { privateKey: pair.privateKey, jwk: jwk };
}

async function signJwt(privateKey, header, payload) {
  var head = b64url(Buffer.from(JSON.stringify(header)));
  var body = b64url(Buffer.from(JSON.stringify(payload)));
  var sig = await subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64url(new Uint8Array(sig));
}

function claims(overrides) {
  var nowSec = Math.floor(NOW / 1000);
  return Object.assign({ iss: "https://" + TEAM, aud: [AUD], exp: nowSec + 3600, iat: nowSec - 10, nbf: nowSec - 10, sub: "synthetic" }, overrides || {});
}

function makeEnv(overrides) {
  var calls = [];
  var env = Object.assign({
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    PREVIEW_EXPIRES_AT: LATER,
    PREVIEW_STATUS: "active",
    ASSETS: {
      fetch: async function (req) {
        calls.push(req.url);
        return new Response("<!doctype html><title>synthetic</title>", { status: 200, headers: { "content-type": "text/html" } });
      }
    }
  }, overrides || {});
  return { env: env, calls: calls };
}

function req(token, method) {
  var headers = token ? { "Cf-Access-Jwt-Assertion": token } : {};
  return new Request("https://lf-preview-smoke.example.workers.dev/", { method: method || "GET", headers: headers });
}

var ctx = null;
async function setup() {
  if (ctx) return ctx;
  var worker = await import(WORKER_URL);
  var good = await makeKey("kid-good");
  var other = await makeKey("kid-good"); // stesso kid, chiave diversa: firma non verificabile
  ctx = {
    worker: worker,
    good: good,
    other: other,
    handler: worker.createHandler({ getKeys: async function (team) { assert.equal(team, TEAM); return [good.jwk]; }, now: function () { return NOW; } })
  };
  return ctx;
}

async function assertDenied(res, status) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  var body = await res.text();
  assert.equal(/<html|<title/i.test(body), false, "nessun contenuto del sito in una risposta negata");
}

test("regole di formato identiche tra Worker e CLI; URL dei certificati costruito solo dal team domain", async function () {
  var c = await setup();
  assert.equal(c.worker.TEAM_DOMAIN_RE.source, previewMod.TEAM_DOMAIN_RE.source);
  assert.equal(c.worker.AUD_RE.source, previewMod.AUD_RE.source);
  assert.equal(c.worker.certsUrl(TEAM), "https://" + TEAM + "/cdn-cgi/access/certs");
  ["evil.com", "https://x.cloudflareaccess.com", "x.cloudflareaccess.com.evil.com", "X.cloudflareaccess.com",
    "-x.cloudflareaccess.com", "x-.cloudflareaccess.com", "a/b.cloudflareaccess.com", "x.cloudflareaccess.com/", "", null, 42]
    .forEach(function (bad) {
      assert.equal(c.worker.isValidTeamDomain(bad), false, String(bad));
      assert.throws(function () { c.worker.certsUrl(bad); }, String(bad));
    });
  ["AB".repeat(32), "ab".repeat(31), "zz".repeat(32), "", null].forEach(function (bad) {
    assert.equal(c.worker.isValidAud(bad), false, String(bad));
  });
});

test("accesso anonimo negato: nessun header JWT -> 403, asset mai serviti", async function () {
  var c = await setup();
  var e = makeEnv();
  await assertDenied(await c.handler.fetch(req(null), e.env), 403);
  assert.deepEqual(e.calls, []);
});

test("token non validi negati: malformato, firma altrui, kid ignoto, alg diverso, aud/iss errati, scaduto, nbf futuro", async function () {
  var c = await setup();
  var head = { alg: "RS256", kid: "kid-good", typ: "JWT" };
  var nowSec = Math.floor(NOW / 1000);
  var tokens = {
    garbage: "non.un.jwt",
    twoParts: "abc.def",
    forged: await signJwt(c.other.privateKey, head, claims()),
    unknownKid: await signJwt(c.good.privateKey, { alg: "RS256", kid: "kid-ignoto" }, claims()),
    algNone: b64url(Buffer.from(JSON.stringify({ alg: "none", kid: "kid-good" }))) + "." + b64url(Buffer.from(JSON.stringify(claims()))) + ".",
    wrongAud: await signJwt(c.good.privateKey, head, claims({ aud: ["cd".repeat(32)] })),
    wrongIss: await signJwt(c.good.privateKey, head, claims({ iss: "https://altro-team.cloudflareaccess.com" })),
    expired: await signJwt(c.good.privateKey, head, claims({ exp: nowSec - 1 })),
    noExp: await signJwt(c.good.privateKey, head, claims({ exp: undefined })),
    futureNbf: await signJwt(c.good.privateKey, head, claims({ nbf: nowSec + 600 }))
  };
  for (var name of Object.keys(tokens)) {
    var e = makeEnv();
    var res = await c.handler.fetch(req(tokens[name]), e.env);
    assert.equal(res.status, 403, name);
    assert.deepEqual(e.calls, [], name + ": asset mai serviti");
  }
});

test("fallimento chiuso: certificati non raggiungibili o configurazione incompleta -> 403", async function () {
  var c = await setup();
  var token = await signJwt(c.good.privateKey, { alg: "RS256", kid: "kid-good" }, claims());

  var failing = c.worker.createHandler({ getKeys: async function () { throw new Error("rete assente"); }, now: function () { return NOW; } });
  await assertDenied(await failing.fetch(req(token), makeEnv().env), 403);

  var broken = [
    { ACCESS_TEAM_DOMAIN: undefined }, { ACCESS_TEAM_DOMAIN: "evil.com" }, { ACCESS_AUD: undefined }, { ACCESS_AUD: "corto" },
    { PREVIEW_EXPIRES_AT: undefined }, { PREVIEW_EXPIRES_AT: "domani" }, { PREVIEW_STATUS: undefined }, { PREVIEW_STATUS: "boh" },
    { ASSETS: undefined }
  ];
  for (var overrides of broken) {
    await assertDenied(await c.handler.fetch(req(token), makeEnv(overrides).env), 403);
  }
  await assertDenied(await c.handler.fetch(req(token), undefined), 403);
});

test("accesso autorizzato: JWT valido -> 200 con il contenuto e gli header di riservatezza", async function () {
  var c = await setup();
  var e = makeEnv();
  var token = await signJwt(c.good.privateKey, { alg: "RS256", kid: "kid-good" }, claims({ aud: AUD }));
  var res = await c.handler.fetch(req(token), e.env);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /synthetic/);
  assert.equal(e.calls.length, 1);
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(res.headers.get("x-frame-options"), "DENY");

  var head = await c.handler.fetch(req(token, "HEAD"), makeEnv().env);
  assert.equal(head.status, 200);
  var post = await c.handler.fetch(req(token, "POST"), makeEnv().env);
  assert.equal(post.status, 405);
});

test("revoca e scadenza: anche con JWT valido la preview risponde 410", async function () {
  var c = await setup();
  var token = await signJwt(c.good.privateKey, { alg: "RS256", kid: "kid-good" }, claims());

  var revoked = makeEnv({ PREVIEW_STATUS: "revoked" });
  await assertDenied(await c.handler.fetch(req(token), revoked.env), 410);
  assert.deepEqual(revoked.calls, []);

  var expired = makeEnv({ PREVIEW_EXPIRES_AT: new Date(NOW).toISOString() });
  await assertDenied(await c.handler.fetch(req(token), expired.env), 410);
  assert.deepEqual(expired.calls, []);

  // Un istante prima della scadenza l'accesso è ancora consentito.
  var lateToken = await signJwt(c.good.privateKey, { alg: "RS256", kid: "kid-good" },
    claims({ exp: Math.floor(Date.parse(LATER) / 1000) + 3600, nbf: undefined }));
  var justBefore = c.worker.createHandler({ getKeys: async function () { return [c.good.jwk]; }, now: function () { return Date.parse(LATER) - 1000; } });
  assert.equal((await justBefore.fetch(req(lateToken), makeEnv().env)).status, 200);
});

test("handler predefinito: scarica le chiavi solo da https://<team>/cdn-cgi/access/certs", async function () {
  var c = await setup();
  var token = await signJwt(c.good.privateKey, { alg: "RS256", kid: "kid-good" }, claims({ exp: Math.floor(Date.now() / 1000) + 3600, nbf: undefined }));
  var requested = [];
  var originalFetch = globalThis.fetch;
  globalThis.fetch = async function (u) {
    requested.push(String(u));
    return new Response(JSON.stringify({ keys: [c.good.jwk] }), { headers: { "content-type": "application/json" } });
  };
  try {
    var res = await c.worker.default.fetch(req(token), makeEnv({ PREVIEW_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString() }).env);
    assert.equal(res.status, 200);
    assert.deepEqual(requested, ["https://" + TEAM + "/cdn-cgi/access/certs"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
