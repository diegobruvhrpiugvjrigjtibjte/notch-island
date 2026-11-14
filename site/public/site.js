import { S, COMMANDS, CHAT, TERM } from './strings.js';
import { mountFace, setMood, setCursor, flash } from './demo/island/face.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
const saved = (() => { try { return localStorage.getItem('lang'); } catch { return null; } })();
let lang = saved || 'en';
let accent = '#8ab4ff';
const t = (k) => (S[lang] && S[lang][k]) || S.en[k] || k;

// ---------------------------------------------------------------- lingua
function hintText() { return coarse ? (lang === 'it' ? 'Tocca la pillola — è l\'app vera' : 'Tap the pill — it is the real app') : t('hero.hint'); }
function applyLang() {
  document.documentElement.lang = lang; $('#lang').textContent = lang === 'it' ? 'EN' : 'IT';
  $$('[data-i]').forEach((e) => { e.textContent = t(e.dataset.i); }); $$('[data-i-html]').forEach((e) => { e.innerHTML = t(e.dataset.iHtml); });
  fillMarquee(); splitHeadline(); loadDemos(); const hs = $('#hint1 span'); if (hs) hs.textContent = hintText(); chatRestart(); termRestart();
}
$('#lang').onclick = () => { lang = lang === 'it' ? 'en' : 'it'; try { localStorage.setItem('lang', lang); } catch { /* storage non disponibile */ } applyLang(); };

// ---------------------------------------------------------------- scorrimento: barra, nav, rivelazioni
const nav = $('#nav'), prog = $('#progress');
addEventListener('scroll', () => { const h = document.documentElement; prog.style.width = (scrollY / (h.scrollHeight - innerHeight) * 100) + '%'; nav.classList.toggle('scrolled', scrollY > 30); }, { passive: true });
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 });
$$('.rv').forEach((e, i) => { e.style.setProperty('--d', (i % 4) * 0.08 + 's'); io.observe(e); });
function splitHeadline() { // lettere che arrivano una a una
  const h = $('#h1'); if (reduce) return; let n = 0;
  const walk = (node) => { [...node.childNodes].forEach((c) => { if (c.nodeType === 3) { const f = document.createDocumentFragment(); c.textContent.split(/(\s+)/).forEach((w) => { if (/^\s+$/.test(w) || !w) { f.append(w); return; } const sp = document.createElement('span'); sp.style.display = 'inline-block'; const inEm = !!c.parentElement.closest('em'); [...w].forEach((ch, ci) => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; s.style.animationDelay = (0.25 + n++ * 0.03) + 's'; if (inEm) { s.style.color = `color-mix(in srgb, var(--acc) ${Math.max(0, 100 - (n * 5))}%, var(--acc2))`; s.style.webkitTextFillColor = 'currentColor'; } sp.append(s); }); f.append(sp); }); c.replaceWith(f); } else if (c.nodeType === 1) walk(c); }); };
  h.classList.add('in'); walk(h);
}

