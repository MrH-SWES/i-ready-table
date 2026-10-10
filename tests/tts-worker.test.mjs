import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTts } from '../worker/tts.mjs';

const origin = 'https://mrh-swes.github.io';
const env = { GEMINI_API_KEY: 'test-only-secret', TTS_RATE_LIMITER: { limit: async () => ({ success: true }) } };
function request(body = { text: 'Let us read together.' }, options = {}) {
  return new Request('https://relay.example/tts', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify(body), ...options,
  });
}
function wav() {
  const bytes = Buffer.alloc(48);
  bytes.write('RIFF'); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(4, 40);
  return bytes;
}

test('migration allows exactly both app origins and returns the requesting origin', async () => {
  for (const allowed of [origin, 'https://app.maththingsedtech.com']) {
    for (const method of ['OPTIONS', 'POST']) {
      const response = await handleTts(new Request('https://relay.example/tts', {
        method, headers: { Origin: allowed, 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: '{"text":"synthetic"}' } : {}),
      }), {});
      assert.equal(response.status, method === 'OPTIONS' ? 204 : 503);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowed);
      assert.equal(response.headers.get('Vary'), 'Origin');
    }
  }
  for (const denied of ['', 'https://maththingsedtech.com', 'http://app.maththingsedtech.com',
    'https://app.maththingsedtech.com.evil.example']) {
    const response = await handleTts(new Request('https://relay.example/tts', {
      method: 'OPTIONS', headers: { Origin: denied },
    }), env);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
});

test('keeps upload routing untouched and enforces origin, methods, and JSON', async () => {
  assert.equal(await handleTts(new Request('https://relay.example/upload'), env), null);
  const denied = await handleTts(request({}, { headers: { Origin: 'https://other.example' } }), env);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  const preflight = await handleTts(request(undefined, { method: 'OPTIONS', body: undefined }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal((await handleTts(request(undefined, { method: 'GET', body: undefined }), env)).status, 405);
  assert.equal((await handleTts(request({}, { headers: { Origin: origin, 'Content-Type': 'text/plain' } }), env)).status, 415);
  for (const body of [null, {}, { text: 4 }, { text: '  ' }]) assert.equal((await handleTts(request(body), env)).status, 400);
  assert.equal((await handleTts(request({}, { body: '{' }), env)).status, 400);
  assert.equal((await handleTts(request({ text: 'x'.repeat(4001) }), env)).status, 413);
  assert.equal((await handleTts(request({ text: 'x'.repeat(21000) }), env)).status, 413);
});

test('fails closed when credentials or limiter are missing; throttles before provider call', async () => {
  assert.equal((await handleTts(request(), {})).status, 503);
  assert.equal((await handleTts(request(), { GEMINI_API_KEY: 'test' })).status, 503);
  const response = await handleTts(request(), { ...env, TTS_RATE_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
});

test('sends key only upstream, separates style, disables storage, and returns WAV bytes', async t => {
  const bytes = wav();
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(init.headers['x-goog-api-key'], env.GEMINI_API_KEY);
    const payload = JSON.parse(init.body);
    assert.equal(payload.model, 'gemini-3.8-flash-tts');
    assert.equal(payload.store, false);
    assert.equal(payload.input[0].content[0].text, 'Let us read together.');
    assert.match(payload.input[0].content[0].annotations[0].style, /elementary-school teacher/);
    assert.equal(payload.response_format.mime_type, 'audio/wav');
    return Response.json({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: bytes.toString('base64') }] }] });
  });
  const response = await handleTts(request(), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'audio/wav');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.ok(!JSON.stringify([...response.headers]).includes(env.GEMINI_API_KEY));
  const appResponse = await handleTts(request(undefined, {
    headers: { Origin: 'https://app.maththingsedtech.com', 'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.1' },
  }), env);
  assert.equal(appResponse.status, 200);
  assert.equal(appResponse.headers.get('Access-Control-Allow-Origin'), 'https://app.maththingsedtech.com');
  assert.deepEqual(Buffer.from(await appResponse.arrayBuffer()), bytes);
});

test('sanitizes provider failures and rejects non-audio responses', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('secret and transcript', { status: 403 }));
  const response = await handleTts(request(), env);
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('secret'), false);
  mock.mock.mockImplementation(async () => Response.json({ steps: [] }));
  assert.equal((await handleTts(request(), env)).status, 502);
  mock.mock.mockImplementation(async () => Response.json({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: btoa('not a WAV') }] }] }));
  assert.equal((await handleTts(request(), env)).status, 502);
  mock.mock.mockImplementation(async () => new Response('', { status: 429 }));
  assert.equal((await handleTts(request(), env)).status, 429);
});
