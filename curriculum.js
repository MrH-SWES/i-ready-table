(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const state = { zip:null, navPath:'', toc:[], current:-1, urls:new Set(), z:500 };

  const btn=$('#curriculumBtn'), drawer=$('#curriculum-drawer'), close=$('#curriculum-close'),
        pick=$('#curriculum-pick'), input=$('#curriculumFile'), tocEl=$('#curriculum-toc'),
        search=$('#curriculum-search'), status=$('#curriculum-status');
  if(!btn||!drawer||!input||!window.JSZip) return;

  const setStatus=(m,e=false)=>{status.textContent=m;status.classList.toggle('error',e);};
  const parse=t=>new DOMParser().parseFromString(t,'application/xml');
  const clean=s=>(s||'').replace(/\s+/g,' ').trim();
  const dirname=p=>p.includes('/')?p.slice(0,p.lastIndexOf('/')):'';
  const resolve=(base,rel)=>{
    let r=(rel||'').split('#')[0].split('?')[0]; if(!r) return base;
    try{r=decodeURIComponent(r)}catch{}
    const parts=r.startsWith('/')?[]:dirname(base).split('/').filter(Boolean);
    r.replace(/^\/+/, '').split('/').forEach(x=>{if(!x||x==='.')return;if(x==='..')parts.pop();else parts.push(x)});
    return parts.join('/');
  };
  const extUrl=u=>/^(?:[a-z]+:)?\/\//i.test(u)||/^(?:data|blob|mailto|tel):/i.test(u);
  const mime=p=>({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',svg:'image/svg+xml',webp:'image/webp',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp3:'audio/mpeg',mp4:'video/mp4'})[(p.split('.').pop()||'').toLowerCase()]||'application/octet-stream';
  const revoke=()=>{state.urls.forEach(URL.revokeObjectURL);state.urls.clear()};
  const assetUrl=async p=>{const f=state.zip?.file(p);if(!f)return'';const b=await f.async('blob');const u=URL.createObjectURL(b.type?b:new Blob([b],{type:mime(p)}));state.urls.add(u);return u};

  function openDrawer(){drawer.classList.add('show');drawer.setAttribute('aria-hidden','false');btn.classList.add('is-on')}
  function closeDrawer(){drawer.classList.remove('show');drawer.setAttribute('aria-hidden','true');btn.classList.remove('is-on')}
  btn.addEventListener('click',openDrawer); close.addEventListener('click',closeDrawer); pick.addEventListener('click',()=>input.click());
  search.addEventListener('input',renderToc);

  input.addEventListener('change',async()=>{
    const file=input.files?.[0]; if(!file)return;
    setStatus('Opening '+file.name+'…'); tocEl.innerHTML='';
    try{
      const zip=await JSZip.loadAsync(await file.arrayBuffer());
      const c=zip.file('META-INF/container.xml'); if(!c)throw Error('Not a valid EPUB.');
      const cdoc=parse(await c.async('text'));
      const root=[...cdoc.getElementsByTagNameNS('*','rootfile')][0];
      const opfPath=root?.getAttribute('full-path'); if(!opfPath)throw Error('EPUB package file not found.');
      const of=zip.file(opfPath); if(!of)throw Error('EPUB package file missing.');
      const opf=parse(await of.async('text'));
      let navHref='';
      for(const item of [...opf.getElementsByTagNameNS('*','item')]){
        if((item.getAttribute('properties')||'').split(/\s+/).includes('nav')){navHref=item.getAttribute('href')||'';break}
      }
      if(!navHref)throw Error('No EPUB navigation document found.');
      const navPath=resolve(opfPath,navHref), nf=zip.file(navPath); if(!nf)throw Error('Navigation file missing.');
      const nav=parse(await nf.async('text')), navs=[...nav.getElementsByTagNameNS('*','nav')];
      const tocNav=navs.find(n=>((n.getAttribute('epub:type')||n.getAttributeNS('http://www.idpf.org/2007/ops','type')||'').split(/\s+/).includes('toc')))||navs[0];
      const links=[...tocNav.getElementsByTagNameNS('*','a')];
      const parent=new Map(); [...tocNav.querySelectorAll('*')].forEach(p=>[...p.children].forEach(c=>parent.set(c,p)));
      const depth=a=>{let d=0,p=parent.get(a);while(p&&p!==tocNav){if((p.localName||'').toLowerCase()==='ol')d++;p=parent.get(p)}return Math.max(0,d-1)};
      state.zip=zip; state.navPath=navPath; state.current=-1;
      state.toc=links.map((a,i)=>({i,label:clean(a.textContent)||('Section '+(i+1)),href:a.getAttribute('href')||'',depth:depth(a)})).filter(x=>x.href);
      const title=[...opf.getElementsByTagNameNS('*','title')][0]?.textContent||file.name.replace(/\.epub$/i,'');
      $('#curriculum-book-title').textContent=clean(title);
      $('#curriculum-book-meta').textContent=state.toc.length+' sections';
      search.disabled=false; search.value=''; renderToc(); setStatus('Ready. Pick a lesson or session.');
    }catch(err){console.error(err);setStatus(err.message||'Could not open EPUB.',true)}
    input.value='';
  });

  function renderToc(){
    const q=(search.value||'').toLowerCase().trim(); tocEl.innerHTML='';
    if(!state.zip){tocEl.innerHTML='<div class="curriculum-empty">Load an EPUB to browse lessons.</div>';return}
    state.toc.forEach(item=>{
      if(q&&!item.label.toLowerCase().includes(q))return;
      const b=document.createElement('button'); b.type='button'; b.className='curriculum-toc-row';
      b.style.setProperty('--toc-depth',Math.min(item.depth,6)); b.textContent=item.label; b.onclick=()=>openSection(item.i); tocEl.appendChild(b);
    });
    if(!tocEl.children.length)tocEl.innerHTML='<div class="curriculum-empty">No matching sections.</div>';
  }

  async function openSection(index){
    const item=state.toc[index]; if(!item)return;
    state.current=index; setStatus('Loading '+item.label+'…');
    try{
      const path=resolve(state.navPath,item.href.split('#')[0]), f=state.zip.file(path); if(!f)throw Error('Section file not found.');
      const html=await renderChapter(await f.async('text'),path); showWindow(item.label,html,index); setStatus(item.label); closeDrawer();
    }catch(err){console.error(err);setStatus(err.message||'Could not open section.',true)}
  }

  async function renderChapter(raw,path){
    revoke(); const doc=parse(raw); if(doc.querySelector('parsererror'))throw Error('Lesson XHTML could not be parsed.');
    doc.querySelectorAll('script,iframe,object,embed').forEach(e=>e.remove());
    doc.querySelectorAll('*').forEach(e=>[...e.attributes].forEach(a=>{if(/^on/i.test(a.name))e.removeAttribute(a.name)}));
    const styles=[];
    for(const link of [...doc.querySelectorAll('link[rel~="stylesheet"][href]')]){
      const cp=resolve(path,link.getAttribute('href')), cf=state.zip.file(cp);
      if(cf){let css=await cf.async('text'); for(const m of [...css.matchAll(/url\(([^)]+)\)/g)]){const rawu=(m[1]||'').trim().replace(/^['"]|['"]$/g,'');if(rawu&&!rawu.startsWith('data:')&&!rawu.startsWith('#')&&!extUrl(rawu)){const u=await assetUrl(resolve(cp,rawu));if(u)css=css.replace(m[0],`url("${u}")`)}} styles.push(css)}
      link.remove();
    }
    for(const [sel,attr] of [['img','src'],['source','src'],['video','poster'],['audio','src'],['image','href']]){
      for(const el of [...doc.querySelectorAll(sel+'['+attr+']')]){
        const src=el.getAttribute(attr); if(!src||extUrl(src)||src.startsWith('#'))continue;
        const u=await assetUrl(resolve(path,src)); if(u)el.setAttribute(attr,u);
      }
    }
    doc.querySelectorAll('a[href]').forEach(a=>{if(!(a.getAttribute('href')||'').startsWith('#'))a.removeAttribute('href')});
    const body=doc.querySelector('body')?.innerHTML||raw;
    const inline=[...doc.querySelectorAll('style')].map(s=>s.textContent||'').join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; media-src blob: data:; font-src blob: data:; style-src 'unsafe-inline' blob:;">
      <style>html,body{margin:0;background:#fff;color:#1d1d1f}body{padding:18px 22px;line-height:1.45}img,svg,video{max-width:100%;height:auto}table{max-width:100%}${styles.join('\n')}\n${inline}</style>
      </head><body>${body}</body></html>`;
  }

  function showWindow(title,srcdoc,index){
    const layer=$('#tools-layer'); let win=$('#curriculum-window');
    if(!win){
      win=document.createElement('div'); win.id='curriculum-window'; win.className='curriculum-window';
      win.innerHTML='<div class="curriculum-window-bar"><div class="curriculum-window-grip">⠿</div><div class="curriculum-window-title"></div><button class="curriculum-nav" data-dir="-1">‹</button><button class="curriculum-nav" data-dir="1">›</button><button class="curriculum-window-close">×</button></div><iframe class="curriculum-frame"></iframe><div class="curriculum-resize"></div>';
      layer.appendChild(win); const pf=$('#pad-frame');
      win.style.width=Math.max(420,Math.min(760,(pf?.clientWidth||1000)*.56))+'px'; win.style.height=Math.max(360,Math.min(760,(pf?.clientHeight||800)*.8))+'px'; win.style.left='18px'; win.style.top='18px';
      win.querySelector('.curriculum-window-close').onclick=()=>{win.remove();revoke()};
      win.querySelectorAll('.curriculum-nav').forEach(n=>n.onclick=()=>{const next=Math.max(0,Math.min(state.toc.length-1,state.current+Number(n.dataset.dir)));if(next!==state.current)openSection(next)});
      drag(win,win.querySelector('.curriculum-window-bar')); resize(win,win.querySelector('.curriculum-resize'));
      win.addEventListener('pointerdown',()=>win.style.zIndex=String(++state.z),true);
    }
    win.querySelector('.curriculum-window-title').textContent=title; win.querySelector('.curriculum-frame').srcdoc=srcdoc;
    win.querySelector('[data-dir="-1"]').disabled=index<=0; win.querySelector('[data-dir="1"]').disabled=index>=state.toc.length-1; win.style.zIndex=String(++state.z);
  }

  function drag(win,h){
    let s=null; h.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();h.setPointerCapture(e.pointerId);win.querySelector('iframe').style.pointerEvents='none';s={id:e.pointerId,x:e.clientX,y:e.clientY,l:parseFloat(win.style.left)||0,t:parseFloat(win.style.top)||0}});
    h.addEventListener('pointermove',e=>{if(!s||e.pointerId!==s.id)return;const layer=$('#tools-layer');win.style.left=Math.max(0,Math.min(layer.clientWidth-win.offsetWidth,s.l+e.clientX-s.x))+'px';win.style.top=Math.max(0,Math.min(layer.clientHeight-win.offsetHeight,s.t+e.clientY-s.y))+'px'});
    const end=e=>{if(!s||e.pointerId!==s.id)return;win.querySelector('iframe').style.pointerEvents='';s=null}; h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);
  }
  function resize(win,h){
    let s=null; h.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();h.setPointerCapture(e.pointerId);win.querySelector('iframe').style.pointerEvents='none';s={id:e.pointerId,x:e.clientX,y:e.clientY,w:win.offsetWidth,h:win.offsetHeight}});
    h.addEventListener('pointermove',e=>{if(!s||e.pointerId!==s.id)return;const layer=$('#tools-layer'),l=parseFloat(win.style.left)||0,t=parseFloat(win.style.top)||0;win.style.width=Math.max(300,Math.min(layer.clientWidth-l,s.w+e.clientX-s.x))+'px';win.style.height=Math.max(260,Math.min(layer.clientHeight-t,s.h+e.clientY-s.y))+'px'});
    const end=e=>{if(!s||e.pointerId!==s.id)return;win.querySelector('iframe').style.pointerEvents='';s=null}; h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);
  }
  renderToc();
})();