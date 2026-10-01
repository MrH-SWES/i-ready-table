
(() => {
  'use strict';

  const stage = document.getElementById('stage');
  const pad = document.getElementById('pad');
  const dock = document.getElementById('tools-dock');
  if (!stage || !pad || !dock) return;

  const STORAGE_KEY = 'i-ready-table-text-notes-v1';
  let activeRecognition = null;
  let activeMicButton = null;
  let saveTimer = null;

  function makeButton(id, text, label) {
    let b = document.getElementById(id);
    if (b) return b;
    b = document.createElement('button');
    b.id = id;
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    const toolsBtn = document.getElementById('toolsBtn');
    dock.insertBefore(b, toolsBtn || document.getElementById('tidyBtn') || null);
    return b;
  }

  const writeBtn = makeButton('writeBtn', 'Aa Write', 'add a written response');
  const readBtn = makeButton('readBtn', '🔊 Read', 'read curriculum text aloud');

  const mode = () => window.TeachingTableMode?.get?.() || '';

  function setWriteMode(on) {
    window.TeachingTableMode?.set?.(on ? 'write' : '');
  }

  function setReadMode(on) {
    window.TeachingTableMode?.set?.(on ? 'read' : '');
    configureCurriculumFrame();
    if (!on && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  writeBtn.addEventListener('click', () => setWriteMode(mode() !== 'write'));
  readBtn.addEventListener('click', () => setReadMode(mode() !== 'read'));

  document.addEventListener('teachingtablemodechange', () => {
    configureCurriculumFrame();
    if (mode() !== 'read' && 'speechSynthesis' in window) speechSynthesis.cancel();
  });

  function ensureGuides() {
    let v = stage.querySelector('.snap-guide.vertical');
    let h = stage.querySelector('.snap-guide.horizontal');
    if (!v) {
      v = document.createElement('div');
      v.className = 'snap-guide vertical';
      stage.appendChild(v);
    }
    if (!h) {
      h = document.createElement('div');
      h.className = 'snap-guide horizontal';
      stage.appendChild(h);
    }
    return { v, h };
  }

  function clearGuides() {
    stage.querySelectorAll('.snap-guide').forEach(g => g.classList.remove('show'));
  }

  function snapPosition(target, proposedX, proposedY, threshold = 11) {
    const guides = ensureGuides();
    const tw = target.offsetWidth || 0;
    const th = target.offsetHeight || 0;

    let bestX = { delta: 0, dist: Infinity, guide: null };
    let bestY = { delta: 0, dist: Infinity, guide: null };

    const others = [...stage.querySelectorAll('.row.positioned, .algo-holder.positioned, .text-note.positioned')]
      .filter(el => el !== target);

    const tX = [proposedX, proposedX + tw / 2, proposedX + tw];
    const tY = [proposedY, proposedY + th / 2, proposedY + th];

    for (const other of others) {
      const ox = parseFloat(other.style.left) || 0;
      const oy = parseFloat(other.style.top) || 0;
      const ow = other.offsetWidth || 0;
      const oh = other.offsetHeight || 0;
      const oX = [ox, ox + ow / 2, ox + ow];
      const oY = [oy, oy + oh / 2, oy + oh];

      for (const a of tX) {
        for (const b of oX) {
          const d = b - a;
          const dist = Math.abs(d);
          if (dist <= threshold && dist < bestX.dist) {
            bestX = { delta: d, dist, guide: b };
          }
        }
      }

      for (const a of tY) {
        for (const b of oY) {
          const d = b - a;
          const dist = Math.abs(d);
          if (dist <= threshold && dist < bestY.dist) {
            bestY = { delta: d, dist, guide: b };
          }
        }
      }
    }

    if (bestX.guide != null) {
      guides.v.style.left = bestX.guide + 'px';
      guides.v.classList.add('show');
    } else {
      guides.v.classList.remove('show');
    }

    if (bestY.guide != null) {
      guides.h.style.top = bestY.guide + 'px';
      guides.h.classList.add('show');
    } else {
      guides.h.classList.remove('show');
    }

    return {
      x: Math.max(0, proposedX + bestX.delta),
      y: Math.max(0, proposedY + bestY.delta),
    };
  }

  window.TeachingTableSnap = {
    snap: snapPosition,
    clear: clearGuides,
  };

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNotes, 120);
  }

  function saveNotes() {
    const notes = [...stage.querySelectorAll('.text-note')].map(note => ({
      text: note.querySelector('.text-note-editor')?.innerText || '',
      x: parseFloat(note.style.left) || 0,
      y: parseFloat(note.style.top) || 0,
      width: note.offsetWidth || 320,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function speak(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.lang = 'en-US';
    speechSynthesis.speak(utterance);
  }

  function startDictation(editor, micBtn) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      micBtn.title = 'Speech recognition is not available in this browser.';
      return;
    }

    if (activeRecognition) {
      try { activeRecognition.stop(); } catch {}
      activeRecognition = null;
      if (activeMicButton) {
        activeMicButton.classList.remove('listening');
        activeMicButton.closest('.text-note')?.classList.remove('listening');
      }
      activeMicButton = null;
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    const original = editor.innerText || '';
    const prefix = original && !/\s$/.test(original) ? original + ' ' : original;
    let finalText = '';

    activeRecognition = recognition;
    activeMicButton = micBtn;
    micBtn.classList.add('listening');
    micBtn.closest('.text-note')?.classList.add('listening');

    recognition.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      editor.innerText = prefix + finalText + interim;
      editor.focus({ preventScroll: true });
      scheduleSave();
    };

    recognition.onerror = event => {
      console.warn('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
      micBtn.classList.remove('listening');
      micBtn.closest('.text-note')?.classList.remove('listening');
      if (activeRecognition === recognition) activeRecognition = null;
      if (activeMicButton === micBtn) activeMicButton = null;
      scheduleSave();
    };

    try { recognition.start(); } catch (err) {
      console.warn('Could not start speech recognition:', err);
      recognition.onend();
    }
  }

  function enableNoteDrag(note, handle) {
    let drag = null;

    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        left: parseFloat(note.style.left) || 0,
        top: parseFloat(note.style.top) || 0,
      };
      note.classList.add('active');
    });

    handle.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const proposedX = drag.left + e.clientX - drag.startX;
      const proposedY = drag.top + e.clientY - drag.startY;
      const snapped = snapPosition(note, proposedX, proposedY);
      note.style.left = snapped.x + 'px';
      note.style.top = snapped.y + 'px';
    });

    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      clearGuides();
      scheduleSave();
    }

    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function fitTextNote(note) {
    const editor = note.querySelector('.text-note-editor');
    if (!editor) return;
    const text = (editor.innerText || '').replace(/\n/g, ' ');
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:500 20px/1.34 Lexend,system-ui,sans-serif;';
    probe.textContent = text || 'Type…';
    document.body.appendChild(probe);
    const natural = Math.ceil(probe.getBoundingClientRect().width + 18);
    probe.remove();
    note.style.width = Math.max(96, Math.min(440, natural)) + 'px';
  }

  function createTextNote(text = '', x = 40, y = 40, width = 132) {
    const note = document.createElement('div');
    note.className = 'text-note positioned';
    note.style.left = Math.max(0, x) + 'px';
    note.style.top = Math.max(0, y) + 'px';
    note.style.width = Math.max(96, Math.min(440, width || 132)) + 'px';

    const bar = document.createElement('div');
    bar.className = 'text-note-bar';

    const grip = document.createElement('div');
    grip.className = 'text-note-grip';
    grip.textContent = '•••';
    grip.setAttribute('aria-label', 'drag written response');

    const mic = document.createElement('button');
    mic.type = 'button';
    mic.className = 'text-note-mic';
    mic.textContent = '🎙';
    mic.setAttribute('aria-label', 'dictate written response');

    const hear = document.createElement('button');
    hear.type = 'button';
    hear.textContent = '🔊';
    hear.setAttribute('aria-label', 'read written response aloud');

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '×';
    del.setAttribute('aria-label', 'delete written response');

    const editor = document.createElement('div');
    editor.className = 'text-note-editor';
    editor.contentEditable = 'true';
    editor.spellcheck = true;
    editor.innerText = text;

    bar.append(grip, mic, hear, del);
    note.append(bar, editor);
    stage.appendChild(note);

    enableNoteDrag(note, grip);

    note.addEventListener('pointerdown', () => {
      stage.querySelectorAll('.text-note.active').forEach(n => {
        if (n !== note) n.classList.remove('active');
      });
      note.classList.add('active');
    });

    editor.addEventListener('input', () => {
      fitTextNote(note);
      scheduleSave();
    });
    editor.addEventListener('blur', scheduleSave);

    mic.addEventListener('click', e => {
      e.stopPropagation();
      startDictation(editor, mic);
    });

    hear.addEventListener('click', e => {
      e.stopPropagation();
      speak(editor.innerText);
    });

    del.addEventListener('click', e => {
      e.stopPropagation();
      if (activeMicButton === mic && activeRecognition) {
        try { activeRecognition.stop(); } catch {}
      }
      note.remove();
      scheduleSave();
    });

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      mic.disabled = true;
      mic.title = 'Speech recognition is not available in this browser.';
    }

    requestAnimationFrame(() => fitTextNote(note));
    scheduleSave();
    return note;
  }

  function restoreNotes() {
    let notes = [];
    try {
      notes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(notes)) notes = [];
    } catch {
      notes = [];
    }

    notes.forEach(n => createTextNote(
      n.text || '',
      Number(n.x) || 0,
      Number(n.y) || 0,
      Number(n.width) || 132
    ));
  }

  stage.addEventListener('click', e => {
    if (mode() !== 'write') return;
    if (e.target.closest?.('.text-note, .row, .algo-holder, .tool-window')) return;

    // Capture the click before the original worksheet handler can create a math box.
    e.preventDefault();
    e.stopImmediatePropagation();

    const rect = stage.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const note = createTextNote('', Math.max(0, clickX - 4), Math.max(0, clickY - 25));
    const editor = note.querySelector('.text-note-editor');
    editor.focus({ preventScroll: true });
  }, true);

  function meaningfulTextTarget(target) {
    if (!target || target.nodeType !== 1) return null;
    const preferred = target.closest?.(
      'p,li,h1,h2,h3,h4,h5,h6,td,th,label,figcaption,blockquote'
    );
    if (preferred && preferred.textContent.trim()) return preferred;

    let el = target;
    while (el && el !== el.ownerDocument.body) {
      const text = (el.textContent || '').trim();
      if (text && text.length <= 500) return el;
      el = el.parentElement;
    }
    return null;
  }

  function wireReadFrame(frame) {
    if (!frame) return;

    const apply = () => {
      frame.style.pointerEvents = mode() === 'read' ? 'auto' : 'none';
      let doc;
      try { doc = frame.contentDocument; } catch { return; }
      if (!doc || doc.__readModeWired) return;

      doc.addEventListener('click', e => {
        if (mode() !== 'read') return;
        e.preventDefault();
        e.stopPropagation();
        const block = meaningfulTextTarget(e.target);
        if (block) speak(block.textContent);
      }, true);

      doc.__readModeWired = true;
    };

    apply();
    if (!frame.__readLoadWired) {
      frame.addEventListener('load', apply);
      frame.__readLoadWired = true;
    }
  }

  function configureCurriculumFrame() {
    wireReadFrame(document.getElementById('curriculum-surface'));
  }

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node?.id === 'curriculum-surface') wireReadFrame(node);
      }
    }
  });
  observer.observe(stage, { childList: true });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      window.TeachingTableMode?.set?.('');
    }
  });

  // Let the original Teaching Table finish restoring its own saved annotations first.
  window.addEventListener('load', () => {
    setTimeout(() => {
      restoreNotes();
      configureCurriculumFrame();
    }, 700);
  }, { once: true });
})();