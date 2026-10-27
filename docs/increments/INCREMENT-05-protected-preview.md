# Increment 05 — Protected Preview Foundation

Status: implemented on local branch `claude/protected-preview-v1`, created from `2a704ee`. Not pushed, not merged, not deployed. No Cloudflare operation has been performed.

## Governance record

- The session ran with `--settings {"disableAllHooks":true}` (SESSION_HOOKS_DISABLED=PASS).
  - No OG, Graphify, refresh, sync or Obsidian writeback was invoked.
  - The R1-17 derogation authorised by Domizio still applies.
  - This record must be copied into the canonical vault note when OG updates resume.
- Scope: local code, tests and documentation on fictional fixtures only. No account, credential, paid service, domain, deploy or real client data.
- `AGENTS.md` stays untracked and is never staged.

## Problem

Until now, PRIVATE_DEMO stays private only because its URL is never published. `noindex` keeps a page out of search engines but does not stop anyone who has the link. The MVP needs an online preview that only named reviewers can open, that can be revoked and deleted, that expires, and that never contains a PRODUCTION build.

## Provider choice

Compared using official documentation only (2026-10-27):

| | Cloudflare Workers static assets + Access | Vercel Deployment Protection | Netlify password protection |
|---|---|---|---|
| Per-person access | Yes: email allowlist, One-time PIN login, deny by default | Hobby: Vercel team members only. Password: Pro, $20/month per project | One shared password (Pro). Team login: members only |
| Cost | Zero Trust Free: $0 up to 50 users. Static asset requests free | Paid for external reviewers | Paid plan required |
| Domain | Not needed (`*.workers.dev`) | Not needed | Not needed |
| Expiry / revocation | Session duration 0–1 month; revoke tokens per app or per user | Change the password | Change the password |

**Decision: Cloudflare Workers static assets + Cloudflare Access.** It is the only option with real per-person access at no cost and with no shared password to distribute.

## Architecture

```
npm run preview -- bundle --business businesses/<slug> [--expires-in-days N]
  -> dist-preview/<slug>/            (gitignored)
       public/          buildBusiness(..., { forceNoindex: true }), without _headers
       worker.mjs       copy of preview/worker/index.mjs
       wrangler.jsonc   name lf-preview-<slug>, workers_dev true, preview_urls false,
                        observability off, assets { directory ./public, binding ASSETS,
                        run_worker_first true }, vars { ACCESS_TEAM_DOMAIN, ACCESS_AUD,
                        PREVIEW_EXPIRES_AT, PREVIEW_STATUS }

Request -> Cloudflare Access (allowlisted email + One-time PIN) -> Worker:
  method not GET/HEAD                       -> 405
  config missing or malformed               -> 403 (fail-closed)
  PREVIEW_STATUS != active                  -> 410
  now >= PREVIEW_EXPIRES_AT                 -> 410
  Cf-Access-Jwt-Assertion invalid           -> 403 (RS256 signature against the team keys,
                                               iss, aud, exp, nbf)
  otherwise                                 -> asset + noindex, private/no-store,
                                               no-referrer, nosniff, DENY frame headers
```

- **Identifiers, not secrets.** `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are read from `.landing-factory/preview-config.json` (gitignored), which accepts exactly these two keys.
  - The team domain must match `<team>.cloudflareaccess.com`. The AUD must be 64 lowercase hex characters.
  - The Worker builds the certificates URL itself, as `https://<team>/cdn-cgi/access/certs`. No URL is configurable.
- **Credentials.** The Cloudflare credential exists only on the operator's machine, through `wrangler login`. It is never in the repo, the bundle or the client.
- **Modes.** Only TEMPLATE_DEMO and PRIVATE_DEMO are accepted. PRODUCTION is refused, by the same rule as `--variants`.
- **Evidence log.** `.landing-factory/previews.json` holds the slug, Worker name, mode, status, created/expires/revoked/deleted timestamps. It never holds emails or IPs, and the Worker logs nothing.

## Minimal threat model

| # | Threat | Control |
|---|---|---|
| T1 | Anonymous request | Access deny by default, plus the Worker returns 403 without a valid JWT |
| T2 | Alternate public URL | `preview_urls: false`. `run_worker_first: true` puts every asset behind the gate |
| T3 | Forged, expired or other-team JWT | RS256 signature against the team keys; `iss`, `aud`, `exp` and `nbf` checked |
| T4 | Leaked link | Useless without an allowlisted email and its One-time PIN |
| T5 | Former reviewer | Policy edit plus token revocation (Access); `PREVIEW_STATUS=revoked`; expiry |
| T6 | Secrets in the repo or bundle | Config file restricted to the two identifiers; tests scan the bundle for secret patterns |
| T7 | Indexing or caching | `X-Robots-Tag` and `Cache-Control: private, no-store` (hygiene, not access control) |
| T8 | PRODUCTION reaching a preview | Refused before anything is written |
| T9 | Personal data in logs | `observability.enabled: false`; the registry has no email or IP fields |
| T10 | Configuration drift | `workers_dev` and `preview_urls` are written explicitly on every deploy |

Residual risks: compromise of the Cloudflare account; interception of the reviewer's mailbox; the 50-user cap on the Free plan.

## Scope

- **In this increment:** the bundle/revoke/delete CLI, the gate Worker, the generated config, tests, docs and runbook.
- **Separate R1 decisions (not authorised):**
  - R1-a: Cloudflare account and Zero Trust Free.
  - R1-b: `wrangler login`.
  - R1-c: a deploy of the fictional `luce-beauty-studio` preview.
  - R1-d: the Access app/policy, limited to the user's own email, with a session of at most 24h.
  - R1-e: live checks, then revoke and delete.
- **Post-launch:** custom domain; Access configuration via API or Terraform; automatic cleanup of expired previews; preview hub; SSO; CI deploy job; any PRODUCTION deploy.

## Tests

- `scripts/preview-worker.test.js`. Runs offline, with an RSA key pair generated per run. Covers:
  - anonymous access denied;
  - malformed, forged, unknown-kid, `alg: none`, wrong aud/iss, expired, missing-exp and future-nbf tokens denied;
  - unreachable keys and every incomplete configuration denied;
  - authorised access served with the privacy headers;
  - revoked and expired previews return 410;
  - the default handler fetches keys only from `https://<team>/cdn-cgi/access/certs`.
- `scripts/preview.test.js`. Covers:
  - `.gitignore` entries;
  - mode gate;
  - PRODUCTION and invalid configs refused with no writes;
  - expiry bounds;
  - Worker names;
  - bundle shape, noindex, no `_headers`, worker identical to source, exact `wrangler.jsonc`;
  - registry without personal fields;
  - secret scan;
  - revoke and delete;
  - CLI refusals.
- Live checks belong to the R1 gate:
  - anonymous `curl` redirected to `*.cloudflareaccess.com`;
  - allowlisted email loads the page;
  - access denied after revocation;
  - 410 after expiry;
  - not found after `wrangler delete`.

## Rollback

- **Local:** leave the branch unmerged or revert its commit. `dist-preview/` and `.landing-factory/` are gitignored and can be regenerated.
- **External** (only after an R1 deploy):
  1. `npx wrangler@<approved exact version> delete --name lf-preview-<slug>`.
  2. Delete the Access application.
  3. Revoke its tokens.
  4. `wrangler logout`.
  5. Optionally, disable Zero Trust or close the account.
