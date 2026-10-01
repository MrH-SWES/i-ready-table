(() => {
  'use strict';

  function enhance() {
    const dock = document.getElementById('tools-dock');
    const side = document.querySelector('.side');
    if (!dock || !side || document.getElementById('toolsBtn')) return;

    const curriculumBtn = document.getElementById('curriculumBtn');
    const tidyBtn = document.getElementById('tidyBtn');
    const domainWraps = [...dock.querySelectorAll('.domain-btn-wrap')];

    const toolsBtn = document.createElement('button');
    toolsBtn.id = 'toolsBtn';
    toolsBtn.type = 'button';
    toolsBtn.textContent = '＋ Tools';
    toolsBtn.setAttribute('aria-expanded', 'false');

    const mathBtn = document.createElement('button');
    mathBtn.id = 'mathPanelBtn';
    mathBtn.type = 'button';
    mathBtn.textContent = '123 Math';
    mathBtn.setAttribute('aria-expanded', 'false');

    if (curriculumBtn?.nextSibling) {
      dock.insertBefore(toolsBtn, curriculumBtn.nextSibling);
      dock.insertBefore(mathBtn, toolsBtn.nextSibling);
    } else {
      dock.insertBefore(toolsBtn, tidyBtn || null);
      dock.insertBefore(mathBtn, tidyBtn || null);
    }

    const palette = document.createElement('div');
    palette.id = 'tool-palette';
    palette.setAttribute('aria-label', 'Math Things tools');
    document.body.appendChild(palette);
    domainWraps.forEach(w => palette.appendChild(w));

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

    toolsBtn.addEventListener('click', e => {
      e.stopPropagation();
      setTools(!palette.classList.contains('show'));
    });

    mathBtn.addEventListener('click', e => {
      e.stopPropagation();
      setMath(!document.body.classList.contains('math-panel-open'));
    });

    palette.addEventListener('pointerdown', e => e.stopPropagation());
    side.addEventListener('pointerdown', e => e.stopPropagation());

    document.addEventListener('pointerdown', e => {
      if (!palette.contains(e.target) && e.target !== toolsBtn) setTools(false);
      if (
        !side.contains(e.target) &&
        e.target !== mathBtn &&
        !e.target.closest('math-field') &&
        !e.target.closest('.digit-cell') &&
        !e.target.closest('.algo-block')
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
      }
    });

    // A selected algorithm is a math-entry context.
    document.addEventListener('pointerdown', e => {
      if (e.target.closest?.('[data-alg]')) setMath(true);
    });

    // Keep the surface bar useful when there is no curriculum yet.
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

  // Math Things populates its dock after load; the moved wrappers remain valid,
  // but a second pass handles slow MathLive/network initialization safely.
  window.addEventListener('load', () => setTimeout(enhance, 250), { once: true });
})();