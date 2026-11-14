import { icon, hydrate } from '../shared/icons.js';
import { mountFace, setMood, flash, setCursor, relook, setEnabled } from './face.js';
import { mountWidgets, WIDGETS, timer, stopwatch } from './widgets.js';
import { initAssistant } from './assistant.js';
import { avatarLook } from './avatar.js';
import { initI18n, lang as uiLang, LANGS, tr, missing, locale } from './i18n.js';
import { initClaude } from './claudeui.js';
import { initSettings, TAB_LIST } from './settings.js';

const api = window.nApi;
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600); return (h ? h + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') : String(Math.floor(s / 60))) + ':' + String(s % 60).padStart(2, '0'); };
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = isObj(b[k]) && isObj(a[k]) ? merge(a[k], b[k]) : b[k]; return o; };

const WIN_W = 820, OPEN = { w: 780, h: 420 }, NOTCH_PAD = 34;
const island = $('#island'), compact = $('#compact');
let st = null, data = { todos: [], notes: [], reminders: [], links: [] }, dark = true;
let open = false, playing = false, hasTrack = false, np = {}, animating = false, dragging = false;
let sessions = [], integ = null, assistantState = 'idle', alertUntil = 0, alertText = '', doneUntil = 0, doneText = '', lastActive = Date.now();
const cur = { w: 150, h: 38 }, vel = { w: 0, h: 0 }; let target = { w: 150, h: 38 }, raf = 0;
hydrate();

// ============================================================ tema e geometria
function applyTheme() {
  const t = st.theme === 'auto' ? (dark ? 'black' : 'light') : st.theme;
  document.body.dataset.theme = t;
  document.body.style.setProperty('--acc', st.accent); document.body.style.setProperty('--sc', st.scale);
  document.body.classList.toggle('notch', st.mode === 'notch'); document.body.classList.toggle('noface', !st.face.on);
  setEnabled(st.face.on);
}
const pad = () => (st.mode === 'notch' ? NOTCH_PAD : 0);
const compactH = () => Math.round((st.mode === 'notch' ? 34 : 38) * st.scale);
let compactW = 150;
function measureCompact() {
  // misura la larghezza naturale del contenuto (il contenitore normalmente e' largo quanto la pillola e farebbe restringere il testo)
  const keep = { r: compact.style.right, w: compact.style.width, j: compact.style.justifyContent };
  compact.style.right = 'auto'; compact.style.width = 'max-content'; compact.style.justifyContent = 'flex-start';
  let w = 0, n = 0;
  for (const k of compact.children) { if (getComputedStyle(k).display === 'none') continue; w += k.getBoundingClientRect().width; n++; }
  const cs = getComputedStyle(compact); w += parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 9 * Math.max(0, n - 1);
  compact.style.right = keep.r; compact.style.width = keep.w; compact.style.justifyContent = keep.j;
  return Math.max(compactH() + 18, Math.min(360, Math.round(w + 4)));
}
function layout() {
  const p = pad(), h = cur.h + p, x = Math.round((WIN_W - cur.w) / 2), y = st.mode === 'notch' ? -p : 10;
  island.style.width = cur.w + 'px'; island.style.height = h + 'px'; island.style.left = x + 'px'; island.style.top = y + 'px';
  document.body.style.setProperty('--pad', p + 'px');
  const prog = Math.min(1, Math.max(0, (cur.h - compactH()) / (OPEN.h - compactH())));
  island.style.borderRadius = Math.round(compactH() / 2 + (Math.max(st.radius, compactH() / 2) - compactH() / 2) * prog) + 'px';
  api.send('hit-rect', { x, y: Math.max(0, y), w: Math.round(cur.w), h: Math.round(cur.h) });
  relook();
}
function step() {
  const k = 190, c = 17, dt = 1 / 60;
  for (const key of ['w', 'h']) { vel[key] += (-k * (cur[key] - target[key]) - c * vel[key]) * dt; cur[key] += vel[key] * dt; }
  layout();
  if (Math.abs(cur.w - target.w) > .4 || Math.abs(cur.h - target.h) > .4 || Math.abs(vel.w) > .4 || Math.abs(vel.h) > .4) raf = requestAnimationFrame(step);
  else { cur.w = target.w; cur.h = target.h; layout(); raf = 0; animating = false; }
}
function retarget() { target = open ? { w: OPEN.w, h: OPEN.h } : { w: compactW, h: compactH() }; animating = true; if (!raf) raf = requestAnimationFrame(step); }
function setOpen(v) {
  if (open === v) return; open = v; island.classList.toggle('open', v); api.send('open-state', v);
  retarget(); onTab(); if (v) activity();
}
// l'isola resta aperta solo se stai davvero usando un campo di testo (finestra con il focus), trascinando o parlando
const keepOpen = () => dragging || assistantState === 'listening' || (document.hasFocus() && !!document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName));
let leaveT, mouseInside = false;
function scheduleClose(delay) { clearTimeout(leaveT); leaveT = setTimeout(() => { if (mouseInside) return; if (keepOpen()) return scheduleClose(500); setOpen(false); }, delay); }
api.on('hover', (inside) => {
  mouseInside = inside; clearTimeout(leaveT);
  if (inside) { activity(); if (st.openOn === 'hover') setOpen(true); } else scheduleClose(380);
});
// cliccando fuori (la finestra perde il focus) si chiude anche se un campo di testo era attivo
window.addEventListener('blur', () => { if (!mouseInside && open) scheduleClose(250); });
island.addEventListener('mouseenter', () => { clearTimeout(leaveT); if (st && st.openOn === 'hover') setOpen(true); });
island.addEventListener('click', () => { if (!open) setOpen(true); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (document.activeElement) document.activeElement.blur(); setOpen(false); } });
api.on('toggle', () => setOpen(!open));
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2600); }
api.on('toast', toast);
const activity = () => { lastActive = Date.now(); };

