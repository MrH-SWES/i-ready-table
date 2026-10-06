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
  const library = $('#curriculum-library');
  const tocEl = $('#curriculum-toc');
  const search = $('#curriculum-search');
  const pageInput = $('#curriculum-page-input');
  const pageTotal = $('#curriculum-page-total');
  const pageGo = $('#curriculum-page-go');
  const status = $('#curriculum-status');
  const stage = $('#stage');
  const pad = $('#pad');
  const worksheetImg = $('#worksheet-img');

  if (!btn || !drawer || !input || !stage || !window.JSZip) return;

  const DB_NAME = 'teaching-table-curriculum-v1';
  const DB_VERSION = 1;
  const BOOK_STORE = 'books';

  function openLibraryDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BOOK_STORE)) {
          db.createObjectStore(BOOK_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open curriculum library.'));
    });
  }

  async function withBookStore(mode, fn) {
    const db = await openLibraryDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(BOOK_STORE, mode);
        const store = tx.objectStore(BOOK_STORE);
        let result;
        try { result = fn(store); } catch (err) { reject(err); return; }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error('Curriculum library transaction failed.'));
        tx.onabort = () => reject(tx.error || new Error('Curriculum library transaction was cancelled.'));
      });
    } finally {
      db.close();
    }
  }

  async function listSavedBooks() {
    const db = await openLibraryDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(BOOK_STORE, 'readonly');
        const req = tx.objectStore(BOOK_STORE).getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a,b) => String(a.label || a.name).localeCompare(String(b.label || b.name))));
        req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  }

  async function getSavedBook(id) {
    const db = await openLibraryDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(BOOK_STORE, 'readonly');
        const req = tx.objectStore(BOOK_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  }

  async function saveBookBlob(file, label = '') {
    const id = file.name;
    const record = {
      id,
      name: file.name,
      label: label || file.name.replace(/\.epub$/i, ''),
      size: file.size || 0,
      type: file.type || 'application/epub+zip',
      modified: file.lastModified || Date.now(),
      savedAt: Date.now(),
      blob: file.slice ? file.slice(0, file.size, file.type || 'application/epub+zip') : file,
    };
    const db = await openLibraryDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(BOOK_STORE, 'readwrite');
        tx.objectStore(BOOK_STORE).put(record);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
    return record;
  }

  async function updateSavedBookLabel(id, label) {
    if (!id || !label) return;
    const db = await openLibraryDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(BOOK_STORE, 'readwrite');
        const store = tx.objectStore(BOOK_STORE);
        const req = store.get(id);
        req.onsuccess = () => {
          const record = req.result;
          if (record) { record.label = label; store.put(record); }
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }

  function prettyBookName(record) {
    const source = String(record?.label || record?.name || 'Saved book');
    const grade = String(record?.name || '').match(/iRCM(0K|\d{2})_/i)?.[1];
    if (grade) {
      const display = grade.toUpperCase() === '0K' ? 'Kindergarten' : 'Grade ' + Number(grade);
      return display + ' — ' + source.replace(/^iRCM(?:0K|\d{2})_NN_EN_SW$/i, 'i-Ready Math');
    }
    return source;
  }

  async function refreshLibrary(selectedId = '') {
    if (!library) return;
    const books = await listSavedBooks();
    library.innerHTML = '<option value="">Saved books…</option>';
    books.forEach(book => {
      const option = document.createElement('option');
      option.value = book.id;
      option.textContent = prettyBookName(book);
      library.appendChild(option);
    });
    if (selectedId && books.some(b => b.id === selectedId)) library.value = selectedId;
  }

  async function requestPersistentStorage() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch {}
  }

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

  function jumpToPage() {
    if (!state.toc.length || !pageInput) return;
    const value = Number.parseInt(pageInput.value, 10);
    if (!Number.isFinite(value) || value < 1 || value > state.toc.length) {
      setStatus('Enter a page from 1 to ' + state.toc.length + '.', true);
      pageInput.focus();
      pageInput.select?.();
      return;
    }
    openSection(value - 1);
  }

  btn.addEventListener('click', openDrawer);
  close.addEventListener('click', closeDrawer);
  pick.addEventListener('click', () => input.click());
  library?.addEventListener('change', async () => {
    const id = library.value;
    if (!id) return;
    setStatus('Opening saved book…');
    try {
      const record = await getSavedBook(id);
      if (!record?.blob) throw new Error('Saved book data is missing.');
      const file = new File([record.blob], record.name || id, { type: record.type || 'application/epub+zip', lastModified: record.modified || Date.now() });
      await openEpubFile(file, { save: false, libraryId: id });
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Could not open saved book.', true);
    }
  });
  search.addEventListener('input', renderToc);
  pageGo?.addEventListener('click', jumpToPage);
  pageInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      jumpToPage();
    }
  });

  async function openEpubFile(file, options = {}) {
    if (!file) return;
    const shouldSave = options.save !== false;

    setStatus('Opening ' + file.name + '…');
    tocEl.innerHTML = '';

    let savedRecord = null;
    if (shouldSave) {
      try {
        await requestPersistentStorage();
        setStatus('Saving ' + file.name + ' to this Teaching Table…');
        savedRecord = await saveBookBlob(file);
        await refreshLibrary(savedRecord.id);
      } catch (err) {
        console.warn('Could not save EPUB persistently:', err);
        setStatus('Opening book. Browser storage could not save a permanent copy.', true);
      }
    }

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

      revoke();
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

      const libraryId = options.libraryId || savedRecord?.id || file.name;
      try {
        await updateSavedBookLabel(libraryId, state.bookTitle);
        await refreshLibrary(libraryId);
      } catch {}

      $('#curriculum-book-title').textContent = state.bookTitle;
      $('#curriculum-book-meta').textContent = state.toc.length + ' pages';
      search.disabled = false;
      search.value = '';
      if (pageInput) {
        pageInput.disabled = false;
        pageInput.max = String(state.toc.length);
        pageInput.value = '';
        pageInput.placeholder = '1–' + state.toc.length;
      }
      if (pageTotal) pageTotal.textContent = 'of ' + state.toc.length;
      if (pageGo) pageGo.disabled = false;
      renderToc();
      setStatus(shouldSave ? 'Saved on this device. Pick a lesson or session.' : 'Ready. Pick a lesson or session.');
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Could not open EPUB.', true);
      throw err;
    }
  }

  input.addEventListener('change', async () => {
    const files = [...(input.files || [])];
    if (!files.length) return;

    let lastFile = null;
    for (const file of files) {
      if (!/\.epub$/i.test(file.name || '') && file.type !== 'application/epub+zip') continue;
      lastFile = file;
      try {
        await saveBookBlob(file);
      } catch (err) {
        console.warn('Could not save ' + file.name, err);
      }
    }

    await refreshLibrary(lastFile?.name || '');

    if (files.length === 1) {
      try { await openEpubFile(files[0], { save: false, libraryId: files[0].name }); } catch {}
    } else if (lastFile) {
      setStatus(files.length + ' books saved. Choose one from Saved books.');
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
    if (pageInput) pageInput.value = String(index + 1);
    setStatus('Loading ' + item.label + '…');
    showLoadingSurface(item.label, index);
    closeDrawer();

    try {
      const path = resolve(state.navPath, item.href.split('#')[0]);
      const f = state.zip.file(path);
      if (!f) throw Error('Section file not found.');

      const html = await renderChapter(await f.async('text'), path);
      showSurface(item.label, html, index);
      setStatus(item.label);
    } catch (err) {
      console.error(err);
      hideLoadingSurface();
      setStatus(err.message || 'Could not open section.', true);
      openDrawer();
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

  function ensureLoadingSurface() {
    let loading = $('#curriculum-loading');
    if (!loading) {
      loading = document.createElement('div');
      loading.id = 'curriculum-loading';
      loading.textContent = 'Loading lesson…';
      stage.insertBefore(loading, stage.firstChild);
    }
    return loading;
  }

  function showLoadingSurface(title, index) {
    worksheetImg?.classList.add('hidden');
    pad.classList.add('curriculum-active');
    document.body.classList.add('has-curriculum');

    const loading = ensureLoadingSurface();
    loading.textContent = 'Loading ' + title + '…';
    loading.classList.add('show');

    const frame = $('#curriculum-surface');
    if (frame) frame.style.display = 'none';

    const badge = ensurePageBadge();
    badge.textContent = 'Page ' + (index + 1) + ' of ' + state.toc.length;
    badge.style.display = 'block';

    const label = surfaceLabel();
    if (label) {
      label.textContent = (state.bookTitle ? state.bookTitle + '  ›  ' : '') + title;
      label.title = label.textContent;
    }
    if (surfacePrev()) surfacePrev().disabled = index <= 0;
    if (surfaceNext()) surfaceNext().disabled = index >= state.toc.length - 1;
    if (surfaceControls) surfaceControls.classList.add('active');
    pad.scrollTop = 0;
  }

  function hideLoadingSurface() {
    const loading = $('#curriculum-loading');
    if (loading) loading.classList.remove('show');
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

  function ensurePageBadge() {
    let badge = $('#curriculum-page-number');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'curriculum-page-number';
      badge.setAttribute('aria-live', 'polite');
      stage.insertBefore(badge, stage.firstChild);
    }
    return badge;
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

    frame.style.display = 'block';
    frame.onload = () => {
      hideLoadingSurface();
      try {
        const doc = frame.contentDocument;
        if (doc?.body) {
          doc.querySelector('#i-ready-page-number')?.remove();
          const pageNumber = doc.createElement('div');
          pageNumber.id = 'i-ready-page-number';
          pageNumber.textContent = 'Page ' + (index + 1) + ' of ' + state.toc.length;
          pageNumber.setAttribute('aria-label', pageNumber.textContent);
          Object.assign(pageNumber.style, {
            margin: '28px 20px 14px auto',
            width: 'max-content',
            padding: '5px 10px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,.92)',
            border: '1px solid rgba(0,0,0,.12)',
            color: '#555',
            font: '700 12px/1.2 system-ui,sans-serif'
          });
          doc.body.appendChild(pageNumber);
        }
      } catch (err) {
        console.warn('Could not add curriculum page number', err);
      }
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

    const badge = ensurePageBadge();
    badge.textContent = 'Page ' + (index + 1) + ' of ' + state.toc.length;
    badge.style.display = 'block';

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

  requestPersistentStorage();
  refreshLibrary().catch(err => console.warn('Could not load saved curriculum library:', err));
  renderToc();
})();