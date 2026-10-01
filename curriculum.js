(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const state = {
    zip: null,
    navPath: '',
    toc: [],
    current: -1,
    urls: new Set(),
    bookTitle: '',
  };

  const btn = $('#curriculumBtn');
  const drawer = $('#curriculum-drawer');
  const close = $('#curriculum-close');
  const pick = $('#curriculum-pick');
  const input = $('#curriculumFile');
  const tocEl = $('#curriculum-toc');
  const search = $('#curriculum-search');
  const status = $('#curriculum-status');
  const stage = $('#stage');
  const pad = $('#pad');
  const worksheetImg = $('#worksheet-img');

  if (!btn || !drawer || !input || !stage || !window.JSZip) return;

  function ensureSurfaceControls() {
    let controls = $('#surface-controls');
    if (controls) return controls;

    controls = document.createElement('div');
    controls.id = 'surface-controls';
    controls.innerHTML = `
      <button type="button" id="surface-prev" aria-label="previous curriculum section">‹</button>
      <div id="surface-label" title="Current curriculum section">No lesson open</div>
      <button type="button" id="surface-next" aria-label="next curriculum section">›</button>
      <button type="button" id="surface-fit" aria-label="fit curriculum page">Fit</button>
    `;

    const dock = $('#tools-dock');
    const tidy = $('#tidyBtn');
    if (dock) dock.insertBefore(controls, tidy || null);

    controls.querySelector('#surface-prev').addEventListener('click', () => moveSection(-1));
    controls.querySelector('#surface-next').addEventListener('click', () => moveSection(1));
    controls.querySelector('#surface-fit').addEventListener('click', fitSurface);
    return controls;
  }

  const surfaceControls = ensureSurfaceControls();
  const surfaceLabel = () => $('#surface-label');
  const surfacePrev = () => $('#surface-prev');
  const surfaceNext = () => $('#surface-next');

  const setStatus = (m, e = false) => {
    status.textContent = m;
    status.classList.toggle('error', e);
  };

  const parse = t => new DOMParser().parseFromString(t, 'application/xml');
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const dirname = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';

  function resolve(base, rel) {
    let r = (rel || '').split('#')[0].split('?')[0];
    if (!r) return base;
    try { r = decodeURIComponent(r); } catch {}
    const parts = r.startsWith('/') ? [] : dirname(base).split('/').filter(Boolean);
    r.replace(/^\/+/, '').split('/').forEach(x => {
      if (!x || x === '.') return;
      if (x === '..') parts.pop();
      else parts.push(x);
    });
    return parts.join('/');
  }

  const extUrl = u =>
    /^(?:[a-z]+:)?\/\//i.test(u) ||
    /^(?:data|blob|mailto|tel):/i.test(u);

  const mime = p => ({
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
  })[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

  function revoke() {
    state.urls.forEach(URL.revokeObjectURL);
    state.urls.clear();
  }

  async function assetUrl(path) {
    const f = state.zip?.file(path);
    if (!f) return '';
    const b = await f.async('blob');
    const u = URL.createObjectURL(
      b.type ? b : new Blob([b], { type: mime(path) })
    );
    state.urls.add(u);
    return u;
  }

  function openDrawer() {
    drawer.classList.add('show');
    drawer.setAttribute('aria-hidden', 'false');
    btn.classList.add('is-on');
  }

  function closeDrawer() {
    drawer.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
    btn.classList.remove('is-on');
  }

  btn.addEventListener('click', openDrawer);
  close.addEventListener('click', closeDrawer);
  pick.addEventListener('click', () => input.click());
  search.addEventListener('input', renderToc);

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    setStatus('Opening ' + file.name + '…');
    tocEl.innerHTML = '';

    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const container = zip.file('META-INF/container.xml');
      if (!container) throw Error('Not a valid EPUB.');

      const cdoc = parse(await container.async('text'));
      const root = [...cdoc.getElementsByTagNameNS('*', 'rootfile')][0];
      const opfPath = root?.getAttribute('full-path');
      if (!opfPath) throw Error('EPUB package file not found.');

      const opfFile = zip.file(opfPath);
      if (!opfFile) throw Error('EPUB package file missing.');

      const opf = parse(await opfFile.async('text'));
      let navHref = '';

      for (const item of [...opf.getElementsByTagNameNS('*', 'item')]) {
        if ((item.getAttribute('properties') || '').split(/\s+/).includes('nav')) {
          navHref = item.getAttribute('href') || '';
          break;
        }
      }

      if (!navHref) throw Error('No EPUB navigation document found.');

      const navPath = resolve(opfPath, navHref);
      const navFile = zip.file(navPath);
      if (!navFile) throw Error('Navigation file missing.');

      const nav = parse(await navFile.async('text'));
      const navs = [...nav.getElementsByTagNameNS('*', 'nav')];
      const tocNav =
        navs.find(n =>
          (
            n.getAttribute('epub:type') ||
            n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ||
            ''
          ).split(/\s+/).includes('toc')
        ) || navs[0];

      const links = [...tocNav.getElementsByTagNameNS('*', 'a')];
      const parent = new Map();
      [...tocNav.querySelectorAll('*')].forEach(p =>
        [...p.children].forEach(c => parent.set(c, p))
      );

      const depth = a => {
        let d = 0;
        let p = parent.get(a);
        while (p && p !== tocNav) {
          if ((p.localName || '').toLowerCase() === 'ol') d++;
          p = parent.get(p);
        }
        return Math.max(0, d - 1);
      };

      state.zip = zip;
      state.navPath = navPath;
      state.current = -1;
      state.toc = links
        .map((a, i) => ({
          i,
          label: clean(a.textContent) || ('Section ' + (i + 1)),
          href: a.getAttribute('href') || '',
          depth: depth(a),
        }))
        .filter(x => x.href);

      state.bookTitle =
        clean([...opf.getElementsByTagNameNS('*', 'title')][0]?.textContent) ||
        file.name.replace(/\.epub$/i, '');

      $('#curriculum-book-title').textContent = state.bookTitle;
      $('#curriculum-book-meta').textContent = state.toc.length + ' sections';
      search.disabled = false;
      search.value = '';
      renderToc();
      setStatus('Ready. Pick a lesson or session.');
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Could not open EPUB.', true);
    }

    input.value = '';
  });

  function renderToc() {
    const q = (search.value || '').toLowerCase().trim();
    tocEl.innerHTML = '';

    if (!state.zip) {
      tocEl.innerHTML =
        '<div class="curriculum-empty">Load an EPUB to browse lessons.</div>';
      return;
    }

    state.toc.forEach(item => {
      if (q && !item.label.toLowerCase().includes(q)) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'curriculum-toc-row';
      b.style.setProperty('--toc-depth', Math.min(item.depth, 6));
      b.textContent = item.label;
      b.onclick = () => openSection(item.i);
      tocEl.appendChild(b);
    });

    if (!tocEl.children.length) {
      tocEl.innerHTML =
        '<div class="curriculum-empty">No matching sections.</div>';
    }
  }

  async function openSection(index) {
    const item = state.toc[index];
    if (!item) return;

    state.current = index;
    setStatus('Loading ' + item.label + '…');

    try {
      const path = resolve(state.navPath, item.href.split('#')[0]);
      const f = state.zip.file(path);
      if (!f) throw Error('Section file not found.');

      const html = await renderChapter(await f.async('text'), path);
      showSurface(item.label, html, index);
      setStatus(item.label);
      closeDrawer();
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Could not open section.', true);
    }
  }

  function moveSection(delta) {
    if (state.current < 0 || !state.toc.length) return;
    const next = Math.max(
      0,
      Math.min(state.toc.length - 1, state.current + delta)
    );
    if (next !== state.current) openSection(next);
  }

  async function renderChapter(raw, path) {
    revoke();

    const doc = parse(raw);
    if (doc.querySelector('parsererror')) {
      throw Error('Lesson XHTML could not be parsed.');
    }

    doc.querySelectorAll('script,iframe,object,embed').forEach(e => e.remove());
    doc.querySelectorAll('*').forEach(e =>
      [...e.attributes].forEach(a => {
        if (/^on/i.test(a.name)) e.removeAttribute(a.name);
      })
    );

    const styles = [];
    for (const link of [...doc.querySelectorAll('link[rel~="stylesheet"][href]')]) {
      const cssPath = resolve(path, link.getAttribute('href'));
      const cssFile = state.zip.file(cssPath);
      if (cssFile) {
        let css = await cssFile.async('text');
        for (const m of [...css.matchAll(/url\(([^)]+)\)/g)]) {
          const rawUrl = (m[1] || '')
            .trim()
            .replace(/^['"]|['"]$/g, '');
          if (
            rawUrl &&
            !rawUrl.startsWith('data:') &&
            !rawUrl.startsWith('#') &&
            !extUrl(rawUrl)
          ) {
            const u = await assetUrl(resolve(cssPath, rawUrl));
            if (u) css = css.split(m[0]).join('url("' + u + '")');
          }
        }
        styles.push(css);
      }
      link.remove();
    }

    for (const [sel, attr] of [
      ['img', 'src'],
      ['source', 'src'],
      ['video', 'poster'],
      ['audio', 'src'],
      ['image', 'href'],
    ]) {
      for (const el of [...doc.querySelectorAll(sel + '[' + attr + ']')]) {
        const src = el.getAttribute(attr);
        if (!src || extUrl(src) || src.startsWith('#')) continue;
        const u = await assetUrl(resolve(path, src));
        if (u) el.setAttribute(attr, u);
      }
    }

    doc.querySelectorAll('a[href]').forEach(a => {
      if (!(a.getAttribute('href') || '').startsWith('#')) {
        a.removeAttribute('href');
      }
    });

    const body = doc.querySelector('body')?.innerHTML || raw;
    const inline = [...doc.querySelectorAll('style')]
      .map(s => s.textContent || '')
      .join('\n');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; media-src blob: data:; font-src blob: data:; style-src 'unsafe-inline' blob:;">
<style>
  html,body{margin:0;background:#fff;color:#1d1d1f;overflow:hidden}
  body{padding:0;line-height:1.45}
  img,svg,video{max-width:100%;height:auto}
  table{max-width:100%}
  ${styles.join('\n')}
  ${inline}
</style>
</head>
<body>${body}</body>
</html>`;
  }

  function fitSurface() {
    const frame = $('#curriculum-surface');
    if (!frame) return;
    frame.style.width = '100%';
    requestAnimationFrame(() => sizeSurface(frame));
  }

  function sizeSurface(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const root = doc.documentElement;
      const body = doc.body;
      const height = Math.max(
        root?.scrollHeight || 0,
        root?.offsetHeight || 0,
        body?.scrollHeight || 0,
        body?.offsetHeight || 0,
        600
      );
      frame.style.height = Math.ceil(height + 8) + 'px';
    } catch (err) {
      console.warn('Could not size curriculum surface', err);
    }
  }

  function showSurface(title, srcdoc, index) {
    let frame = $('#curriculum-surface');

    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'curriculum-surface';
      frame.className = 'curriculum-surface';
      frame.setAttribute('title', 'Curriculum page');
      frame.setAttribute('tabindex', '-1');
      stage.insertBefore(frame, stage.firstChild);
    }

    worksheetImg?.classList.add('hidden');
    pad.classList.add('curriculum-active');
    document.body.classList.add('has-curriculum');

    frame.onload = () => {
      sizeSurface(frame);
      requestAnimationFrame(() => sizeSurface(frame));
      setTimeout(() => sizeSurface(frame), 150);
    };
    frame.srcdoc = srcdoc;

    const label = surfaceLabel();
    if (label) {
      label.textContent =
        (state.bookTitle ? state.bookTitle + '  ›  ' : '') + title;
      label.title = label.textContent;
    }

    if (surfacePrev()) surfacePrev().disabled = index <= 0;
    if (surfaceNext()) surfaceNext().disabled = index >= state.toc.length - 1;

    if (surfaceControls) surfaceControls.classList.add('active');

    pad.scrollTop = 0;
  }

  window.addEventListener('resize', () => {
    const frame = $('#curriculum-surface');
    if (frame) {
      clearTimeout(frame.__resizeTimer);
      frame.__resizeTimer = setTimeout(() => sizeSurface(frame), 120);
    }
  });

  renderToc();
})();