// ============================================================ suoni delicati
let ac = null;
function sound(kind) {
  if (!st || !st.claude.sounds) return;
  try {
    ac = ac || new AudioContext(); const t0 = ac.currentTime;
    const seq = { wait: [[660, 0], [880, .13]], done: [[523, 0], [784, .12]], timer: [[880, 0], [880, .2], [1175, .4]], listen: [[740, 0]], rem: [[784, 0], [988, .15], [784, .3]] }[kind] || [];
    for (const [f, d] of seq) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t0 + d); g.gain.linearRampToValueAtTime(.06, t0 + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t0 + d + .22); o.connect(g).connect(ac.destination); o.start(t0 + d); o.stop(t0 + d + .25); }
  } catch { /* audio non disponibile */ }
}

// ============================================================ schede
const TABDEF = { media: ['Musica', 'music'], assistant: ['Assistente', 'smile'], claude: ['Claude', 'sparkle'], widgets: ['Widget', 'grid'], clip: ['Appunti', 'clipboard'], shelf: ['File', 'tray'], ctrl: ['Controlli', 'sliders'], apps: ['App', 'search'], web: ['Web', 'globe'], set: ['Impostazioni', 'settings'] };
let curTab = 'media', widgetsH = null, editing = false;
function buildTabs() {
  const ids = Object.keys(TABDEF).filter((id) => id === 'set' || !st.tabsOff.includes(id));
  if (!ids.includes(curTab)) curTab = ids[0];
  $('#tabs').innerHTML = ids.map((id) => `<button role="tab" data-tab="${id}" title="${TABDEF[id][0]}">${icon(TABDEF[id][1], 15)}<span>${TABDEF[id][0]}</span></button>`).join('');
  $$('#tabs button').forEach((b) => { b.onclick = () => tab(b.dataset.tab); });
  tab(curTab);
}
function tab(n) {
  curTab = n;
  $$('.page').forEach((p) => p.classList.toggle('on', p.id === 'p-' + n));
  $$('#tabs button').forEach((b) => { const on = b.dataset.tab === n; b.classList.toggle('on', on); b.querySelector('span').style.display = on ? '' : 'none'; });
  onTab();
}
function onTab() {
  api.send('mon', open && curTab === 'widgets' && !!widgetsH && widgetsH.needsMon);
  if (!open) return;
  if (curTab === 'apps') loadApps();
  if (curTab === 'ctrl') refreshCtl();
  if (curTab === 'web') initWeb();
  if (curTab === 'widgets') showWidgets();
  if (curTab === 'media') refreshVol();
  if (curTab === 'claude') claudeUi.refresh();
  if (curTab === 'set') settingsUi.render();
  if (curTab === 'assistant') setTimeout(() => $('#p-assistant [data-text]') && $('#p-assistant [data-text]').focus(), 250);
}

// ============================================================ faccina + pillola
const MOOD_NIGHT = () => { const h = new Date().getHours(); return h >= 23 || h < 6; };
function claudeTop() {
  const now = Date.now(); let w = false, work = false;
  for (const s of sessions) { if (s.status === 'waiting' && now - s.updated < 30 * 60000) w = true; else if (s.status === 'working' && now - s.updated < 5 * 60000) work = true; }
  return w ? 'waiting' : work ? 'working' : '';
}
function computeMood() {
  const now = Date.now();
  if (alertUntil > now) return 'alert';
  if (assistantState === 'listening') return 'listening';
  if (assistantState === 'talking') return 'talking';
  if (assistantState === 'thinking' || assistantState === 'transcribing') return 'thinking';
  const c = claudeTop(); if (c === 'waiting') return 'alert'; if (c === 'working') return 'thinking';
  if (doneUntil > now) return 'happy';
  if (timer.running && timer.remaining() <= 10) return 'alert';
  if (playing) return 'happy';
  if (st.face.sleepy && !open && now - lastActive > (MOOD_NIGHT() ? 45000 : 120000)) return 'sleepy';
  return 'idle';
}
function updateMood() { setMood(computeMood()); }

