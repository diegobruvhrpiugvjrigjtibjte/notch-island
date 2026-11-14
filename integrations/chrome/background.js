// NotchIsland per Chrome: si collega all'app sul PC (solo 127.0.0.1) e ne esegue i comandi sulle schede.
const PORTS = Array.from({ length: 13 }, (_, i) => 47820 + i);
let ws = null, token = null, port = null, backoff = 1500, state = { connected: false, error: '' };

async function pair() {
  for (const p of PORTS) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/pair`, { cache: 'no-store', headers: { 'X-Notch-Pair': 'chrome' } });
      if (r.ok) { const j = await r.json(); if (j.token) { token = j.token; port = p; return true; } }
    } catch { /* porta non in uso */ }
  }
  return false;
}

let connecting = false;
async function connect() {
  if (connecting) return;
  connecting = true;
  try { await connectInner(); } finally { connecting = false; }
}
async function connectInner() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (!(await pair())) { state = { connected: false, error: 'NotchIsland non è in esecuzione' }; return schedule(); }
  try { ws = new WebSocket(`ws://127.0.0.1:${port}/ws?kind=chrome&token=${token}`); } catch { return schedule(); }
  ws.onopen = () => { backoff = 1500; state = { connected: true, error: '' }; send({ type: 'hello', info: { browser: 'Chrome', version: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] } }); pushState(); };
  ws.onmessage = async (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type !== 'command') return;
    try { send({ type: 'result', id: m.id, ok: true, result: await run(m.cmd, m.args || {}) }); }
    catch (err) { send({ type: 'result', id: m.id, ok: false, error: String(err && err.message || err) }); }
  };
  ws.onclose = () => { state = { connected: false, error: 'Disconnesso' }; ws = null; schedule(); };
  ws.onerror = () => { try { ws && ws.close(); } catch { /* già chiuso */ } };
}
function schedule() { setTimeout(connect, backoff); backoff = Math.min(backoff * 1.6, 15000); }
const send = (o) => { try { ws && ws.readyState === 1 && ws.send(JSON.stringify(o)); } catch { /* socket chiuso */ } };

// ---- stato inviato all'isola (schede, scheda attiva, audio)
let stT = null;
function pushState() {
  clearTimeout(stT);
  stT = setTimeout(async () => {
    try {
      const tabs = await chrome.tabs.query({});
      const active = tabs.find((t) => t.active && t.lastFocusedWindow) || tabs.find((t) => t.active);
      send({ type: 'state', state: { tabCount: tabs.length, audible: tabs.filter((t) => t.audible).map((t) => t.title).slice(0, 5), active: active ? { id: active.id, title: active.title, url: active.url } : null } });
    } catch { /* browser in chiusura */ }
  }, 400);
}
for (const ev of ['onCreated', 'onRemoved', 'onUpdated', 'onActivated']) chrome.tabs[ev].addListener(pushState);

const pickTab = async (id) => (id ? chrome.tabs.get(id) : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]);
const SEARCH = { google: 'https://www.google.com/search?q=', youtube: 'https://www.youtube.com/results?search_query=', wikipedia: 'https://it.wikipedia.org/w/index.php?search=', amazon: 'https://www.amazon.it/s?k=', github: 'https://github.com/search?q=', maps: 'https://www.google.com/maps/search/' };
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

async function run(cmd, a) {
  switch (cmd) {
    case 'ping': return { pong: true };
    case 'listTabs': return (await chrome.tabs.query({})).map((t) => ({ id: t.id, windowId: t.windowId, title: t.title, url: t.url, active: t.active, audible: !!t.audible, muted: !!t.mutedInfo?.muted }));
    case 'activateTab': { const t = await chrome.tabs.update(a.id, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); return { title: t.title }; }
    case 'switchTab': { // cerca per testo nel titolo o nell'indirizzo
      const q = fold(a.query); const t = (await chrome.tabs.query({})).find((x) => fold(x.title).includes(q) || fold(x.url).includes(q));
      if (!t) throw new Error('Nessuna scheda corrisponde a "' + a.query + '"');
      await chrome.tabs.update(t.id, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); return { title: t.title };
    }
    case 'closeTab': { const t = await pickTab(a.id); await chrome.tabs.remove(t.id); return { closed: t.title }; }
    case 'newTab': { const t = await chrome.tabs.create({ url: a.url || undefined, active: true }); await chrome.windows.update(t.windowId, { focused: true }); return { id: t.id }; }
    case 'openUrl': { if (!/^https?:\/\//i.test(a.url)) throw new Error('Indirizzo non valido'); const t = await chrome.tabs.create({ url: a.url, active: true }); await chrome.windows.update(t.windowId, { focused: true }); return { id: t.id }; }
    case 'search': { const base = SEARCH[a.engine] || SEARCH.google; const t = await chrome.tabs.create({ url: base + encodeURIComponent(a.query), active: true }); await chrome.windows.update(t.windowId, { focused: true }); return { id: t.id }; }
    case 'reload': { const t = await pickTab(a.id); await chrome.tabs.reload(t.id); return { reloaded: t.title }; }
    case 'muteTabs': { const tabs = a.all === false ? [await pickTab()] : (await chrome.tabs.query({ audible: true })); for (const t of tabs) await chrome.tabs.update(t.id, { muted: a.mute !== false }); return { count: tabs.length }; }
    case 'pauseMedia': case 'playMedia': {
      const tabs = (await chrome.tabs.query({ audible: true })).concat(a.id ? [] : (await chrome.tabs.query({ active: true, lastFocusedWindow: true })));
      const seen = new Set(); let n = 0;
      for (const t of tabs) {
        if (seen.has(t.id) || !/^https?:/.test(t.url || '')) continue; seen.add(t.id);
        const r = await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, args: [cmd === 'pauseMedia'], func: (pause) => { let c = 0; document.querySelectorAll('video,audio').forEach((m) => { if (pause ? !m.paused : m.paused) { pause ? m.pause() : m.play().catch(() => {}); c++; } }); return c; } }).catch(() => []);
        n += r.reduce((s, x) => s + (x.result || 0), 0);
      }
      return { affected: n };
    }
    case 'pageInfo': {
      const t = await pickTab(a.id);
      if (!/^https?:/.test(t.url || '')) return { title: t.title, url: t.url, text: '' };
      const r = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => ({ selection: String(getSelection() || '').slice(0, 2000), text: (document.body?.innerText || '').slice(0, 6000) }) }).catch(() => []);
      return { title: t.title, url: t.url, ...(r[0]?.result || {}) };
    }
    default: throw new Error('Comando sconosciuto: ' + cmd);
  }
}

// mantiene vivo il service worker e ritenta la connessione
chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => { if (!ws || ws.readyState !== WebSocket.OPEN) connect(); else send({ type: 'event', name: 'ping' }); });
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.runtime.onMessage.addListener((m, _s, reply) => { if (m === 'status') reply(state); if (m === 'reconnect') { connect(); reply(true); } });
connect();
