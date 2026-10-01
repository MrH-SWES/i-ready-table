(() => {
  'use strict';

  // This file contains only the relay URL. API credentials live in the Worker.
  const MAX_CHUNK = 1200;
  const CACHE_BYTES = 8 * 1024 * 1024;
  const cache = new Map();
  let cacheBytes = 0;
  let audioContext;
  let current = null;
  let retryAfter = 0;

  function chunks(text) {
    const result = [];
    let rest = text;
    while (rest.length > MAX_CHUNK) {
      const head = rest.slice(0, MAX_CHUNK + 1);
      let end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
      end = end > MAX_CHUNK / 3 ? end + 1 : head.lastIndexOf(' ');
      if (end < 1) end = MAX_CHUNK;
      // Do not split a surrogate pair in unusually long unbroken text.
      if (/[\uD800-\uDBFF]/.test(rest[end - 1])) end--;
      result.push(rest.slice(0, end).trim());
      rest = rest.slice(end).trim();
    }
    if (rest) result.push(rest);
    return result;
  }

  function state(job, value) {
    if (current === job) job.onState(value);
  }

  function stop() {
    const job = current;
    current = null;
    if (job) {
      job.abort?.abort();
      job.cancelPlayback?.();
      job.onState('idle');
    }
    window.speechSynthesis?.cancel();
  }

  function remember(key, bytes) {
    if (bytes.byteLength > CACHE_BYTES) return;
    while (cache.size && (cacheBytes + bytes.byteLength > CACHE_BYTES || cache.size >= 8)) {
      const first = cache.keys().next().value;
      cacheBytes -= cache.get(first).byteLength;
      cache.delete(first);
    }
    cache.set(key, bytes);
    cacheBytes += bytes.byteLength;
  }

  async function getAudio(job, text) {
    const base = String(window.TEACHING_TABLE_WORKER_URL || '').replace(/\/+$/, '');
    if (!base) throw new Error('Relay unavailable');
    const key = base + '\n' + text;
    if (cache.has(key)) {
      const bytes = cache.get(key);
      cache.delete(key);
      cache.set(key, bytes);
      return bytes;
    }
    if (Date.now() < retryAfter) throw new Error('Relay cooling down');
    const controller = new AbortController();
    job.abort = controller;
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(base + '/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Relay unavailable');
      if (!/^audio\/wav(?:;|$)/i.test(response.headers.get('Content-Type') || '')) {
        throw new Error('Unexpected audio format');
      }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 44 || bytes.byteLength > 16 * 1024 * 1024) {
        throw new Error('Invalid audio length');
      }
      if (current === job) remember(key, bytes);
      return bytes;
    } catch (error) {
      if (current === job) retryAfter = Date.now() + 60000;
      throw error;
    } finally {
      clearTimeout(timer);
      if (job.abort === controller) job.abort = null;
    }
  }

  function play(job, buffer) {
    return new Promise((resolve, reject) => {
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      const finish = () => {
        source.onended = null;
        source.disconnect();
        job.cancelPlayback = null;
        resolve();
      };
      source.onended = finish;
      job.cancelPlayback = () => { try { source.stop(); } catch {} finish(); };
      try { source.start(); } catch (error) {
        source.onended = null;
        source.disconnect();
        job.cancelPlayback = null;
        reject(error);
      }
    });
  }

  function browserVoice(job, text) {
    if (current !== job) return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      state(job, 'unavailable');
      current = null;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.lang = 'en-US';
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang === 'en-US' && v.default)
      || voices.find(v => v.lang === 'en-US');
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      if (current === job) { state(job, 'idle'); current = null; }
    };
    utterance.onerror = () => {
      if (current === job) { state(job, 'unavailable'); current = null; }
    };
    job.utterance = utterance;
    state(job, 'fallback');
    window.speechSynthesis.speak(utterance);
  }

  async function speak(text, onState = () => {}) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    const same = current?.text === value;
    stop();
    if (!value || same) return;
    const job = { text: value, onState };
    current = job;
    state(job, 'loading');
    const parts = chunks(value);
    let index = 0;
    try {
      // Resume during the click gesture, before the network request, for autoplay rules.
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('Web Audio unavailable');
      if (!audioContext || audioContext.state === 'closed') audioContext = new Context();
      await audioContext.resume();
      for (; index < parts.length; index++) {
        if (current !== job) return;
        state(job, 'loading');
        const bytes = await getAudio(job, parts[index]);
        if (current !== job) return;
        const buffer = await audioContext.decodeAudioData(bytes.slice(0));
        if (current !== job) return;
        state(job, 'premium');
        await play(job, buffer);
      }
      if (current === job) { state(job, 'idle'); current = null; }
    } catch {
      // A cancelled/older request must never interrupt newer audio with its fallback.
      if (current === job) browserVoice(job, parts.slice(index).join(' '));
    }
  }

  window.TeachingTableSpeech = { speak, stop };
  window.addEventListener('pagehide', () => { stop(); cache.clear(); cacheBytes = 0; });
})();