let lastCompactKey = '';
function updateCompact() {
  const now = Date.now(), mode = st.compact; let text = '', sub = '', dot = '', eq = false;
  const clock = () => new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: st.seconds ? '2-digit' : undefined, hour12: !st.clock24 });
  const c = claudeTop(), top = sessions.find((s) => s.status === c) || null;
  if (alertUntil > now && alertText) { text = alertText; }
  else if (c === 'waiting' && top) { dot = 'waiting'; text = tr('Claude ti aspetta'); sub = top.project; }
  else if (c === 'working' && top) { dot = 'working'; text = top.project; sub = top.tool || 'Claude'; }
  else if (doneUntil > now) { dot = 'done'; text = doneText; }
  else if (mode === 'none') { text = ''; }
  else if (timer.running || (timer.left > 0)) { text = mmss(timer.remaining()); sub = timer.pomo ? (timer.phase === 'work' ? 'concentrazione' : 'pausa') : timer.label; }
  else if (stopwatch.running) { text = mmss(stopwatch.elapsed()); sub = 'cronometro'; }
  else if (hasTrack && (mode === 'auto' || mode === 'track')) { text = np.title; eq = playing; }
  else { text = clock(); }
  const key = [text, sub, dot, eq, st.face.on, st.scale].join('|');
  island.classList.toggle('playing', eq);
  if (key === lastCompactKey) return; lastCompactKey = key;
  $('#c-text').innerHTML = (dot ? `<span class="dotc ${dot}"></span>` : '') + esc(text); $('#c-text').style.display = text ? '' : 'none';
  $('#c-sub').textContent = sub; $('#c-sub').style.display = sub ? '' : 'none';
  const w = measureCompact(); if (Math.abs(w - compactW) > 1) { compactW = w; if (!open) retarget(); }
}
function raise(text, ms = 8000) { alertText = text; alertUntil = Date.now() + ms; updateMood(); updateCompact(); }

