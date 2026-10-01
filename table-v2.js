(() => {
  'use strict';

  if (!window.TeachingTableMode) {
    window.TeachingTableMode = {
      get() {
        return document.body.dataset.annotationMode || '';
      },
      set(mode = '') {
        const next = ['math', 'write', 'read'].includes(mode) ? mode : '';
        document.body.dataset.annotationMode = next;
        document.body.classList.toggle('math-place-mode', next === 'math');
        document.body.classList.toggle('write-mode', next === 'write');
        document.body.classList.toggle('read-mode', next === 'read');

        const mathBtn = document.getElementById('mathPanelBtn');
        const writeBtn = document.getElementById('writeBtn');
        const readBtn = document.getElementById('readBtn');
        mathBtn?.classList.toggle('is-on', next === 'math');
        writeBtn?.classList.toggle('is-on', next === 'write');
        readBtn?.classList.toggle('is-on', next === 'read');

        if (next === 'math') {
          document.body.classList.add('math-panel-open');
        } else {
          document.body.classList.remove('math-panel-open');
          if (document.activeElement?.tagName === 'MATH-FIELD') {
            try { document.activeElement.blur(); } catch {}
          }
        }

        document.dispatchEvent(new CustomEvent('teachingtablemodechange', { detail: { mode: next } }));
      }
    };
  }

  function enhance() {
    const dock = document.getElementById('tools-dock');
    const side = document.querySelector('.side');
    if (!dock || !side) return;

    const curriculumBtn = document.getElementById('curriculumBtn');
    const tidyBtn = document.getElementById('tidyBtn');

    let documentBtn = document.getElementById('documentBtn');
    if (!documentBtn) {
      documentBtn = document.createElement('button');
      documentBtn.id = 'documentBtn';
      documentBtn.type = 'button';
      documentBtn.textContent = '▧ Document';
      documentBtn.setAttribute('aria-label', 'open a worksheet, image, or PDF');
      if (curriculumBtn?.nextSibling) dock.insertBefore(documentBtn, curriculumBtn.nextSibling);
      else dock.insertBefore(documentBtn, tidyBtn || null);

      documentBtn.addEventListener('click', () => {
        const worksheetBtn = document.getElementById('worksheetBtn');
        if (!worksheetBtn) return;
        worksheetBtn.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerType: 'mouse'
        }));
      });
    }

    let toolsBtn = document.getElementById('toolsBtn');
    if (!toolsBtn) {
      toolsBtn = document.createElement('button');
      toolsBtn.id = 'toolsBtn';
      toolsBtn.type = 'button';
      toolsBtn.textContent = '＋ Tools';
      toolsBtn.setAttribute('aria-expanded', 'false');
      dock.insertBefore(toolsBtn, tidyBtn || null);
    }

    let mathBtn = document.getElementById('mathPanelBtn');
    if (!mathBtn) {
      mathBtn = document.createElement('button');
      mathBtn.id = 'mathPanelBtn';
      mathBtn.type = 'button';
      mathBtn.textContent = '123 Math';
      mathBtn.setAttribute('aria-expanded', 'false');
      dock.insertBefore(mathBtn, tidyBtn || null);
    }

    let palette = document.getElementById('tool-palette');
    if (!palette) {
      palette = document.createElement('div');
      palette.id = 'tool-palette';
      palette.setAttribute('aria-label', 'Math Things tools');
      document.body.appendChild(palette);
    }

    function syncPalette() {
      // renderDock() in the original Teaching Table rebuilds these wrappers.
      // Move the freshly populated wrappers into the standalone palette each time.
      [...dock.querySelectorAll('.domain-btn-wrap')].forEach(w => palette.appendChild(w));
    }

    syncPalette();

    if (!dock.__toolPaletteObserver) {
      const observer = new MutationObserver(() => queueMicrotask(syncPalette));
      observer.observe(dock, { childList: true });
      dock.__toolPaletteObserver = observer;
    }

    function setTools(open) {
      palette.classList.toggle('show', open);
      toolsBtn.classList.toggle('is-on', open);
      toolsBtn.setAttribute('aria-expanded', String(open));
    }

    function setMath(open) {
      document.body.classList.toggle('math-panel-open', open);
      mathBtn.classList.toggle('is-on', open);
      mathBtn.setAttribute('aria-expanded', String(open));
    }

    if (!toolsBtn.__wired) {
      toolsBtn.addEventListener('click', e => {
        e.stopPropagation();
        syncPalette();
        setTools(!palette.classList.contains('show'));
      });
      toolsBtn.__wired = true;
    }

    if (!mathBtn.__wired) {
      mathBtn.addEventListener('click', e => {
        e.stopPropagation();
        const mode = window.TeachingTableMode?.get?.() || '';
        window.TeachingTableMode?.set?.(mode === 'math' ? '' : 'math');
      });
      mathBtn.__wired = true;
    }

    if (!palette.__wired) {
      palette.addEventListener('pointerdown', e => e.stopPropagation());
      palette.__wired = true;
    }
    if (!side.__wiredV2) {
      side.addEventListener('pointerdown', e => e.stopPropagation());
      side.__wiredV2 = true;
    }

    if (!document.documentElement.__tableV2GlobalWired) {
      document.addEventListener('pointerdown', e => {
        const p = document.getElementById('tool-palette');
        const tb = document.getElementById('toolsBtn');
        const sb = document.querySelector('.side');
        const mb = document.getElementById('mathPanelBtn');

        if (p && !p.contains(e.target) && e.target !== tb) setTools(false);
        if (
          sb &&
          !sb.contains(e.target) &&
          e.target !== mb &&
          !e.target.closest?.('math-field') &&
          !e.target.closest?.('.digit-cell') &&
          !e.target.closest?.('.algo-block') &&
          !e.target.closest?.('.text-note') &&
          (window.TeachingTableMode?.get?.() || '') !== 'math'
        ) {
          setMath(false);
        }
      }, true);

      document.addEventListener('focusin', e => {
        if (e.target.closest?.('math-field') || e.target.closest?.('.digit-cell')) {
          setMath(true);
        }
      });

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          setTools(false);
          setMath(false);
          window.TeachingTableMode?.set?.('');
        }
      });

      document.addEventListener('pointerdown', e => {
        if (e.target.closest?.('[data-alg]')) setMath(true);
      });

      document.documentElement.__tableV2GlobalWired = true;
    }

    const surface = document.getElementById('surface-controls');
    if (surface && !document.body.classList.contains('has-curriculum')) {
      surface.classList.remove('active');
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => setTimeout(enhance, 0), { once: true });
  } else {
    setTimeout(enhance, 0);
  }

  window.addEventListener('load', () => {
    setTimeout(enhance, 100);
    setTimeout(enhance, 600);
  }, { once: true });
})();