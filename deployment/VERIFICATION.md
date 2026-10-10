# Verification — 2026-10-07

This is a prepared migration, not a completed production cutover.

## Verified

- Fresh isolated public clones; no dirty existing checkout was changed. No
  applicable AGENTS.md was present in either target or reference repository.
- Target HEAD `7016c31b120e2cc6e1838ecc3b89af043701fb92`; canonical source HEAD
  `4a3603067c19a5ef24f1903147590683c62d6ba5`. Both remained current at final check.
- `python3 scripts/build-cloudflare.py --source ../math-things-reference` and
  `python3 scripts/build-cloudflare.py`: both build 52 pinned canonical assets.
  Shared navigation/service-worker assets are included; the build rejects
  unresolved local HTML script/image/stylesheet references.
- Generated JavaScript, including inline scripts in all 45 HTML pages, passes
  `node --check`. `git diff --check` passes.
- `node --test tests/*.test.mjs`: 11 tests pass, zero failures. Real provider calls
  are mocked with synthetic WAV data; no paid TTS calls were made.
- Fresh headless Chromium 154 context at `http://127.0.0.1:8765/`: app load,
  MathLive/PDF.js/JSZip, curriculum drawer, current Core catalog, same-origin Ten
  Frame iframe launch, tool dragging and resizing, written response entry, and
  synthetic PDF worksheet rendering passed. The initial page load recorded no
  page errors or failed requests. Synthetic EPUB import, chapter display, and
  saved-library persistence after reload passed; the final interaction run
  recorded no page errors or JavaScript/CSS HTTP failures. These checks used fresh browser storage and only
  generated nonsensitive fixtures, not classroom records.
- Existing public GitHub Pages URL returned HTTP 200 with its current redirect;
  that entry point and workflow remain unchanged.

## Unverified or blocked

- Cloudflare deployment, account/zone inspection, exact DNS/custom domain mapping,
  deployed relay source/bindings/CORS, live synthetic uploads/image polling,
  premium voice playback, and clean public new-domain end-to-end tests.
- No connected browser session, Cloudflare connector, Wrangler authentication,
  or Cloudflare token environment was available in the selected environment.
  Direct public Cloudflare requests returned HTTP 403 here; those responses do
  not establish the actual origin deployment health.
- Repository About metadata remains unchanged: the CLI's existing identity gets
  HTTP 404 on the authorized edit; the connector does not expose a repository
  metadata mutation.
- Google Drive private books require existing-client origin approval and a fresh
  owner sign-in. No OAuth grant or credential was created or changed.
- The inherited canonical palette retains stale fallback categories after its
  asynchronous live-catalog refresh. The current Core category was exercised;
  stale OA selection did not show tools. Classroom source logic was preserved.

The proposed homepage is unpublished. No DNS, mail records, backend deployment,
production hosting configuration, or existing GitHub Pages access was changed.
See README.md in this directory for owner steps and rollback.

## Current source recheck — 2026-10-10

- Rechecked the canonical repository after the original 2026-10-07 verification.
  `main` advanced from `4a3603067c19a5ef24f1903147590683c62d6ba5` to
  `d1f1a016401035d737985a8a8c0bac6ed0afc242` (two commits), changing the Frog
  Number Line. Updated `source.json` to pin that current canonical commit.
- `python3 scripts/build-cloudflare.py --source ../math-things-reference`
  builds 52 canonical assets from the updated pinned commit. The source clone is
  separate from the migration repository and was not modified.
- `node --test tests/*.test.mjs`: all 11 regression tests pass.
- Current public `https://maththingsedtech.com/` serves the company landing page
  with a Security link; `https://maththingsedtech.com/security/` resolves, and
  the company page does not currently link to Teaching Table.
- An unauthenticated DNS lookup for `app.maththingsedtech.com` resolved to
  Cloudflare IPv4 and IPv6 addresses. A direct HTTPS `GET /` returned Cloudflare
  `404 Page not found` without redirecting. The app is not serving at that URL.
- The supported browser inventory and tab list were empty; the in-app browser
  and MCP Apps browser were unavailable. No connected Cloudflare session was
  available to inspect the Worker, zone, relay, or custom-domain configuration.
  No site, DNS, relay, mail, or Pages configuration was changed.