// ============================================================ musica
let lyrics = [], lyrKey = '';
let clk = { pos: 0, t: 0, playing: false };
const curPos = () => { const p = clk.playing ? clk.pos + (performance.now() - clk.t) / 1000 : clk.pos; return np.dur ? Math.min(np.dur, p) : p; };
function syncClock(r, changed) { const est = curPos(); if (changed || r.playing !== clk.playing || Math.abs(r.pos - est) > 2) clk = { pos: r.pos || 0, t: performance.now(), playing: !!r.playing }; }
let seeking = false;
function paintProgress() {
  if (!hasTrack || seeking) return; const p = curPos();
  $('#m-pos').textContent = mmss(p); $('#m-dur').textContent = mmss(np.dur);
  const pct = np.dur ? Math.min(100, 100 * p / np.dur) : 0; $('#m-fill').style.width = pct + '%'; $('#m-knob').style.left = pct + '%';
  if (lyrics.length) { const l = [...lyrics].reverse().find((x) => x.t <= p); $('#m-lyr').textContent = l ? l.s : ''; }
}
const setCover = (u) => { $('#art').innerHTML = u ? `<img src="${u}" alt="">` : icon('music', 40); };
let pollT = 0;
async function pollMedia() {
  clearTimeout(pollT);
  try { const r = await api.invoke('now'); if (!r.error) np = r; } catch { /* agente non pronto */ }
  const had = hasTrack; hasTrack = !!np.title; playing = !!(np.title && np.playing);
  if (hasTrack) {
    $('#m-title').textContent = np.title; $('#m-artist').textContent = np.artist || np.album || '';
    $('#m-pp').innerHTML = icon(np.playing ? 'pause' : 'play', 22);
    const key = (np.artist || '') + '|' + np.title;
    syncClock(np, key !== lyrKey); paintProgress();
    $('#m-bar').style.opacity = np.canSeek === false ? .4 : 1;
    if (key !== lyrKey) { lyrKey = key; lyrics = []; $('#m-lyr').textContent = ''; setCover(''); loadLyrics(); loadCover(key); activity(); }
  } else { $('#m-title').textContent = tr('Nessun brano in riproduzione'); $('#m-artist').textContent = tr('Avvia un brano per controllarlo da qui'); $('#m-fill').style.width = '0'; $('#m-pos').textContent = $('#m-dur').textContent = '0:00'; if (lyrKey) { lyrKey = ''; setCover(''); } }
  if (had !== hasTrack) lastCompactKey = '';
  updateCompact(); updateMood();
  pollT = setTimeout(pollMedia, open ? 1000 : 2500);
}
async function loadCover(key) { const u = await api.invoke('cover', np.artist || '', np.title || ''); if (u && key === lyrKey) setCover(u); }
async function loadLyrics() {
  try { const r = await fetch('https://lrclib.net/api/get?artist_name=' + encodeURIComponent(np.artist || '') + '&track_name=' + encodeURIComponent(np.title)); const j = await r.json();
    lyrics = (j.syncedLyrics || '').split('\n').map((l) => { const m = l.match(/\[(\d+):(\d+\.?\d*)\](.*)/); return m && { t: +m[1] * 60 + +m[2], s: m[3].trim() }; }).filter(Boolean); } catch { /* testi non disponibili */ }
}
setInterval(() => { if (open && curTab === 'media') paintProgress(); }, 250);
$$('[data-k]').forEach((b) => { b.onclick = async () => {
  const a = b.dataset.k;
  if (a === 'toggle') { const was = curPos(); np.playing = !np.playing; playing = np.playing; clk = { pos: was, t: performance.now(), playing: np.playing }; $('#m-pp').innerHTML = icon(np.playing ? 'pause' : 'play', 22); updateMood(); }
  await api.invoke('media', a); setTimeout(pollMedia, a === 'toggle' ? 400 : 700);
}; });
// barra di avanzamento: clic o trascinamento per spostarsi nel brano
const bar = $('#m-bar');
function seekFrom(e) { const r = bar.getBoundingClientRect(), ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); $('#m-fill').style.width = ratio * 100 + '%'; $('#m-knob').style.left = ratio * 100 + '%'; $('#m-pos').textContent = mmss(ratio * (np.dur || 0)); return ratio; }
bar.addEventListener('pointerdown', (e) => {
  if (!hasTrack || !np.dur) return; if (np.canSeek === false) { toast('Questo brano non permette di spostarsi'); return; }
  seeking = true; bar.classList.add('drag'); bar.setPointerCapture(e.pointerId); seekFrom(e);
  const mv = (ev) => seekFrom(ev);
  const up = async (ev) => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.classList.remove('drag'); const pos = seekFrom(ev) * np.dur; clk = { pos, t: performance.now(), playing: np.playing }; seeking = false; await api.invoke('seek', pos); setTimeout(pollMedia, 500); };
  bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
});
let mvT; $('#mv').oninput = (e) => { clearTimeout(mvT); mvT = setTimeout(() => ctl('volset', +e.target.value), 30); };
async function refreshVol() { const v = await ctl('vol'); if (v.v >= 0) { $('#mv').value = v.v; $('#mv-ic').innerHTML = icon(v.m || v.v === 0 ? 'mute' : 'volume', 15); } }

// ============================================================ appunti, file
function renderClips(list) {
  const box = $('#clips'); box.innerHTML = '';
  if (!list.length) { box.innerHTML = '<div class="empty">Gli elementi copiati compariranno qui</div>'; return; }
  list.forEach((c) => {
    const d = document.createElement('div'); d.className = 'clip'; const lead = c.type === 'image' ? icon('image', 16) : c.type === 'link' ? icon('link', 16) : icon('file', 16);
    d.innerHTML = lead + (c.type === 'image' ? `<img src="${c.data}" alt="">` : `<div class="tx">${esc(c.data)}</div>`) + `<button class="pinb ${c.pin ? 'on' : ''}" data-pin aria-label="Fissa">${icon('bookmark', 15)}</button>`;
    d.onclick = (e) => { if (e.target.closest('[data-pin]')) api.send('pin', c.id); else if (c.type !== 'image') { api.send('copy', c.data); toast('Copiato negli appunti'); } };
    box.appendChild(d);
  });
}
api.on('clips', renderClips);
function renderShelf(l) {
  const box = $('#files'); box.innerHTML = '';
  l.forEach((f, i) => {
    const d = document.createElement('div'); d.className = 'file'; d.draggable = true; d.title = 'Trascina fuori per usarlo, doppio clic per aprirlo';
    d.innerHTML = icon('file', 16) + `<div class="tx">${esc(f.name)}</div><button class="x" aria-label="Rimuovi">${icon('x', 14)}</button>`;
    d.ondragstart = (e) => { e.preventDefault(); api.send('shelf-drag', f.path); }; d.onclick = (e) => { if (e.target.closest('.x')) api.send('shelf-remove', i); }; d.ondblclick = () => api.send('open', f.path); box.appendChild(d);
  });
}
api.on('shelf', renderShelf);
const drop = $('#drop'); let dragDepth = 0;
document.addEventListener('dragenter', (e) => { dragDepth++; dragging = true; clearTimeout(leaveT); if (!open) setOpen(true); tab('shelf'); drop.classList.add('over'); e.preventDefault(); });
document.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; drop.classList.remove('over'); dragging = false; } });
document.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; dragging = false; drop.classList.remove('over'); const paths = [...e.dataTransfer.files].map((f) => api.pathOf(f)).filter(Boolean); if (paths.length) { api.send('shelf-add', paths); toast(paths.length === 1 ? 'File aggiunto' : paths.length + ' file aggiunti'); } });
$('#pick-files').onclick = () => api.send('shelf-pick');
$('#qrbtn').onclick = async () => { const q = $('#qr'); q.src = await api.invoke('qr'); q.hidden = false; $('#qrbtn').textContent = 'Rigenera codice'; };

