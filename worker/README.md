# Premium speech route for teaching-table-relay

`tts.mjs` is an additive route module for the **existing**
`teaching-table-relay.ssccchef.workers.dev` Worker. It is not a replacement Worker.
The current deployed upload-handler source and bindings must be retrieved from
Cloudflare before integration. Do not deploy this file as the Worker's entry point:
doing so would remove the worksheet upload routes.

In the existing module Worker's `fetch` handler, before its current routing and
OPTIONS handling, add:

```js
import { handleTts } from './tts.mjs';

// Inside the existing async fetch(request, env, ctx):
const ttsResponse = await handleTts(request, env);
if (ttsResponse) return ttsResponse;
// Continue with all existing relay routes and bindings.
```

If the current Worker uses service-worker syntax, adapt the call to its existing
fetch listener and bound environment without replacing its other handlers.

## Configuration

1. Obtain a Gemini API key in Google AI Studio for a project that can use
   `gemini-3.8-flash-tts`. Restrict the key to the Generative Language API. Any
   required API/billing activation must be approved by the account owner.
2. Add **Secret** `GEMINI_API_KEY` to the existing Worker using Cloudflare's
   Variables and Secrets settings, or `wrangler secret put GEMINI_API_KEY --name
   teaching-table-relay` from its authenticated deployment project. Never place
   its value in this repository, a plaintext variable, the browser, logs, or chat.
3. Add a rate-limiter binding named `TTS_RATE_LIMITER`, limit 60 per 60 seconds,
   using an unused numeric namespace ID from the account. Merge this into the
   real Worker's config while preserving all existing bindings:

   ```jsonc
   "ratelimits": [{
     "name": "TTS_RATE_LIMITER",
     "namespace_id": "<unused numeric namespace ID>",
     "simple": { "limit": 60, "period": 60 }
   }]
   ```

   The handler fails closed without the key or limiter. Limits apply per client
   IP within a Cloudflare location, so a school's shared IP shares the allowance.
   CORS is not authentication; non-browser callers can spoof Origin. These rate
   limits are abuse mitigation, not a guaranteed global spending cap. Set the
   project's API quotas according to the approved usage before paid activation.
4. Deploy the merged Worker and test it from the allowed origin:

   ```sh
   curl --fail-with-body -X POST \
     'https://teaching-table-relay.ssccchef.workers.dev/tts' \
     -H 'Origin: https://mrh-swes.github.io' \
     -H 'Content-Type: application/json' \
     --data '{"text":"Let us read together. What do you notice?"}' \
     --output tts-test.wav
   ```

   Confirm `Content-Type: audio/wav`, a RIFF/WAVE header, actual playable speech,
   CORS preflight, rejection of another origin, and that worksheet uploads still
   work. Then test both curriculum Read and written-response speakers live.

## Behavior and verification

- Google Interactions API, model `gemini-3.8-flash-tts`, Kore voice, warm and
  patient elementary-teacher delivery in `speech_metadata.style`.
- Transcript is separate from delivery directions; `store: false` disables
  persisted Interaction objects. The Worker does not log or cache text/audio.
  This does not override Google's account-level data-use terms.
- Only `https://mrh-swes.github.io` is allowed; JSON only, 4,000 characters per
  request, bounded request body, 25-second upstream timeout, sanitized errors.
- Browser requests are chunked at natural boundaries, with an 8 MiB/8-clip
  memory-only replay cache. New speech, a repeated click, Escape, page changes,
  and mode changes cancel old playback. Failed requests use device speech and
  back off for one minute. No automatic provider retries or persistent TTS cache.
- Run tests from the repository root: `node --test tests/*.test.mjs`.

Official references:
- https://ai.google.dev/gemini-api/docs/speech-generation
- https://ai.google.dev/gemini-api/docs/interactions-overview
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

## Deployment checkpoint — 2026-10-01

The client and route module are implemented. Worker integration, secret creation,
and a real Gemini audio test are still pending authenticated Cloudflare and
Google access. The original `/tts` endpoint returned 404 during inspection.
Local tests use synthetic WAV data and do not establish live provider access.
