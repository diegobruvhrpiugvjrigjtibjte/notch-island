// Widget dell'isola: ognuno si puo' attivare, disattivare e riordinare dalla scheda Widget.
import { icon } from '../shared/icons.js';
import { tr, lang, locale } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600); return (h ? h + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') : String(Math.floor(s / 60))) + ':' + String(s % 60).padStart(2, '0'); };
const $ = (r, s) => r.querySelector(s);

// ------------------------------------------------------------ timer e cronometro (stato globale: la pillola li mostra anche a isola chiusa)
export const timer = {
  running: false, end: 0, left: 0, total: 0, label: '', pomo: false, phase: 'work', subs: new Set(), onDone: null,
  emit() { this.subs.forEach((f) => f()); },
  start(sec, label = '', pomo = false) { this.total = sec; this.left = sec; this.end = Date.now() + sec * 1000; this.running = true; this.label = label; if (pomo) { this.pomo = true; this.phase = 'work'; } this.emit(); },
  pause() { if (this.running) { this.left = this.remaining(); this.running = false; this.emit(); } },
  resume() { if (!this.running && this.left > 0) { this.end = Date.now() + this.left * 1000; this.running = true; this.emit(); } },
  stop() { this.running = false; this.left = 0; this.total = 0; this.pomo = false; this.label = ''; this.emit(); },
  remaining() { return this.running ? Math.max(0, Math.ceil((this.end - Date.now()) / 1000)) : this.left; },
  tick() {
    if (!this.running || this.remaining() > 0) return;
    const was = { label: this.label, pomo: this.pomo, phase: this.phase };
    this.running = false; this.left = 0;
    if (was.pomo && was.phase === 'work') { this.onDone && this.onDone(was); this.phase = 'break'; this.start(5 * 60, 'Pausa'); return; }
    this.pomo = false; this.total = 0; this.emit(); this.onDone && this.onDone(was);
  },
};
export const stopwatch = {
  running: false, startAt: 0, base: 0, laps: [], subs: new Set(),
  emit() { this.subs.forEach((f) => f()); },
  elapsed() { return this.base + (this.running ? (Date.now() - this.startAt) / 1000 : 0); },
  start() { if (!this.running) { this.startAt = Date.now(); this.running = true; this.emit(); } },
  pause() { if (this.running) { this.base = this.elapsed(); this.running = false; this.emit(); } },
  lap() { if (this.elapsed() > 0) { this.laps.unshift(this.elapsed()); this.emit(); } },
  reset() { this.running = false; this.base = 0; this.laps = []; this.emit(); },
};

const TZ = [['Roma', 'Europe/Rome'], ['Londra', 'Europe/London'], ['Parigi', 'Europe/Paris'], ['Berlino', 'Europe/Berlin'], ['Madrid', 'Europe/Madrid'], ['Atene', 'Europe/Athens'], ['Mosca', 'Europe/Moscow'], ['Dubai', 'Asia/Dubai'], ['Mumbai', 'Asia/Kolkata'], ['Singapore', 'Asia/Singapore'], ['Tokyo', 'Asia/Tokyo'], ['Sydney', 'Australia/Sydney'], ['New York', 'America/New_York'], ['Chicago', 'America/Chicago'], ['Los Angeles', 'America/Los_Angeles'], ['San Paolo', 'America/Sao_Paulo']];
const WX = { 0: 'Sereno', 1: 'Quasi sereno', 2: 'Parz. nuvoloso', 3: 'Nuvoloso', 45: 'Nebbia', 48: 'Nebbia', 51: 'Pioggerella', 53: 'Pioggerella', 55: 'Pioggerella', 61: 'Pioggia', 63: 'Pioggia', 65: 'Pioggia forte', 71: 'Neve', 73: 'Neve', 75: 'Neve', 80: 'Rovesci', 81: 'Rovesci', 82: 'Rovesci forti', 95: 'Temporale' };
const wxIcon = (c) => (c <= 1 ? 'sun' : c <= 3 || c === 45 || c === 48 ? 'cloud' : c >= 71 && c <= 77 ? 'snow' : c >= 95 ? 'bolt' : 'droplet');
const UNITS = [['km', 'Chilometri'], ['mi', 'Miglia'], ['m', 'Metri'], ['ft', 'Piedi'], ['cm', 'Centimetri'], ['in', 'Pollici'], ['kg', 'Chili'], ['lb', 'Libbre'], ['c', '°C'], ['f', '°F'], ['l', 'Litri'], ['gal', 'Galloni'], ['km/h', 'km/h'], ['mph', 'mph'], ['gb', 'GB'], ['mb', 'MB']];

// ------------------------------------------------------------ definizioni
export const WIDGETS = {
  clock: {
    title: 'Orologio', icon: 'clock', span: 1,
    mount(el, c) {
      el.innerHTML = '<div class="big" data-t></div><div class="sub" data-d></div>';
      const draw = () => { const s = c.settings(), n = new Date(); $(el, '[data-t]').textContent = n.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: s.seconds ? '2-digit' : undefined, hour12: !s.clock24 }); $(el, '[data-d]').textContent = n.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }); };
      draw(); return { tick: draw, update: draw };
    },
  },
  world: {
    title: 'Orari nel mondo', icon: 'globe', span: 1,
    mount(el, c) {
      const draw = () => {
        const list = c.settings().widgetCfg.world, n = new Date();
        el.innerHTML = list.map((z, i) => `<div class="wrow"><select data-i="${i}" class="sel">${TZ.map((t) => `<option value="${t[1]}"${t[1] === z ? ' selected' : ''}>${t[0]}</option>`).join('')}</select><b>${n.toLocaleTimeString(locale, { timeZone: z, hour: '2-digit', minute: '2-digit' })}</b></div>`).join('');
        el.querySelectorAll('select').forEach((s) => { s.onchange = () => { const w = c.settings().widgetCfg.world.slice(); w[+s.dataset.i] = s.value; c.patch({ widgetCfg: { world: w } }); }; });
      };
      draw(); let last = ''; return { tick: () => { const m = new Date().getMinutes(); if (String(m) !== last) { last = String(m); if (!el.contains(document.activeElement)) draw(); } }, update: draw };
    },
  },
  weather: {
    title: 'Meteo', icon: 'cloud', span: 2,
    mount(el, c) {
      el.innerHTML = '<div class="wx" data-wx><div class="sub">Carico il meteo...</div></div><form class="citybar" data-f><input class="inp" data-q placeholder="Cerca una città" spellcheck="false" autocomplete="off"><button class="btn sm" type="submit">Cerca</button></form><div class="sub" data-e></div>';
      let at = 0, loaded = '';
      async function load(city) {
        const err = $(el, '[data-e]'); err.textContent = 'Ricerca...';
        try {
          const g = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=' + lang + '&name=' + encodeURIComponent(city))).json();
          if (!g.results || !g.results[0]) { err.textContent = 'Città non trovata'; return; }
          const p = g.results[0];
          const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`)).json();
          const cur = w.current, d = w.daily;
          const days = [1, 2, 3].map((i) => `<div class="fc"><span>${new Date(d.time[i]).toLocaleDateString(locale, { weekday: 'short' })}</span>${icon(wxIcon(d.weather_code[i]), 16)}<b>${Math.round(d.temperature_2m_max[i])}&deg;</b><span>${Math.round(d.temperature_2m_min[i])}&deg;</span></div>`).join('');
          $(el, '[data-wx]').innerHTML = `<div class="wxnow">${icon(wxIcon(cur.weather_code), 30)}<div><div class="t">${Math.round(cur.temperature_2m)}&deg;</div><div class="sub">${esc(p.name)}${p.country ? ', ' + esc(p.country) : ''}</div></div><div class="wxd"><div>${WX[cur.weather_code] || ''}</div><div class="sub">Percepita ${Math.round(cur.apparent_temperature)}&deg; &middot; vento ${Math.round(cur.wind_speed_10m)} km/h</div></div></div><div class="fcs">${days}</div>`;
          err.textContent = ''; at = Date.now(); loaded = city; if (c.settings().widgetCfg.city !== city) c.patch({ widgetCfg: { city } });
        } catch { err.textContent = 'Meteo non disponibile (controlla la connessione)'; }
      }
      $(el, '[data-f]').onsubmit = (e) => { e.preventDefault(); const v = $(el, '[data-q]').value.trim(); if (v) load(v); };
      const city0 = c.settings().widgetCfg.city; load(city0 === 'Roma' && lang === 'en' ? 'Rome' : city0);
      return { tick: () => { if (Date.now() - at > 900000 && loaded) load(loaded); } };
    },
  },
  timer: {
    title: 'Timer', icon: 'timer', span: 1,
    mount(el) {
      el.innerHTML = `<div class="big" data-d>25:00</div><div class="sub" data-l></div><div class="row"><button class="btn sm" data-go>Avvia</button><button class="btn sm ghost" data-rs>Azzera</button></div>
        <div class="row chips"><button class="chip" data-m="5">5</button><button class="chip" data-m="10">10</button><button class="chip" data-m="25">25</button><button class="chip" data-m="50">50</button><button class="chip" data-p>Pomodoro</button><input class="inp mini" data-c type="number" min="1" max="999" placeholder="min"></div>`;
      let preset = 25 * 60;
      const draw = () => {
        const rem = timer.running || timer.left > 0 ? timer.remaining() : preset; $(el, '[data-d]').textContent = mmss(rem);
        $(el, '[data-go]').textContent = timer.running ? 'Pausa' : timer.left > 0 ? 'Riprendi' : 'Avvia';
        $(el, '[data-l]').textContent = timer.pomo ? (timer.phase === 'work' ? 'Pomodoro: concentrazione' : 'Pomodoro: pausa') : timer.label || '';
      };
      $(el, '[data-go]').onclick = () => { if (timer.running) timer.pause(); else if (timer.left > 0) timer.resume(); else timer.start(preset, ''); };
      $(el, '[data-rs]').onclick = () => { timer.stop(); preset = 25 * 60; draw(); };
      el.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { preset = +b.dataset.m * 60; if (timer.running || timer.left > 0) timer.start(preset, ''); draw(); }; });
      $(el, '[data-p]').onclick = () => timer.start(25 * 60, '', true);
      $(el, '[data-c]').onkeydown = (e) => { if (e.key === 'Enter' && +e.target.value > 0) { preset = Math.min(999, +e.target.value) * 60; timer.start(preset, ''); e.target.value = ''; } };
      timer.subs.add(draw); draw(); return { tick: draw, destroy: () => timer.subs.delete(draw) };
    },
  },
  stopwatch: {
    title: 'Cronometro', icon: 'timer', span: 1,
    mount(el) {
      el.innerHTML = '<div class="big" data-d>0:00.0</div><div class="row"><button class="btn sm" data-go>Avvia</button><button class="btn sm ghost" data-lap>Giro</button><button class="btn sm ghost" data-rs>Azzera</button></div><div class="laps" data-laps></div>';
      const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') + '.' + Math.floor(s * 10 % 10);
      const draw = () => { $(el, '[data-d]').textContent = fmt(stopwatch.elapsed()); $(el, '[data-go]').textContent = stopwatch.running ? 'Pausa' : stopwatch.base > 0 ? 'Riprendi' : 'Avvia'; $(el, '[data-laps]').innerHTML = stopwatch.laps.slice(0, 3).map((l, i) => `<div><span>Giro ${stopwatch.laps.length - i}</span><b>${fmt(l)}</b></div>`).join(''); };
      $(el, '[data-go]').onclick = () => (stopwatch.running ? stopwatch.pause() : stopwatch.start()); $(el, '[data-lap]').onclick = () => stopwatch.lap(); $(el, '[data-rs]').onclick = () => stopwatch.reset();
      stopwatch.subs.add(draw); draw(); return { tick: () => { if (stopwatch.running) $(el, '[data-d]').textContent = fmt(stopwatch.elapsed()); }, destroy: () => stopwatch.subs.delete(draw) };
    },
  },
  todo: {
    title: 'Attività', icon: 'check', span: 1,
    mount(el, c) {
      el.innerHTML = '<input class="inp" data-in placeholder="Aggiungi e premi Invio" spellcheck="false"><div class="stack tight" data-l></div>';
      const draw = () => {
        const list = c.data().todos; $(el, '[data-l]').innerHTML = list.length ? list.map((t) => `<div class="todo${t.d ? ' done' : ''}" data-id="${t.id}"><span class="ck">${t.d ? icon('check', 11, 3) : ''}</span><span class="tx">${esc(t.s)}</span><button class="x" data-x aria-label="Elimina">${icon('x', 12)}</button></div>`).join('') : '<div class="sub" style="margin-top:6px">Nessuna attività</div>';
        el.querySelectorAll('.todo').forEach((d) => { d.onclick = (e) => { const all = c.data().todos.map((t) => ({ ...t })); const i = all.findIndex((t) => String(t.id) === d.dataset.id); if (i < 0) return; if (e.target.closest('[data-x]')) all.splice(i, 1); else all[i].d = !all[i].d; c.setData('todos', all); }; });
      };
      $(el, '[data-in]').onkeydown = (e) => { if (e.key === 'Enter' && e.target.value.trim()) { c.setData('todos', [...c.data().todos, { id: Date.now() + Math.random(), s: e.target.value.trim(), d: false }]); e.target.value = ''; } };
      draw(); return { update: draw };
    },
  },
  notes: {
    title: 'Note rapide', icon: 'note', span: 1,
    mount(el, c) {
      el.innerHTML = '<input class="inp" data-in placeholder="Scrivi una nota e premi Invio" spellcheck="false"><div class="stack tight" data-l></div>';
      const draw = () => {
        const list = c.data().notes.slice(0, 20); $(el, '[data-l]').innerHTML = list.length ? list.map((n) => `<div class="note" data-id="${n.id}" title="Clic per copiare"><span class="tx">${esc(n.t)}</span><button class="x" data-x aria-label="Elimina">${icon('x', 12)}</button></div>`).join('') : '<div class="sub" style="margin-top:6px">Nessuna nota</div>';
        el.querySelectorAll('.note').forEach((d) => { d.onclick = (e) => { const n = c.data().notes.find((x) => String(x.id) === d.dataset.id); if (!n) return; if (e.target.closest('[data-x]')) c.setData('notes', c.data().notes.filter((x) => x !== n && String(x.id) !== d.dataset.id)); else { c.api.send('copy', n.t); c.toast('Nota copiata'); } }; });
      };
      $(el, '[data-in]').onkeydown = (e) => { if (e.key === 'Enter' && e.target.value.trim()) { c.setData('notes', [{ id: Date.now() + Math.random(), t: e.target.value.trim(), at: Date.now() }, ...c.data().notes]); e.target.value = ''; } };
      draw(); return { update: draw };
    },
  },
  reminders: {
    title: 'Promemoria', icon: 'bell', span: 1,
    mount(el, c) {
      el.innerHTML = '<input class="inp" data-t placeholder="Cosa devo ricordarti?" spellcheck="false"><div class="row"><input type="time" class="inp" data-h><button class="btn sm" data-add>Aggiungi</button></div><div class="row chips"><button class="chip" data-in="10">tra 10 min</button><button class="chip" data-in="30">tra 30 min</button><button class="chip" data-in="60">tra 1 ora</button></div><div class="stack tight" data-l></div>';
      const add = (at) => { const t = $(el, '[data-t]').value.trim(); if (!t) { c.toast('Scrivi prima cosa ricordare'); return; } c.setData('reminders', [...c.data().reminders, { id: Date.now() + Math.random(), text: t, at }]); $(el, '[data-t]').value = ''; };
      $(el, '[data-add]').onclick = () => { const v = $(el, '[data-h]').value; if (!v) return c.toast('Scegli un orario'); const [h, m] = v.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); add(d.getTime()); };
      el.querySelectorAll('[data-in]').forEach((b) => { b.onclick = () => add(Date.now() + +b.dataset.in * 60000); });
      const draw = () => {
        const list = c.data().reminders.slice().sort((a, b) => a.at - b.at);
        $(el, '[data-l]').innerHTML = list.map((r) => `<div class="note" data-id="${r.id}"><span class="tx">${new Date(r.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} &middot; ${esc(r.text)}</span><button class="x" aria-label="Elimina">${icon('x', 12)}</button></div>`).join('');
        el.querySelectorAll('.note').forEach((d) => { d.onclick = () => c.setData('reminders', c.data().reminders.filter((x) => String(x.id) !== d.dataset.id)); });
      };
      draw(); return { update: draw };
    },
  },
  calendar: {
    title: 'Calendario', icon: 'calendar', span: 1,
    mount(el) {
      let m = new Date(); m.setDate(1);
      const draw = () => {
        const y = m.getFullYear(), mo = m.getMonth(), first = (new Date(y, mo, 1).getDay() + 6) % 7, days = new Date(y, mo + 1, 0).getDate(), today = new Date();
        let cells = [1, 2, 3, 4, 5, 6, 7].map((d) => new Date(2024, 0, d).toLocaleDateString(locale, { weekday: 'narrow' })).map((d) => `<i class="dh">${d}</i>`).join('') + '<i></i>'.repeat(first);
        for (let d = 1; d <= days; d++) cells += `<i class="${today.getFullYear() === y && today.getMonth() === mo && today.getDate() === d ? 'today' : ''}">${d}</i>`;
        el.innerHTML = `<div class="calh"><button class="nb" data-p>${icon('prev', 12)}</button><b>${m.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</b><button class="nb" data-n>${icon('next', 12)}</button></div><div class="cal">${cells}</div>`;
        $(el, '[data-p]').onclick = () => { m = new Date(y, mo - 1, 1); draw(); }; $(el, '[data-n]').onclick = () => { m = new Date(y, mo + 1, 1); draw(); };
      };
      draw(); return { tick: () => {} };
    },
  },
  system: {
    title: 'Computer', icon: 'cpu', span: 3, needsMon: true,
    mount(el, c) {
      el.innerHTML = `<div class="sysrow">${['cpu:CPU', 'ram:RAM', 'gpu:GPU', 'disk:Disco'].map((x) => { const [k, l] = x.split(':'); return `<div class="gauge"><span class="gl">${l}</span><b data-${k}>--</b><div class="gb"><i data-${k}-b></i></div><span class="gs" data-${k}-t></span></div>`; }).join('')}</div>
        <div class="sysmeta"><div><span>Processore</span><b data-model>--</b></div><div><span>Rete</span><b data-net>--</b></div><div><span>Attivo da</span><b data-up>--</b></div><div><span>Batteria</span><b data-bat>--</b></div><div><span>Temperatura</span><b data-temp>non esposta dal sistema</b></div></div><div class="procs" data-procs></div>`;
      const GB = (b) => (b / 1073741824).toFixed(1), speed = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB/s' : Math.round(b / 1024) + ' KB/s');
      const gauge = (k, pct, tx) => { $(el, `[data-${k}]`).textContent = tx; $(el, `[data-${k}-b]`).style.width = Math.min(100, Math.max(0, pct)) + '%'; };
      const sys = () => {
        const s = c.api.stats(), used = s.ramTotal - s.ramFree; gauge('cpu', s.cpu, s.cpu + '%'); gauge('ram', 100 * used / s.ramTotal, Math.round(100 * used / s.ramTotal) + '%'); $(el, '[data-ram-t]').textContent = GB(used) + ' / ' + GB(s.ramTotal) + ' GB';
        if (s.disk) { const u = s.disk.total - s.disk.free; gauge('disk', 100 * u / s.disk.total, Math.round(100 * u / s.disk.total) + '%'); $(el, '[data-disk-t]').textContent = GB(s.disk.free) + ' GB liberi'; }
        $(el, '[data-model]').textContent = s.model + ' (' + s.cores + ' thread)'; const h = Math.floor(s.uptime / 3600), d = Math.floor(h / 24); $(el, '[data-up]').textContent = d ? d + ' g ' + (h % 24) + ' h' : h + ' h ' + Math.floor(s.uptime % 3600 / 60) + ' min';
      };
      if (navigator.getBattery) navigator.getBattery().then((b) => { const u = () => { $(el, '[data-bat]').textContent = Math.round(b.level * 100) + '%' + (b.charging ? ' (in carica)' : ''); }; u(); b.onlevelchange = b.onchargingchange = u; });
      sys();
      return { tick: sys, mon(m) { if (m.gpu != null) gauge('gpu', m.gpu, m.gpu + '%'); $(el, '[data-net]').textContent = 'giù ' + speed(m.down) + '  su ' + speed(m.up); if (m.temp != null) $(el, '[data-temp]').textContent = m.temp + ' °C'; $(el, '[data-procs]').innerHTML = (m.top || []).map((p) => `<div><span class="pn">${esc(p.name)}</span><span>${p.cpu}% CPU</span><span>${p.ram} MB</span></div>`).join(''); } };
    },
  },
  calc: {
    title: 'Calcolatrice', icon: 'calc', span: 1,
    mount(el, c) {
      const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='];
      el.innerHTML = `<div class="cdisp"><span data-x class="sub"></span><b data-r>0</b></div><div class="ckeys">${keys.map((k) => `<button class="ck${'÷×−+'.includes(k) ? ' op' : k === '=' ? ' eq' : ''}" data-k="${k}">${k}</button>`).join('')}</div>`;
      let expr = '', result = '';
      const show = () => { $(el, '[data-x]').textContent = expr || ' '; $(el, '[data-r]').textContent = result || expr || '0'; };
      async function press(k) {
        if (k === 'C') { expr = ''; result = ''; } else if (k === '⌫') { expr = expr.slice(0, -1); result = ''; }
        else if (k === '=') { if (!expr) return; const r = await c.api.invoke('calc', expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')); if (r.ok) { result = String(r.value); expr = String(r.value); } else result = 'Errore'; }
        else { if (result && /[0-9.(]/.test(k)) { expr = ''; } result = ''; expr += k; }
        show();
      }
      el.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => press(b.dataset.k); });
      el.addEventListener('keydown', (e) => { const m = { '*': '×', '/': '÷', '-': '−' }; if (/^[0-9+().*/%-]$/.test(e.key)) { e.preventDefault(); press(m[e.key] || e.key); } else if (e.key === 'Enter') { e.preventDefault(); press('='); } else if (e.key === 'Backspace') { e.preventDefault(); press('⌫'); } });
      el.tabIndex = 0; show(); return {};
    },
  },
  links: {
    title: 'Collegamenti', icon: 'link', span: 1,
    mount(el, c) {
      el.innerHTML = '<div class="linkgrid" data-l></div><div class="row"><input class="inp" data-n placeholder="Nome" spellcheck="false" style="width:38%"><input class="inp" data-u placeholder="indirizzo.it" spellcheck="false"><button class="btn sm" data-add>+</button></div>';
      const draw = () => {
        $(el, '[data-l]').innerHTML = c.data().links.map((l, i) => `<span class="lk"><button class="chip" data-i="${i}">${esc(l.name)}</button><button class="lx" data-x="${i}" aria-label="Rimuovi">${icon('x', 10)}</button></span>`).join('');
        el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => c.api.send('url', c.data().links[+b.dataset.i].url); });
        el.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => c.setData('links', c.data().links.filter((_, i) => i !== +b.dataset.x)); });
      };
      $(el, '[data-add]').onclick = () => { let u = $(el, '[data-u]').value.trim(), n = $(el, '[data-n]').value.trim(); if (!u) return; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { new URL(u); } catch { return c.toast('Indirizzo non valido'); } c.setData('links', [...c.data().links, { name: n || new URL(u).hostname.replace(/^www\./, ''), url: u }]); $(el, '[data-u]').value = ''; $(el, '[data-n]').value = ''; };
      draw(); return { update: draw };
    },
  },
  convert: {
    title: 'Convertitore', icon: 'sliders', span: 1,
    mount(el, c) {
      const opt = (sel) => UNITS.map((u) => `<option value="${u[0]}"${u[0] === sel ? ' selected' : ''}>${u[1]}</option>`).join('');
      el.innerHTML = `<div class="row" style="margin-top:0"><input class="inp" data-v type="number" value="1" step="any"><button class="nb" data-sw aria-label="Inverti">${icon('refresh', 14)}</button></div><div class="row"><select class="sel" data-f>${opt('km')}</select><select class="sel" data-t>${opt('mi')}</select></div><div class="big sm" data-r style="margin-top:10px">--</div><div class="sub" data-e></div>`;
      async function run() { const r = await c.api.invoke('convert', $(el, '[data-v]').value, $(el, '[data-f]').value, $(el, '[data-t]').value); $(el, '[data-r]').textContent = r.ok ? String(r.value) + ' ' + tr($(el, '[data-t]').selectedOptions[0].textContent) : '--'; $(el, '[data-e]').textContent = r.ok ? '' : 'Unità non compatibili'; }
      ['[data-v]', '[data-f]', '[data-t]'].forEach((s) => { $(el, s).oninput = run; $(el, s).onchange = run; });
      $(el, '[data-sw]').onclick = () => { const f = $(el, '[data-f]'), t = $(el, '[data-t]'), x = f.value; f.value = t.value; t.value = x; run(); };
      run(); return {};
    },
  },
  breathe: {
    title: 'Respira', icon: 'wind', span: 1,
    mount(el, c) {
      el.innerHTML = '<div class="breath"><div class="bcircle" data-c></div><div class="bt" data-t>Pronto</div></div><div class="row" style="justify-content:center"><button class="btn sm" data-go>Inizia</button></div>';
      const phases = [['Inspira', 4], ['Trattieni', 4], ['Espira', 4], ['Trattieni', 4]]; let timerId = 0, i = 0;
      const step = () => { const [t, s] = phases[i % 4]; $(el, '[data-t]').textContent = t; const circ = $(el, '[data-c]'); circ.style.transition = `transform ${s}s ease-in-out`; circ.style.transform = i % 4 === 0 ? 'scale(1.35)' : i % 4 === 2 ? 'scale(.7)' : circ.style.transform; i++; timerId = setTimeout(step, s * 1000); };
      $(el, '[data-go]').onclick = () => { if (timerId) { clearTimeout(timerId); timerId = 0; $(el, '[data-go]').textContent = 'Inizia'; $(el, '[data-t]').textContent = 'Pronto'; $(el, '[data-c]').style.transform = 'scale(1)'; } else { i = 0; $(el, '[data-go]').textContent = 'Ferma'; step(); } };
      return { destroy: () => clearTimeout(timerId) };
    },
  },
  dice: {
    title: 'Dado e moneta', icon: 'dice', span: 1,
    mount(el) {
      el.innerHTML = '<div class="big" data-r>?</div><div class="row chips"><button class="chip" data-d="6">D6</button><button class="chip" data-d="20">D20</button><button class="chip" data-d="100">D100</button><button class="chip" data-coin>Moneta</button></div>';
      const set = (t) => { const r = $(el, '[data-r]'); r.textContent = t; r.animate([{ transform: 'scale(1.3)', opacity: .4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'ease-out' }); };
      el.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => set(1 + Math.floor(Math.random() * +b.dataset.d)); });
      $(el, '[data-coin]').onclick = () => set(Math.random() < 0.5 ? 'Testa' : 'Croce'); return {};
    },
  },
};

/** Disegna i widget attivi nell'ordine scelto. Restituisce i gestori per tick/update/destroy. */
export function mountWidgets(grid, ctx) {
  const st = ctx.settings(); const inst = [];
  grid.innerHTML = '';
  for (const id of st.widgets.order) {
    if (st.widgets.off.includes(id) || !WIDGETS[id]) continue;
    const def = WIDGETS[id], card = document.createElement('div'); card.className = 'card wcard'; card.dataset.w = id; card.style.gridColumn = 'span ' + def.span;
    card.innerHTML = `<h4>${def.title}</h4><div class="wbody"></div>`; grid.appendChild(card);
    try { const h = def.mount(card.querySelector('.wbody'), ctx) || {}; inst.push({ id, def, h }); } catch (e) { card.querySelector('.wbody').textContent = 'Errore: ' + e.message; }
  }
  if (!inst.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Nessun widget attivo. Premi "Personalizza" per sceglierli.</div>';
  return {
    tick() { for (const w of inst) { try { w.h.tick && w.h.tick(); } catch { /* widget in errore */ } } },
    update() { for (const w of inst) { try { w.h.update && w.h.update(); } catch { /* widget in errore */ } } },
    mon(m) { for (const w of inst) { try { w.h.mon && w.h.mon(m); } catch { /* widget in errore */ } } },
    needsMon: inst.some((w) => w.def.needsMon),
    destroy() { for (const w of inst) { try { w.h.destroy && w.h.destroy(); } catch { /* widget in errore */ } } },
  };
}