// ============================================================ widget
const wctx = {
  api, toast, settings: () => st, data: () => data,
  setData(k, v) { data[k] = v; api.send('data-set', k, v); widgetsH && widgetsH.update(); },
  patch: (p) => patchSettings(p),
};
function showWidgets() {
  if (editing) return renderWidgetEditor();
  if (!widgetsH) { widgetsH = mountWidgets($('#wgrid'), wctx); }
  $('#wgrid').hidden = false; $('#wedit').hidden = true; api.send('mon', open && widgetsH.needsMon);
}
function remountWidgets() { if (widgetsH) { widgetsH.destroy(); widgetsH = null; } if (!editing && curTab === 'widgets') showWidgets(); }
function renderWidgetEditor() {
  $('#wgrid').hidden = true; const box = $('#wedit'); box.hidden = false; const w = st.widgets;
  box.innerHTML = w.order.map((id, i) => { const off = w.off.includes(id), def = WIDGETS[id]; if (!def) return '';
    return `<div class="wi${off ? ' offw' : ''}">${icon(def.icon, 16)}<b>${def.title}</b><button class="nb" data-up="${i}" aria-label="Su">${icon('up', 14)}</button><button class="nb" data-dn="${i}" aria-label="Giù">${icon('down', 14)}</button><label class="switch" style="margin:0"><input type="checkbox" data-w="${id}"${off ? '' : ' checked'}><i></i></label></div>`; }).join('');
  box.onclick = (e) => { const u = e.target.closest('[data-up]'), d = e.target.closest('[data-dn]'); if (!u && !d) return; const o = w.order.slice(), i = +(u || d).dataset[u ? 'up' : 'dn'], j = u ? i - 1 : i + 1; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; patchSettings({ widgets: { order: o } }); renderWidgetEditor(); };
  box.onchange = (e) => { const c = e.target.closest('[data-w]'); if (!c) return; const off = new Set(st.widgets.off); c.checked ? off.delete(c.dataset.w) : off.add(c.dataset.w); patchSettings({ widgets: { off: [...off] } }); renderWidgetEditor(); };
}
$('#w-edit').onclick = () => { editing = !editing; $('#w-edit').innerHTML = editing ? `${icon('check', 13)} Fatto` : `${icon('edit', 13)} Personalizza`; $('#w-hint').textContent = editing ? 'Attiva, disattiva e sposta i widget' : 'Si attivano, si spostano e si nascondono a piacere'; if (editing) renderWidgetEditor(); else remountWidgets(); };
api.on('mon', (m) => { if (widgetsH) widgetsH.mon(m); });
timer.onDone = (d) => {
  sound('timer'); const label = tr(d.pomo ? (d.phase === 'work' ? 'Pomodoro finito: pausa!' : 'Pausa finita') : d.label ? d.label + ' finito' : 'Timer finito');
  toast(label); api.send('notify', label); raise(label, 9000); flash('alert', 3000);
};
api.on('timer:start', (a) => { timer.start(a.seconds, a.label || '', /pomodoro/i.test(a.label || '')); updateCompact(); });
api.on('timer:stop', () => { timer.stop(); stopwatch.reset(); updateCompact(); });
api.on('stopwatch:start', () => { stopwatch.start(); updateCompact(); });
api.on('reminder', (r) => { sound('rem'); toast('Promemoria: ' + r.text); raise(tr('Promemoria'), 10000); if (st.assistant.tts) assistant.speak('Promemoria: ' + r.text, 'it'); });