// ---------------------------------------------------------------- cursore luminoso, bottoni magnetici, tilt
const glow = $('#glow'); if (coarse) glow.remove();
addEventListener('pointermove', (e) => { glow.style.transform = `translate(${e.clientX - 210}px,${e.clientY - 210}px)`; }, { passive: true });
if (!coarse) $$('.mag').forEach((b) => { b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px,${(e.clientY - r.top - r.height / 2) * 0.28}px)`; }); b.addEventListener('pointerleave', () => { b.style.transform = ''; }); });
if (!coarse) $$('.tilt').forEach((c) => { c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; c.style.transform = `perspective(700px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateZ(6px)`; }); c.addEventListener('pointerleave', () => { c.style.transform = ''; }); });

// ---------------------------------------------------------------- aurora (canvas) dell'hero
(function aurora() {
  const cv = $('#aurora'), g = cv.getContext('2d'); let w = 0, h = 0, mx = 0.5, my = 0.3; const dots = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, p: Math.random() * 6.28, s: Math.random() * 0.8 + 0.3 }));
  const size = () => { const d = Math.min(2, devicePixelRatio || 1); w = cv.clientWidth; h = cv.clientHeight; cv.width = w * d; cv.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); }; size(); addEventListener('resize', size);
  addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; }, { passive: true });
  const blob = (x, y, r, c) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'transparent'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  let tt = 0; const hex = (c, a) => c + Math.round(a * 255).toString(16).padStart(2, '0');
  function frame() {
    tt += 0.006; g.clearRect(0, 0, w, h); g.globalCompositeOperation = 'lighter';
    blob(w * (0.2 + Math.sin(tt) * 0.1 + mx * 0.1), h * 0.3 + Math.cos(tt * 1.3) * 40, Math.max(w, h) * 0.5, hex(accent, 0.28));
    blob(w * (0.8 + Math.cos(tt * 0.8) * 0.08 - mx * 0.1), h * 0.6 + Math.sin(tt) * 50, Math.max(w, h) * 0.5, 'rgba(195,155,255,.22)');
    blob(w * 0.5 + Math.sin(tt * 0.6) * 200, h * 1.0, Math.max(w, h) * 0.45, 'rgba(24,200,180,.14)');
    g.globalCompositeOperation = 'source-over';
    for (const d of dots) { const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(tt * 3 * d.s + d.p)); g.fillStyle = `rgba(255,255,255,${0.5 * a})`; g.beginPath(); g.arc(d.x * w + (mx - 0.5) * 20 * d.r, d.y * h + (my - 0.5) * 14 * d.r, d.r, 0, 6.28); g.fill(); }
    if (!reduce) requestAnimationFrame(frame);
  } frame();
})();

// ---------------------------------------------------------------- demo (iframe con l'interfaccia vera)
const demos = [];
function Demo(frame, stage, opts) {
  const d = { frame, stage, opts, rect: null, scale: 1 };
  const box = document.createElement('div'); box.className = 'stagebox' + (opts.compactH ? ' open' : ''); stage.before(box); box.append(stage); d.box = box;
  const fit = () => {
    const bw = box.clientWidth || innerWidth; let sc = Math.min(opts.max || 1.3, Math.max(0.3, bw / 820)), off = Math.max(0, (bw - 820 * sc) / 2), bh = (opts.compactH || 470) * sc;
    if (opts.compactH && bw < 700) { // telefono: pillola chiusa grande e centrata; aperta, l'isola si adatta alla larghezza
      bh = opts.compactH * 1.05; if (d.open) { sc = bw / 820; off = 0; } else { sc = 1.05; off = bw / 2 - 410 * sc; }
    }
    d.scale = sc; stage.style.transform = `translateX(${off}px) scale(${sc})`; box.style.height = bh + 'px';
  };
  const fitOld = () => { const wrap = stage.parentElement; const avail = Math.min(wrap.clientWidth, innerWidth - 24); d.scale = Math.min(opts.max || 1.3, Math.max(0.42, avail / 820)); stage.style.transform = `scale(${d.scale})`; stage.style.width = '820px'; if (opts.compactH) { stage.style.height = opts.compactH + 'px'; stage.style.marginBottom = (opts.compactH * (d.scale - 1)) + 'px'; } else stage.style.marginBottom = (-(470 * (1 - d.scale))) + 'px'; }; fit(); addEventListener('resize', fit); d.fit = fit; addEventListener('orientationchange', () => setTimeout(fit, 200));
  d.post = (m) => { try { frame.contentWindow.postMessage({ src: 'notch-site', ...m }, '*'); } catch { /* iframe non pronta */ } };
  d.toLocal = (e) => { const r = frame.getBoundingClientRect(); return { x: (e.clientX - r.left) / d.scale, y: (e.clientY - r.top) / d.scale }; };
  demos.push(d); return d;
}
const d1 = Demo($('#demo1'), $('#stage1'), { max: 1.35, compactH: 100 }), d2 = Demo($('#demo2'), $('#stage2'), { max: 1.2 });
let d2Wanted = false;
function loadDemos() { const q = (extra) => `/demo/island/?lang=${lang}&accent=${encodeURIComponent(accent)}${extra}`; d1.frame.src = q(''); d1.rect = d2.rect = null; if (d2Wanted) d2.frame.src = q('&pin=1&tab=media'); else d2.frame.removeAttribute('src'); }
new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !d2Wanted) { d2Wanted = true; loadDemos(); } }, { rootMargin: '700px' }).observe($('#demo'));
addEventListener('message', (e) => {
  const m = e.data; if (!m || m.src !== 'notch-demo') return;
  const d = e.source === d1.frame.contentWindow ? d1 : e.source === d2.frame.contentWindow ? d2 : null;
  if (m.type === 'rect' && d) { d.rect = m.rect; if (d === d1) { const o = m.rect.w > 300; if (o !== !!d.open) { d.open = o; d.fit(); } } if (coarse && d === d1) { d.frame.style.height = Math.ceil(m.rect.y + m.rect.h + 14) + 'px'; d.frame.style.pointerEvents = 'auto'; } }
  else if (m.type === 'settings' && m.settings && m.settings.accent && m.settings.accent !== accent) setAccent(m.settings.accent, true);
  else if (m.type === 'lang' && m.lang !== lang) { lang = m.lang; applyLang(); }
});
// il sito inoltra il mouse alle demo: l'iframe riceve i clic solo quando il cursore e' sopra l'isola (come nell'app vera)
function forward(e) {
  for (const d of demos) {
    const p = d.toLocal(e), r = d.rect; d.post({ type: 'pointer', x: p.x, y: p.y });
    const inside = r && p.x >= r.x - 2 && p.x <= r.x + r.w + 2 && p.y >= r.y - 2 && p.y <= r.y + r.h + 2; if (!coarse) d.frame.style.pointerEvents = inside ? 'auto' : 'none';
    if (d === d1) $('#hint1').style.opacity = inside || d1.opened ? 0 : 1;
  }
}
addEventListener('pointermove', forward, { passive: true }); document.addEventListener('pointerleave', () => demos.forEach((d) => d.post({ type: 'leave' })));
$$('[data-sim]').forEach((b) => { b.onclick = () => { d1.post({ type: 'sim', what: b.dataset.sim }); d1.opened = false; }; });

// ---------------------------------------------------------------- demo fissata: i passi cambiano scheda
const steps = $$('.step');
const so = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { steps.forEach((s) => s.classList.toggle('on', s === e.target)); d2.post({ type: 'tab', tab: e.target.dataset.tab }); } }), { rootMargin: '-45% 0px -45% 0px' });
steps.forEach((s) => { so.observe(s); s.onclick = () => { steps.forEach((x) => x.classList.toggle('on', x === s)); d2.post({ type: 'tab', tab: s.dataset.tab }); }; });
const ACCENTS = ['#8ab4ff', '#7ee0b0', '#ffb86b', '#ff7a90', '#c39bff', '#6fd8e8', '#f2e06b'];
$('#swatches').innerHTML = ACCENTS.map((c) => `<button style="background:${c}" data-c="${c}" aria-label="${c}"></button>`).join('');
function setAccent(c, fromDemo) { accent = c; document.documentElement.style.setProperty('--acc', c); $$('#swatches button').forEach((b) => b.classList.toggle('on', b.dataset.c === c)); if (!fromDemo) demos.forEach((d) => d.post({ type: 'set', patch: { accent: c } })); }
$$('#swatches button').forEach((b) => { b.onclick = () => setAccent(b.dataset.c); }); setAccent(accent);

// ---------------------------------------------------------------- faccine del sito
const nf = mountFace($('#face-nav')), ff = mountFace($('#face-foot')), bf = mountFace($('#bigface'), { big: true }), mf = mountFace($('#mface'));
addEventListener('pointermove', (e) => setCursor(e.clientX, e.clientY), { passive: true });
const MOODS = ['idle', 'happy', 'sleepy', 'thinking', 'alert', 'listening', 'talking', 'surprised', 'love'];
$('#moods').innerHTML = MOODS.map((m) => `<button data-m="${m}">${m}</button>`).join('');
$$('#moods button').forEach((b) => { b.onclick = () => { $$('#moods button').forEach((x) => x.classList.toggle('on', x === b)); setMood(b.dataset.m); }; });
$('#moods button').click();

// ---------------------------------------------------------------- marquee di comandi
function fillMarquee() { const c = COMMANDS[lang]; $('#marquee').innerHTML = [...c, ...c].map((x) => `<span>${x}</span>`).join(''); }

// ---------------------------------------------------------------- chat che si scrive da sola
let chatTimer = 0, chatGen = 0;
function chatRestart() {
  const gen = ++chatGen; clearTimeout(chatTimer); const log = $('#chatlog'); log.innerHTML = ''; let i = 0; const data = CHAT[lang];
  const add = (cls, txt, typed) => new Promise((res) => { const m = document.createElement('div'); m.className = 'msg ' + cls; log.append(m); if (log.children.length > 6) log.firstChild.remove(); if (!typed || reduce) { m.textContent = txt; return res(); } let k = 0; const tick = () => { if (gen !== chatGen) return res(); m.textContent = txt.slice(0, ++k); if (k < txt.length) chatTimer = setTimeout(tick, 32); else res(); }; tick(); });
  const sleep = (ms) => new Promise((r) => { chatTimer = setTimeout(r, ms); });
  (async function loop() { while (gen === chatGen) { const [q, a] = data[i++ % data.length]; $('#wave').style.opacity = 1; await add('me', q, true); if (gen !== chatGen) return; $('#wave').style.opacity = .25; await sleep(500); await add('bot', a, false); await sleep(2200); } })();
}

// ---------------------------------------------------------------- terminale <-> pillola
let termGen = 0, clVisible = false;
function termRestart() {
  const gen = ++termGen; const pre = $('#term'), pill = $('#minipill'), txt = $('#mtext'), sub = $('#msub'); const lines = TERM[lang];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = (cls, text, s, mood) => { pill.className = 'minipill ' + cls; txt.textContent = text; sub.textContent = s; if (clVisible) setMood(mood); };
  (async function loop() {
    while (gen === termGen) {
      pre.innerHTML = ''; state('', 'NotchIsland', '', 'idle'); await sleep(1200);
      for (let i = 0; i < lines.length && gen === termGen; i++) {
        const [p, text, cls] = lines[i]; const row = document.createElement('div'); pre.append(row);
        if (p) { const s = document.createElement('span'); s.className = 't-acc'; s.textContent = p; row.append(s); }
        const sp = document.createElement('span'); if (cls) sp.className = cls; row.append(sp);
        if (i === 1) { for (const ch of text) { sp.textContent += ch; await sleep(reduce ? 0 : 28); } } else sp.textContent = text;
        if (i === 1) state('work', 'web-app', 'Claude', 'thinking'); if (i === 3) state('work', 'web-app', 'Edit', 'thinking'); if (i === 5) state('wait', lang === 'it' ? 'Claude ti aspetta' : 'Claude is waiting', 'web-app', 'alert'); if (i === 6) state('done', lang === 'it' ? 'Claude ha finito' : 'Claude finished', '', 'happy');
        await sleep(i === 5 ? 1800 : 700);
      }
      await sleep(3500);
    }
  })();
}
// la faccina della pillola mini ha il suo umore indipendente dalla sezione "faccina": usiamo l'umore globale solo in questa sezione
const faceSection = $('#face'), clSection = $('#claude');
new IntersectionObserver((es) => es.forEach((e) => { clVisible = e.isIntersecting; if (!clVisible) setMood('idle'); }), { threshold: .3 }).observe(clSection);
new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const on = $('#moods button.on'); setMood(on ? on.dataset.m : 'idle'); } }), { threshold: .4 }).observe(faceSection);

// ---------------------------------------------------------------- widget del sito
(function widgets() {
  const clock = () => { const n = new Date(); $('#wclock').textContent = n.toLocaleTimeString(lang === 'it' ? 'it-IT' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); $('#wdate').textContent = n.toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); }; clock(); setInterval(clock, 1000);
  let left = 25 * 60, run = 0; const show = () => { $('#wtimer').textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'); };
  $('#wtgo').onclick = () => { if (run) { clearInterval(run); run = 0; $('#wtgo').textContent = t('w.start'); } else { $('#wtgo').textContent = t('w.pause'); run = setInterval(() => { left = Math.max(0, left - 1); show(); if (!left) { clearInterval(run); run = 0; } }, 1000); } };
  $('#wtrs').onclick = () => { clearInterval(run); run = 0; left = 25 * 60; show(); $('#wtgo').textContent = t('w.start'); };
  $$('[data-d]').forEach((b) => { b.onclick = () => { const r = $('#wdice'); r.textContent = 1 + Math.floor(Math.random() * +b.dataset.d); r.animate([{ transform: 'scale(1.5)', opacity: .3 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' }); }; });
  const todos = ['Review the pull request', 'Book the train tickets', 'Reply to the design team']; $('#wtodo').innerHTML = todos.map((x, i) => `<label><input type="checkbox"${i === 1 ? ' checked' : ''}><span>${x}</span></label>`).join('');
  let ex = ''; const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '=']; $('#wkeys').innerHTML = keys.map((k) => `<button class="${'÷×−+'.includes(k) ? 'op' : k === '=' ? 'eq' : ''}">${k}</button>`).join('');
  $$('#wkeys button').forEach((b) => { b.onclick = () => { const k = b.textContent; if (k === 'C') ex = ''; else if (k === '⌫') ex = ex.slice(0, -1); else if (k === '=') { try { const v = Function('"use strict";return (' + (ex.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-') || '0') + ')')(); ex = String(Math.round(v * 1e8) / 1e8); } catch { ex = 'Err'; } } else { if (ex === 'Err') ex = ''; ex += k; } $('#wout').textContent = ex || '0'; }; });
})();

// ---------------------------------------------------------------- installer: dati della release
(async function release() {
  try {
    const r = await (await fetch('/release.json', { cache: 'no-store' })).json(); const mb = (r.size / 1048576).toFixed(0);
    $('#relmeta').innerHTML = `<span>v${r.version}</span><span>${mb} MB</span><span>${r.date}</span><span>Windows 10/11 x64</span>`; $('#sha').textContent = 'sha256: ' + r.sha256; $('#dl').href = r.url || '/download'; $('#dl').setAttribute('download', r.file);
  } catch { $('#sha').textContent = ''; }
  $('#copysha').onclick = async () => { try { await navigator.clipboard.writeText($('#sha').textContent.replace('sha256: ', '')); const b = $('#copysha'); b.textContent = t('i.copied'); setTimeout(() => { b.textContent = t('i.copy'); }, 1500); } catch { /* appunti non disponibili */ } };
  if (!/Windows/i.test(navigator.userAgent)) $('#osnote').hidden = false;
})();

// la faccina del logo e' contenta quando passi sui pulsanti principali
$$('.btn').forEach((b) => { b.addEventListener('pointerenter', () => flash('happy', 900)); });
applyLang();
