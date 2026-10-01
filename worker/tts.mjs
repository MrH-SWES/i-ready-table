// Add this route to the existing relay; do not replace its worksheet handlers.
const ORIGIN = 'https://mrh-swes.github.io';
const MODEL = 'gemini-3.8-flash-tts';
const STYLE = 'A warm, natural elementary-school teacher reading to a child. ' +
  'Patient, reassuring, conversational American English. Clear articulation, a gently ' +
  'unhurried pace, and natural pauses at punctuation. Expressive but never sing-song or exaggerated.';

const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function fail(status, error, extra = {}) {
  return Response.json({ error }, { status, headers: { ...cors, ...extra } });
}

async function limitedBody(request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20000) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function handleTts(request, env) {
  // Return null for unrelated paths so the existing relay can handle them unchanged.
  if (new URL(request.url).pathname !== '/tts') return null;
  if (request.headers.get('Origin') !== ORIGIN) {
    return new Response('Forbidden', { status: 403, headers: { Vary: 'Origin' } });
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail(405, 'Use POST.', { Allow: 'POST, OPTIONS' });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return fail(415, 'Send application/json.');
  }

  let body;
  try {
    const raw = await limitedBody(request);
    if (raw === null) return fail(413, 'Request is too large.');
    body = JSON.parse(raw);
  } catch { return fail(400, 'Invalid JSON.'); }
  if (!body || typeof body.text !== 'string' || !body.text.trim()) {
    return fail(400, 'Provide nonempty text.');
  }
  const text = body.text.trim();
  if (text.length > 4000) return fail(413, 'Text must be at most 4000 characters.');
  if (!env.GEMINI_API_KEY || !env.TTS_RATE_LIMITER) {
    return fail(503, 'Premium voice is not configured.');
  }

  try {
    // Cloudflare supplies this header; it is not a user-provided identity in production.
    const key = request.headers.get('CF-Connecting-IP');
    if (!key) return fail(503, 'Premium voice is unavailable.');
    const { success } = await env.TTS_RATE_LIMITER.limit({ key: 'tts:' + key });
    if (!success) return fail(429, 'Please wait before reading again.', { 'Retry-After': '60' });
  } catch { return fail(503, 'Premium voice is unavailable.'); }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) controller.abort();
  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        store: false,
        input: [{ type: 'user_input', content: [{
          type: 'text', text,
          annotations: [{ type: 'speech_metadata', style: STYLE }],
        }] }],
        response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: 24000 },
        generation_config: { speech_config: [{ voice: 'Kore' }] },
      }),
    });
    // Never forward provider errors, request text, or credentials to clients or logs.
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return upstream.status === 429
        ? fail(429, 'Premium voice is busy.', { 'Retry-After': '60' })
        : fail(502, 'Premium voice is temporarily unavailable.');
    }
    const data = await upstream.json();
    const blocks = (data.steps || []).filter(step => step.type === 'model_output')
      .flatMap(step => step.content || []).filter(part => part.type === 'audio');
    const audio = blocks.at(-1);
    if (typeof audio?.data !== 'string' || audio.data.length > 22000000) {
      return fail(502, 'No playable audio was returned.');
    }
    const binary = atob(audio.data);
    if (binary.length < 44 || binary.slice(0, 4) !== 'RIFF' || binary.slice(8, 12) !== 'WAVE') {
      return fail(502, 'No playable audio was returned.');
    }
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new Response(bytes, {
      headers: { ...cors, 'Content-Type': 'audio/wav', 'Content-Length': String(bytes.byteLength) },
    });
  } catch {
    return fail(controller.signal.aborted ? 504 : 502, 'Premium voice is temporarily unavailable.');
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener('abort', abort);
  }
}