// ============================================================ controlli
const ctl = (cmd, arg) => api.invoke('ctl', cmd, arg);
let volT, brT, userDrag = false;
const volIcon = (v, m) => { $('#vol-ic').innerHTML = icon(m || v === 0 ? 'mute' : 'volume', 20); };
async function refreshCtl() {
  if (userDrag) return;
  const [v, b, mic, wifi, bt] = await Promise.all([ctl('vol'), ctl('br'), ctl('mic'), ctl('radio', 'WiFi'), ctl('radio', 'Bluetooth')]);
  if (v.v >= 0) { $('#vol').value = v.v; $('#vol-v').textContent = v.m ? 'Muto' : v.v + '%'; volIcon(v.v, v.m); }
  if (b.v >= 0) { $('#br').disabled = false; $('#br').value = b.v; $('#br-v').textContent = b.v + '%'; $('#br-note').textContent = ''; }
  else { $('#br').disabled = true; $('#br-v').textContent = 'n.d.'; $('#br-note').textContent = 'Questo schermo non espone il controllo software (DDC/CI disattivato).'; }
  setMic(mic.m); setRadio('wifi', wifi); setRadio('bt', bt);
}
setInterval(() => { if (open && curTab === 'ctrl') refreshCtl(); }, 2500);
$('#vol').addEventListener('input', (e) => { userDrag = true; const v = +e.target.value; $('#vol-v').textContent = v + '%'; volIcon(v, false); clearTimeout(volT); volT = setTimeout(async () => { await ctl('volset', v); setTimeout(() => { userDrag = false; }, 300); }, 25); });
$('#br').addEventListener('input', (e) => { userDrag = true; const v = +e.target.value; $('#br-v').textContent = v + '%'; clearTimeout(brT); brT = setTimeout(async () => { await ctl('brset', v); setTimeout(() => { userDrag = false; }, 300); }, 60); });
$('#vol-mute').onclick = async () => { const r = await ctl('volmute'); $('#vol-v').textContent = r.m ? 'Muto' : $('#vol').value + '%'; volIcon(+$('#vol').value, r.m); };
function setMic(m) { $('#mic-tx').textContent = m ? 'Microfono disattivato' : 'Microfono attivo'; $('#mic-ic').innerHTML = icon(m ? 'micoff' : 'mic', 20); $('#mic-btn').classList.toggle('off', !!m); $('#mic-btn').classList.toggle('on', !m); }
$('#mic-btn').onclick = async () => { const r = await ctl('micmute'); setMic(r.m); };
api.on('mic', (m) => setMic(m));
function setRadio(k, r) { const b = $('#' + k + '-btn'); if (!r || !r.ok) { b.classList.remove('on'); $('#' + k + '-tx').textContent = (k === 'wifi' ? 'Wi-Fi' : 'Bluetooth') + ' non disponibile'; return; } b.classList.toggle('on', r.on); $('#' + k + '-tx').textContent = (k === 'wifi' ? 'Wi-Fi' : 'Bluetooth') + (r.on ? ' acceso' : ' spento'); }
async function toggleRadio(k, kind) { const on = $('#' + k + '-btn').classList.contains('on'); const r = await ctl('radioset', kind + ' ' + (on ? 'off' : 'on')); if (r.ok) setRadio(k, { ok: true, on: r.on }); else { toast('Operazione non consentita: apro le impostazioni'); api.send('open-settings', k === 'wifi' ? 'ms-settings:network-wifi' : 'ms-settings:bluetooth'); } }
$('#wifi-btn').onclick = () => toggleRadio('wifi', 'WiFi'); $('#bt-btn').onclick = () => toggleRadio('bt', 'Bluetooth');
$$('[data-ms]').forEach((b) => { b.onclick = () => api.send('open-settings', b.dataset.ms); });
$$('[data-say]').forEach((b) => { b.onclick = async () => { const r = await api.invoke('assistant', b.dataset.say); if (r && r.say) toast(r.say); }; });
$('#night').onclick = () => api.send('nightlight');
$('#shot').onclick = () => { setOpen(false); setTimeout(() => api.send('shot'), 450); };
async function pickColor() { try { const r = await new EyeDropper().open(); $('#pick-tx').textContent = r.sRGBHex; api.send('copy', r.sRGBHex); toast('Colore copiato ' + r.sRGBHex); } catch { /* annullato */ } }
$('#pick').onclick = pickColor; api.on('eyedropper', pickColor);

