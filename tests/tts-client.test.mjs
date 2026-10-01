import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../tts-client.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const audioResponse = () => new Response(new Uint8Array(48), { headers: { 'Content-Type': 'audio/wav' } });
function setup(fetchImpl = async () => audioResponse(), { hold = false } = {}) {
  const calls = []; const spoken = []; const sources = []; const order = [];
  class AudioContext {
    state = 'running'; destination = {};
    async resume() { order.push('resume'); }
    async decodeAudioData() { return {}; }
    createBufferSource() {
      const s = { connect() {}, disconnect() {}, stop() { s.stopped = true; },
        start() { if (!hold) queueMicrotask(() => s.onended?.()); } };
      sources.push(s); return s;
    }
  }
  class Utterance { constructor(text) { this.text = text; } }
  const window = {
    TEACHING_TABLE_WORKER_URL: 'https://relay.example', AudioContext,
    SpeechSynthesisUtterance: Utterance,
    speechSynthesis: { cancel() {}, getVoices: () => [], speak: u => spoken.push(u.text) },
    addEventListener() {},
  };
  vm.runInNewContext(source, { window, SpeechSynthesisUtterance: Utterance, AbortController, setTimeout, clearTimeout,
    fetch: async (url, init) => { order.push('fetch'); calls.push({ url, ...init }); return fetchImpl(url, init); },
  });
  return { api: window.TeachingTableSpeech, calls, spoken, sources, order };
}

test('premium audio works without browser voices, resumes before fetch, and caches replay', async () => {
  const s = setup(); const states = [];
  await s.api.speak('Hello there.', state => states.push(state));
  assert.deepEqual(states, ['loading', 'loading', 'premium', 'idle']);
  assert.deepEqual(s.order.slice(0, 2), ['resume', 'fetch']);
  assert.equal(s.calls[0].url, 'https://relay.example/tts');
  assert.deepEqual(JSON.parse(s.calls[0].body), { text: 'Hello there.' });
  assert.equal(s.calls[0].credentials, 'omit');
  await s.api.speak('Hello there.');
  assert.equal(s.calls.length, 1);
  assert.equal(s.sources.length, 2);
  assert.deepEqual(s.spoken, []);
});

test('uses browser voice on outage and avoids repeated failed requests', async () => {
  const s = setup(async () => new Response('Not found', { status: 404 }));
  await s.api.speak('First text.');
  await s.api.speak('Second text.');
  assert.deepEqual(s.spoken, ['First text.', 'Second text.']);
  assert.equal(s.calls.length, 1);
});

test('superseded requests never play stale audio or invoke stale fallback', async () => {
  let fail;
  const s = setup(() => s.calls.length === 1 ? new Promise((_, reject) => { fail = reject; }) : audioResponse());
  const first = s.api.speak('Old text.');
  await tick();
  await s.api.speak('New text.');
  assert.equal(s.calls[0].signal.aborted, true);
  fail(new Error('cancelled'));
  await first;
  assert.deepEqual(s.spoken, []);
  assert.equal(s.sources.length, 1);
});

test('repeated clicks stop playback; explicit stop cancels pending requests', async () => {
  const s = setup(undefined, { hold: true });
  const first = s.api.speak('Stop me.');
  await tick();
  await s.api.speak('Stop me.');
  await first;
  assert.equal(s.sources[0].stopped, true);
  assert.equal(s.calls.length, 1);
  let reject;
  const pending = setup(() => new Promise((_, r) => { reject = r; }));
  const job = pending.api.speak('Loading.');
  await tick(); pending.api.stop(); reject(new Error('cancelled')); await job;
  assert.equal(pending.calls[0].signal.aborted, true);
  assert.deepEqual(pending.spoken, []);
});

test('long passages preserve text and send sequential bounded chunks', async () => {
  const s = setup();
  const text = Array.from({ length: 100 }, (_, i) => `This is sentence number ${i}, which we can read together.`).join(' ');
  await s.api.speak(text);
  const chunks = s.calls.map(c => JSON.parse(c.body).text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 1200));
  assert.equal(chunks.join(' '), text);
  assert.equal(s.sources.length, chunks.length);
});

test('a later chunk failure falls back only for the unread remainder', async () => {
  const s = setup(() => s.calls.length === 1 ? audioResponse() : new Response('', { status: 500 }));
  const text = Array.from({ length: 100 }, (_, i) => `This is sentence number ${i}, which we can read together.`).join(' ');
  await s.api.speak(text);
  const firstChunk = JSON.parse(s.calls[0].body).text;
  assert.equal(firstChunk + ' ' + s.spoken[0], text);
  assert.equal(s.sources.length, 1);
});
