# Company domain migration

Status: prepared for deployment; custom domain and live functionality are not yet verified.

## Audit and lineage

`i-ready-table` main at `7016c31b120e2cc6e1838ecc3b89af043701fb92` redirects to
`math-things/apps/teaching-table/`. Restoring its previous entry point would lose
newer Google Drive and classroom work. `source.json` instead pins the canonical
`math-things` source at `4a3603067c19a5ef24f1903147590683c62d6ba5`.
The canonical repository is not modified. The build reads committed blobs,
including the latest manipulative behavior, and never includes dirty local work.

The frontend references `https://teaching-table-relay.ssccchef.workers.dev`:
`GET /image/<session>` polls worksheets, `/u/<session>` is the phone upload page,
and `POST /tts` provides premium speech. These URLs are preserved. This repository
contains only an additive TTS route, not the deployed upload Worker or bindings.
Never replace that Worker with `worker/tts.mjs`.

## Build and deployment

Run `python3 scripts/build-cloudflare.py` (public pinned archive), or
`python3 scripts/build-cloudflare.py --source /path/to/math-things` (pinned Git blobs).
Only generated `dist/` is served: Teaching Table at `/`, its same-origin catalog
and manipulatives under `/math-things/`, and provenance at `/build-source.json`.
The legacy Pages redirect remains unchanged. HTML/JS canonical URL references
are adapted to `/math-things/`; relay routes and classroom logic stay intact.
Update `source.json` deliberately when adopting newer canonical work.

`wrangler.jsonc` prepares an asset-only `maththings-app` Worker with a genuine
404 page. It has no custom domains/routes, secrets, backend bindings, or paid
service configuration. Before deployment, inspect the authenticated account and
confirm this Worker name does not overwrite an unrelated existing Worker.
Use the existing account's permitted deployment tool to deploy `dist/`, then
verify the returned workers.dev preview before adding a custom domain.
Do not deploy this config over the relay or company homepage Worker.

The proposed company HTML is `company/index.html`. It is unpublished and includes
a prominent product link. Deploy it only after the product is live and verified,
merging it into the existing homepage Worker's static asset deployment while
preserving its exact Worker name, routes, and bindings.

## Required owner coordination

- Inspect the existing Cloudflare zone, Workers, deployments, routes, custom
  domains, and mail records using current authenticated access. No credentials
  should be copied to frontend source, logs, this repository, or chat.
- Inspect and back up the full deployed relay and bindings. Merge the exact
  `https://app.maththingsedtech.com` origin into existing upload/image CORS and
  integrate the updated TTS module if that module is deployed. Retain
  `https://mrh-swes.github.io`; reject unlisted origins and emit `Vary: Origin`.
  Do not broaden authentication, enable wildcard CORS, or create a provider key.
- Proposed routing intent: attach **only** `app.maththingsedtech.com` to the
  verified app asset Worker. Exact DNS record type/value and route changes must
  be obtained from the actual zone/Worker dashboard and approved at action time.
  They cannot be safely specified before authenticated inspection. Keep the apex
  company route, GitHub Pages, and MX/SPF/DKIM/DMARC records intact.
- Existing private Drive access needs the owner to add
  `https://app.maththingsedtech.com` to the existing OAuth Web Client's authorized
  JavaScript origins, retaining the Pages origin. Do not create new grants or
  credentials. Its ID and login state may need to be entered again on the new origin.
- Set repository About metadata with an account authorized to administer this
  repository: homepage `https://maththingsedtech.com`; description
  `Teaching Table from Math Things edTech: a classroom workspace for digital math manipulatives, local curriculum, worksheets, and read-aloud tools.`
  The available CLI identity cannot update this repository (HTTP 404), and the
  connected GitHub tool does not expose a repository metadata mutation.

## Local data continuity

IndexedDB and localStorage are origin-specific. Books, settings, and OAuth client
IDs saved under GitHub Pages do not automatically appear on the company domain.
Keep old Pages available and re-add licensed local EPUB/PDF files on the new
origin. Do not inspect or upload student records during verification.

## Verification boundaries

Run `node --test tests/*.test.mjs`. Tests cover premium speech, cancellation,
fallback, synthetic WAV responses, exact-origin preflight/denial, body limits,
rate limits, and sanitized errors. They do not exercise a real paid provider.

Before calling the migration complete, use a clean browser context to check:
old and new URLs; assets and 404s; catalog, current adaptive manipulatives,
drag/resize, written responses; a synthetic local PDF and EPUB; synthetic phone
upload and image polling; allowed/denied relay CORS; TTS fallback and one approved
premium audio call if provider access/billing allows; Drive only with owner-approved
OAuth configuration. Do not repeat paid TTS calls. Update the README planned-domain
label and publish the homepage product link only after those results are recorded.

## Rollback

No existing deployment is retired by these changes. If the preview fails, leave
the custom domain untouched. After an approved cutover, restore the previous
Cloudflare domain mapping/deployment using the saved pre-change configuration.
Restore the previous company homepage deployment if needed. Keep the old Pages
access as the fallback; revert this migration commit to remove prepared config.