// ============================================================ applicazioni e web
let appList = null, appLoading = false;
async function loadApps() {
  if (!appList && !appLoading) { appLoading = true; $('#apps').innerHTML = '<div class="empty" style="grid-column:1/-1">Carico le applicazioni...</div>'; appList = await api.invoke('apps'); appLoading = false; if (!appList.length) appList = null; }
  if (appList) drawApps();
  const fresh = await api.invoke('apps', true);
  if (fresh.length && (!appList || fresh.length !== appList.length || fresh.some((x, i) => x.name !== appList[i].name))) { appList = fresh; drawApps(); }
}
const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function drawApps() {
  const q = $('#app-q').value.trim().toLowerCase(), box = $('#apps'); box.innerHTML = '';
  const list = (appList || []).filter((a) => a.name.toLowerCase().includes(q)); $('#app-n').textContent = list.length + ' app';
  list.slice(0, 80).forEach((a) => {
    const b = document.createElement('button'); b.className = 'app'; b.title = a.name;
    b.innerHTML = `<span class="ai"><span class="av" style="--h:${hue(a.name)}">${esc(a.name[0].toUpperCase())}</span></span><span class="an">${esc(a.name)}</span>`;
    b.onclick = () => { api.send('open-app', { lnk: a.lnk, appid: a.appid }); setOpen(false); }; box.appendChild(b);
    if (!a.appid) { if (a.icon === undefined) a.icon = null; const apply = (u) => { if (u) b.querySelector('.ai').innerHTML = `<img src="${u}" alt="">`; }; if (a.icon) apply(a.icon); else if (a.icon === null) { a.icon = ''; api.invoke('icon', { lnk: a.lnk, target: a.target }).then((u) => { a.icon = u; apply(u); }); } }
  });
  if (!list.length) box.innerHTML = '<div class="empty" style="grid-column:1/-1">Nessuna applicazione trovata</div>';
}
$('#app-q').oninput = drawApps; $('#app-q').onkeydown = (e) => { if (e.key === 'Enter') { const f = $('#apps .app'); if (f) f.click(); } };
const FAVS = [['Google', 'https://www.google.com'], ['YouTube', 'https://www.youtube.com'], ['Wikipedia', 'https://it.wikipedia.org'], ['GitHub', 'https://github.com'], ['Maps', 'https://www.google.com/maps']];
const wv = $('#web-frame'); let webInit = false;
function initWeb() {
  if (webInit) return; webInit = true;
  $('#web-favs').innerHTML = FAVS.map((f) => `<button class="chip" data-u="${f[1]}">${f[0]}</button>`).join(''); $$('#web-favs [data-u]').forEach((b) => { b.onclick = () => nav(b.dataset.u); });
  wv.addEventListener('did-navigate', (e) => { $('#web-url').value = e.url; }); wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) $('#web-url').value = e.url; });
  nav('https://www.google.com');
}
function nav(v) { v = v.trim(); if (!v) return; let u; if (/^https?:\/\//i.test(v)) u = v; else if (/^[^\s]+\.[a-z]{2,}([/?#].*)?$/i.test(v)) u = 'https://' + v; else u = 'https://www.google.com/search?q=' + encodeURIComponent(v); wv.src = u; $('#web-url').value = u; }
$('#web-form').onsubmit = (e) => { e.preventDefault(); nav($('#web-url').value); };
$('#web-back').onclick = () => { try { if (wv.canGoBack()) wv.goBack(); } catch { /* webview non pronta */ } };
$('#web-fwd').onclick = () => { try { if (wv.canGoForward()) wv.goForward(); } catch { /* webview non pronta */ } };
$('#web-ext').onclick = () => { try { api.send('url', wv.getURL()); } catch { /* webview non pronta */ } };

// ============================================================ assistente, Claude, impostazioni
// cambio lingua: salva e ricarica l'interfaccia (la lingua del riconoscimento vocale segue quella scelta)
function setLang(code) { api.send('set', code === 'auto' ? { lang: 'auto' } : { lang: code, assistant: { whisperLang: code } }); setTimeout(() => location.reload(), 300); }
let localPatchAt = 0;
function patchSettings(p) { localPatchAt = Date.now(); st = merge(st, p); api.send('set', p); applySettings(!!p.tabsOff); if (p.widgets && !editing) remountWidgets(); }
const assistantCtx = {
  api, toast, settings: () => st, patch: patchSettings, examples: {}, sound,
  onState(s) { assistantState = s; updateMood(); },
  onResult(r) { if (assistantState !== 'talking') flash(r.ok ? 'happy' : 'surprised', r.ok ? 1300 : 900); },
  hint(h) { toast(h === 'vscode' ? 'VS Code non è collegato: apro la scheda Claude' : 'Chrome non è collegato: apro la scheda Claude'); tab('claude'); },
  open() { setOpen(true); tab('assistant'); },
};
let assistant, claudeUi, settingsUi;
api.on('assistant:listen', () => { setOpen(true); tab('assistant'); setTimeout(() => assistant.listen(), 120); });
api.on('ui:tab', (t) => { setOpen(true); tab(t); });
api.on('native-theme', (d) => { dark = d; if (st) applyTheme(); });

// eventi di Claude Code
const lastStatus = new Map();
api.on('claude:event', (ev) => {
  sessions = ev.sessions || []; activity(); if (claudeUi) claudeUi.onClaude(ev);
  const s = ev.session, before = lastStatus.get(s.id); lastStatus.set(s.id, s.status);
  if (s.status === 'waiting' && before !== 'waiting') { sound('wait'); flash('alert', 2500); }
  if (s.status === 'done' && before === 'working') { sound('done'); doneText = tr('Claude ha finito'); doneUntil = Date.now() + 8000; }
  lastCompactKey = ''; updateCompact(); updateMood();
});
api.on('integration', (s) => { integ = s; sessions = s.claude.sessions || sessions; if (claudeUi) claudeUi.setState(s); });

// ============================================================ impostazioni: applicazione
function applySettings(full) {
  applyTheme(); lastCompactKey = '';
  if (full) buildTabs();
  if (widgetsH) widgetsH.update();
  updateCompact(); updateMood(); layout();
  if (!open) retarget();
}
api.on('settings', (s) => {
  if (Date.now() - localPatchAt < 700) return; // eco di una modifica appena fatta qui: lo stato locale e' gia' aggiornato (evita rimbalzi con cambi rapidi)
  const wChanged = JSON.stringify(s.widgets) !== JSON.stringify(st.widgets), tChanged = JSON.stringify(s.tabsOff) !== JSON.stringify(st.tabsOff);
  st = s; applyTheme(); lastCompactKey = '';
  if (tChanged) buildTabs(); if (wChanged && !editing) remountWidgets();
  updateCompact(); updateMood(); layout(); if (!open) retarget();
});
api.on('data', (d) => { data = d; if (widgetsH) widgetsH.update(); });

// ============================================================ cursore e orologio
api.on('cursor', (c) => { setCursor(c.x, c.y); if (open && curTab === 'assistant') avatarLook(c.x, c.y); });
setInterval(() => { timer.tick(); if (stopwatch.running) updateCompact(); }, 250);
let sec = 0;
setInterval(() => {
  sec++; if (open && widgetsH && curTab === 'widgets') widgetsH.tick(); if (open && curTab === 'claude') claudeUi.tick();
  if (!open || curTab !== 'widgets') { /* le tick dei widget servono solo da aperti */ }
  updateCompact(); if (sec % 2 === 0) updateMood();
}, 1000);

// ============================================================ avvio
(async function boot() {
  const b = await api.invoke('boot');
  initI18n(b.settings.lang, b.locale);
  st = b.settings; data = b.data; dark = b.dark; integ = b.integration; sessions = (integ.claude && integ.claude.sessions) || [];
  assistantCtx.examples = b.examples; assistantCtx.lang = uiLang;
  $('#m-title').textContent = tr('Nessun brano in riproduzione'); $('#m-artist').textContent = tr('Avvia un brano per controllarlo da qui');
  $('#lang-btn').textContent = uiLang.toUpperCase(); $('#lang-btn').title = LANGS.map((l) => l[1]).join(' / ');
  $('#lang-btn').onclick = () => { const i = LANGS.findIndex((l) => l[0] === uiLang); setLang(LANGS[(i + 1) % LANGS.length][0]); };
  mountFace($('#face-c')); mountFace($('#face-o'));
  applyTheme(); renderClips(b.clips || []); renderShelf(b.shelf || []);
  assistant = initAssistant($('#p-assistant'), assistantCtx);
  claudeUi = initClaude($('#p-claude'), { api, toast }); claudeUi.setState(integ);
  settingsUi = initSettings($('#p-set'), { setLang, api, settings: () => st, patch: patchSettings, toast, goto: (t) => tab(t), installVoice: () => { const m = $('#p-assistant [data-mic]'); m && m.click(); },
    preview: (p) => { st = merge(st, p); layout(); } });
  buildTabs(); cur.w = compactW = 150; cur.h = compactH(); updateCompact(); cur.w = target.w = compactW; target = { w: compactW, h: compactH() }; layout(); pollMedia(); updateMood();
  window.__notch = { missing: () => [...missing], get lang() { return uiLang; }, get st() { return st; }, cursor: setCursor, flash, tab, setOpen, get open() { return open; }, assistant, timer, stopwatch, get mood() { return document.querySelector('#face-c').dataset.mood; }, get compactText() { return $('#c-text').textContent; } }; // per i test automatici
})();
