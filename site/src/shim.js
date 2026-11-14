// Finto "processo principale" per la demo nel sito: l'interfaccia dell'isola e' quella vera, qui simuliamo Windows, la musica e Claude Code.
import brain from '../brain.js';
import calc from '../calc.js';

const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'it' ? 'it' : 'en'; const pinned = params.get('pin') === '1'; const startTab = params.get('tab') || '';
const L = (it, en) => (lang === 'it' ? it : en);
const ALL_W = ['clock', 'weather', 'timer', 'system', 'todo', 'notes', 'calendar', 'stopwatch', 'calc', 'reminders', 'links', 'world', 'convert', 'breathe', 'dice'];
let settings = {
  lang, autostart: true, display: 'primary', theme: params.get('theme') || 'black', accent: params.get('accent') || '#8ab4ff', mode: 'floating', radius: 34, scale: 1, openOn: 'hover',
  face: { on: true, sleepy: true }, compact: 'auto', clock24: true, seconds: false, tabsOff: ['clip', 'shelf', 'apps', 'web'],
  widgets: { order: ALL_W.slice(), off: ['breathe', 'world'] }, widgetCfg: { city: 'Rome', world: ['Europe/Rome', 'America/New_York', 'Asia/Tokyo', 'Europe/London'] },
  assistant: { tts: false, claude: true, agent: 'act', whisperLang: lang, autoListenAfter: false }, claude: { notify: true, sounds: false },
  shortcuts: { toggle: 'Control+Alt+N', playpause: 'Control+Alt+P', mic: 'Control+Alt+M', hide: 'Control+Alt+H', shot: 'Control+Alt+S', color: 'Control+Alt+C', assistant: 'Control+Alt+Space' },
};
const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' ? merge(a[k], b[k]) : b[k]; return o; };
let data = {
  todos: [{ id: 1, s: L('Rivedere la pull request', 'Review the pull request'), d: false }, { id: 2, s: L('Prenotare il treno', 'Book the train tickets'), d: true }, { id: 3, s: L('Rispondere al team di design', 'Reply to the design team'), d: false }],
  notes: [{ id: 1, t: L('Idea: pagina con le statistiche del pomodoro', 'Idea: add a pomodoro stats page'), at: 1 }, { id: 2, t: L('Chiamare il dentista lunedì', 'Call the dentist on Monday'), at: 2 }],
  reminders: [], links: [{ name: 'GitHub', url: 'https://github.com' }, { name: 'Docs', url: 'https://developer.mozilla.org' }, { name: 'Maps', url: 'https://maps.google.com' }],
};
const listeners = {}; const emit = (ch, ...a) => (listeners[ch] || []).forEach((f) => { try { f(...a); } catch (e) { console.error(e); } });
let sessions = []; let playing = true; let posBase = 84, posAt = performance.now(); let ctlState = { v: 62, m: false, br: 70, mic: false, wifi: true, bt: true };
const track = { title: 'Midnight Drive', artist: 'Neon Harbor', dur: 213 };
const cover = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b8cff"/><stop offset="1" stop-color="#c06bff"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="100" cy="100" r="46" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="6"/><circle cx="100" cy="100" r="12" fill="#fff" fill-opacity=".8"/></svg>');
const curPos = () => { const p = posBase + (playing ? (performance.now() - posAt) / 1000 : 0); return p % track.dur; };
const toParent = (m) => { try { parent.postMessage({ src: 'notch-demo', ...m }, '*'); } catch { /* senza pagina padre */ } };

function integ() {
  return { claude: { found: true, hooks: { installed: true, partial: false, events: [] }, sessions }, vscode: { connected: true, info: { workspace: 'web-app', file: 'theme.css', branch: 'main', errors: 0 }, codeFound: true }, chrome: { connected: true, info: { tabCount: 7, active: { title: 'Pull request #42' } } }, hub: { port: 47820 } };
}
function upd(id, project, o) { const now = Date.now(); let s = sessions.find((x) => x.id === id); if (!s) { s = { id, project, cwd: '/work/' + project, status: 'idle', since: now, tool: '', detail: '', prompt: '', message: '', updated: now, tools: 0 }; sessions.push(s); } if (o.status && o.status !== s.status) s.since = now; Object.assign(s, o, { updated: now }); return s; }
function claudeEvent(s, ev) { emit('claude:event', { event: ev, session: { ...s }, sessions: sessions.map((x) => ({ ...x })) }); emit('integration', integ()); }

// ---------------------------------------------------------------- assistente (copia ridotta dell'esecutore vero)
const fmt = (n) => Number(n).toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', { maximumFractionDigits: 4 });
const JOKES = { it: ['Perché i programmatori preferiscono il buio? Perché la luce attira i bug.', 'Cosa dice un bit a un altro bit? Ci vediamo dopo il byte.'], en: ['Why do programmers prefer dark mode? Because light attracts bugs.', 'A SQL query walks into a bar, walks up to two tables and asks: can I join you?'] };
async function assistant(text) {
  const p = brain.parse(String(text), lang); const A = (p && p.args) || {}; const ok = (say, x) => ({ ok: true, say, lang, intent: p && p.intent, ...x });
  if (!p) return ok(L('Nell\'app vera questa frase passa a Claude Code, che può eseguire compiti sul tuo PC. Nella demo prova: "timer 10 minuti", "quanto fa 15 per 7", "tira un dado", "cambia tema in chiaro", "stato di claude".', 'In the real app this goes to Claude Code, which can carry out tasks on your PC. In this demo try: "timer 10 minutes", "what is 15 times 7", "roll a die", "switch theme to light", "claude status".'), { via: 'claude' });
  const demoDone = (it, en) => ok(L(it, en) + L(' (demo)', ' (demo)'));
  switch (p.intent) {
    case 'help': return ok(L('Posso gestire musica, volume, timer, promemoria, note, calcoli, meteo, app e siti, VS Code, Chrome e Claude Code. Prova: ', 'I can handle music, volume, timers, reminders, notes, math, weather, apps and sites, VS Code, Chrome and Claude Code. Try: ') + brain.EXAMPLES[lang].slice(0, 4).map((e) => '"' + e + '"').join(', ') + '.');
    case 'chat.hello': return ok(L('Ciao! Come posso aiutarti?', 'Hello! How can I help?'));
    case 'chat.thanks': return ok(L('Di niente!', 'You are welcome!'));
    case 'chat.who': return ok(L('Sono l\'assistente di NotchIsland: controllo musica, volume, timer, VS Code, Chrome e Claude Code.', 'I am the NotchIsland assistant: I control music, volume, timers, VS Code, Chrome and Claude Code.'));
    case 'chat.how': return ok(L('Benissimo, grazie! E tu?', 'Great, thanks! And you?'));
    case 'chat.night': return ok(L('Buonanotte!', 'Good night!'));
    case 'time': return ok(new Date().toLocaleTimeString(lang === 'it' ? 'it-IT' : 'en-US', { hour: '2-digit', minute: '2-digit' }).replace(/^/, L('Sono le ', 'It is ')) + '.');
    case 'date': return ok(L('Oggi è ', 'Today is ') + new Date().toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.');
    case 'calc': try { const v = calc.evaluate(A.expr); return ok(L('Fa ', 'That is ') + fmt(v) + '.', { value: v }); } catch { return { ok: false, say: L('Non riesco a calcolarlo.', 'I cannot calculate that.'), lang }; }
    case 'convert': try { const r = calc.convert(A.value, A.from, A.to); return ok(fmt(A.value) + ' ' + A.from + ' = ' + fmt(r.value) + ' ' + A.to + '.'); } catch { return { ok: false, say: L('Non conosco queste unità.', 'I do not know these units.'), lang }; }
    case 'dice': { const n = 1 + Math.floor(Math.random() * A.sides); return ok(L('Ho lanciato un dado a ', 'I rolled a ') + A.sides + L(' facce: è uscito ', '-sided die: ') + n + '.'); }
    case 'coin': return ok(Math.random() < 0.5 ? L('Testa.', 'Heads.') : L('Croce.', 'Tails.'));
    case 'random': return ok(L('Numero a caso: ', 'Random number: ') + (A.min + Math.floor(Math.random() * (A.max - A.min + 1))) + '.');
    case 'joke': return ok(JOKES[lang][Math.floor(Math.random() * JOKES[lang].length)]);
    case 'timer.start': emit('timer:start', { seconds: A.seconds, label: A.label || '' }); return ok(L('Timer avviato: ', 'Timer started: ') + Math.round(A.seconds / 60 * 10) / 10 + ' min.');
    case 'timer.stop': emit('timer:stop'); return ok(L('Timer fermato.', 'Timer stopped.'));
    case 'stopwatch.start': emit('stopwatch:start'); return ok(L('Cronometro avviato.', 'Stopwatch started.'));
    case 'note.add': data.notes.unshift({ id: Date.now(), t: A.text, at: Date.now() }); emit('data', data); return ok(L('Nota salvata.', 'Note saved.'));
    case 'todo.add': data.todos.push({ id: Date.now(), s: A.text, d: false }); emit('data', data); return ok(L('Aggiunto alle attività: ', 'Added to your tasks: ') + A.text + '.');
    case 'todo.list': return ok(data.todos.filter((t) => !t.d).map((t) => t.s).join(', ') + '.');
    case 'note.list': return ok(data.notes.slice(0, 3).map((n, i) => (i + 1) + '. ' + n.t).join(' '));
    case 'reminder': data.reminders.push({ id: Date.now(), text: A.text, at: A.at }); emit('data', data); return ok(L('Va bene, ti ricordo "', 'Okay, I will remind you "') + A.text + '".');
    case 'media': playing = A.action === 'play' ? true : A.action === 'pause' ? false : playing; if (A.action === 'next' || A.action === 'prev') { posBase = 0; posAt = performance.now(); } return ok(A.action === 'next' ? L('Brano successivo.', 'Next track.') : A.action === 'prev' ? L('Brano precedente.', 'Previous track.') : A.action === 'pause' ? L('Musica in pausa.', 'Music paused.') : L('Musica in riproduzione.', 'Music playing.'));
    case 'media.now': return ok(L('Stai ascoltando "Midnight Drive" di Neon Harbor.', 'You are listening to "Midnight Drive" by Neon Harbor.'));
    case 'volume.set': ctlState.v = A.value; return ok(L('Volume al ', 'Volume at ') + A.value + '%.');
    case 'volume.delta': ctlState.v = Math.max(0, Math.min(100, ctlState.v + A.delta)); return ok(L('Volume al ', 'Volume at ') + ctlState.v + '%.');
    case 'volume.mute': ctlState.m = !!A.value; return ok(A.value ? L('Audio disattivato.', 'Audio muted.') : L('Audio riattivato.', 'Audio unmuted.'));
    case 'brightness.set': ctlState.br = A.value; return ok(L('Luminosità al ', 'Brightness at ') + A.value + '%.');
    case 'mic': ctlState.mic = !!A.muted; return ok(A.muted ? L('Microfono disattivato.', 'Microphone muted.') : L('Microfono attivo.', 'Microphone on.'));
    case 'radio': ctlState[A.kind === 'WiFi' ? 'wifi' : 'bt'] = !!A.on; return ok((A.kind === 'WiFi' ? 'Wi-Fi ' : 'Bluetooth ') + (A.on ? L('acceso.', 'on.') : L('spento.', 'off.')));
    case 'screenshot': return demoDone('Screenshot salvato nella cartella Immagini.', 'Screenshot saved in Pictures.');
    case 'lock': return demoDone('Blocco il PC.', 'Locking the PC.');
    case 'weather': return ok(L('A Roma ci sono 18 gradi, parzialmente nuvoloso, vento a 9 km/h.', 'In Rome it is 18 degrees, partly cloudy, wind 9 km/h.'));
    case 'system': return ok(L('CPU al 14%, RAM al 48% (8,2 di 17 GB), disco con 520 GB liberi.', 'CPU at 14%, RAM at 48% (8.2 of 17 GB), disk with 520 GB free.'));
    case 'battery': return ok(L('Batteria al 86%, in carica.', 'Battery at 86%, charging.'));
    case 'ui.tab': emit('ui:tab', A.tab); return ok(L('Ecco.', 'Here it is.'));
    case 'ui.theme': settings = merge(settings, { theme: A.theme }); emit('settings', settings); return ok(L('Tema cambiato in ', 'Theme changed to ') + A.theme + '.');
    case 'ui.face': settings = merge(settings, { face: { on: A.on } }); emit('settings', settings); return ok(A.on ? L('Eccomi!', 'Here I am!') : L('Va bene, mi nascondo.', 'Okay, hiding.'));
    case 'claude.status': { const s = sessions[sessions.length - 1]; return ok(!s ? L('Nessuna sessione di Claude Code attiva. Usa i pulsanti sotto la demo per simularne una.', 'No Claude Code session is active. Use the buttons under the demo to simulate one.') : s.status === 'working' ? L('Claude lavora su ', 'Claude is working on ') + s.project + (s.tool ? ' (' + s.tool + ')' : '') + '.' : s.status === 'waiting' ? L('Claude ti aspetta su ', 'Claude is waiting for you on ') + s.project + '.' : L('Claude ha finito su ', 'Claude finished on ') + s.project + '.'); }
    case 'agent.reset': return ok(L('Ricominciamo da capo.', 'Fresh start.'));
    case 'vscode.cmd': case 'vscode.find': case 'vscode.run': case 'vscode.folder': case 'vscode.status': return demoDone('Fatto, in VS Code.', 'Done, in VS Code.');
    case 'chrome.cmd': case 'chrome.tabs': case 'chrome.switch': case 'chrome.page': return demoDone('Fatto, in Chrome.', 'Done, in Chrome.');
    case 'search': return demoDone('Cerco "' + A.query + '".', 'Searching "' + A.query + '".');
    case 'web.open': return demoDone('Apro ' + A.url.replace(/^https?:\/\//, '') + '.', 'Opening ' + A.url.replace(/^https?:\/\//, '') + '.');
    case 'app.open': return demoDone('Apro ' + A.name + '.', 'Opening ' + A.name + '.');
    case 'folder.open': return demoDone('Apro la cartella.', 'Opening the folder.');
    case 'claude.ask': return ok(L('Nell\'app vera risponde Claude Code con il tuo accesso, senza chiave API.', 'In the real app Claude Code answers using your own login, no API key.'), { via: 'claude' });
    default: return ok(L('Fatto.', 'Done.'));
  }
}

// ---------------------------------------------------------------- finta API dell'app
const api = {
  send(ch, a, b) {
    if (ch === 'set' && a) { settings = merge(settings, a); setTimeout(() => emit('settings', settings), 0); if (a.lang && a.lang !== lang) toParent({ type: 'lang', lang: a.lang }); toParent({ type: 'settings', settings: { theme: settings.theme, accent: settings.accent } }); }
    else if (ch === 'data-set') { data[a] = b; setTimeout(() => emit('data', data), 0); }
    else if (ch === 'hit-rect') hit = a;
    else if (ch === 'copy') { try { navigator.clipboard.writeText(String(a)); } catch { /* sandbox */ } }
    else if (ch === 'url') { try { window.open(a, '_blank', 'noopener'); } catch { /* bloccato */ } }
    else if (ch === 'settings-reset') { emit('settings', settings); }
  },
  async invoke(ch, a, b) {
    switch (ch) {
      case 'boot': return { locale: lang === 'it' ? 'it-IT' : 'en-GB', settings, data, clips: [], shelf: [], voice: { ready: false, sizeMB: 190 }, integration: integ(), dark: true, examples: brain.EXAMPLES };
      case 'now': return { title: track.title, artist: track.artist, album: '', playing, pos: curPos(), dur: track.dur, canNext: true, canPrev: true, canSeek: true };
      case 'cover': return cover;
      case 'media': if (a === 'toggle') playing = !playing; else if (a === 'play') playing = true; else if (a === 'pause') playing = false; else { posBase = 0; posAt = performance.now(); } if (a === 'toggle' || a === 'play' || a === 'pause') { posBase = curPos(); posAt = performance.now(); } return { ok: true };
      case 'seek': posBase = Number(a) || 0; posAt = performance.now(); return { ok: true };
      case 'ctl': {
        if (a === 'vol') return { v: ctlState.v, m: ctlState.m }; if (a === 'volset') { ctlState.v = +b; ctlState.m = false; return { v: ctlState.v, m: false }; } if (a === 'volmute') { ctlState.m = !ctlState.m; return { m: ctlState.m }; }
        if (a === 'br') return { v: ctlState.br }; if (a === 'brset') { ctlState.br = +b; return { v: ctlState.br }; } if (a === 'mic') return { m: ctlState.mic, v: 90 }; if (a === 'micmute') { ctlState.mic = !ctlState.mic; return { m: ctlState.mic }; }
        if (a === 'radio') return { ok: true, on: b === 'WiFi' ? ctlState.wifi : ctlState.bt }; if (a === 'radioset') { const [k, s] = String(b).split(' '); ctlState[k === 'WiFi' ? 'wifi' : 'bt'] = s === 'on'; return { ok: true, on: s === 'on' }; }
        return { ok: true };
      }
      case 'assistant': return assistant(a);
      case 'integration': return integ();
      case 'apps': return []; case 'icon': return ''; case 'displays': return { list: [{ id: '1', primary: true, label: '1 · 1920×1080' }], current: 'primary' };
      case 'voice:status': return { ready: false, sizeMB: 190 };
      case 'voice:install': return { ok: false, error: L('Non disponibile nella demo web: nell\'app vera scarica whisper.cpp una volta sola.', 'Not available in the web demo: the real app downloads whisper.cpp once.') };
      case 'voice:transcribe': return { ok: false, error: 'demo' };
      case 'claude:install': case 'claude:uninstall': return { ok: true, status: integ().claude.hooks };
      case 'claude:ask': return { ok: true, text: L('Nell\'app vera risponde Claude Code con il tuo accesso, senza chiave API.', 'In the real app Claude Code answers with your own login, no API key.') };
      case 'vscode:exec': case 'vscode:install': return { ok: true }; case 'chrome:prepare': return { ok: true, path: 'C:\\...' };
      case 'chrome:cmd': return { ok: true, r: a === 'listTabs' ? [{ id: 1, title: 'Pull request #42' }, { id: 2, title: 'MDN Web Docs' }, { id: 3, title: 'Lo-fi beats - YouTube' }] : {} };
      case 'calc': try { return { ok: true, value: calc.evaluate(a) }; } catch (e) { return { ok: false, error: e.message }; }
      case 'convert': try { return { ok: true, ...calc.convert(+a, b, arguments[3]) }; } catch (e) { return { ok: false, error: e.message }; }
      case 'qr': return ''; case 'voice:progress': return null;
      default: return null;
    }
  },
  on(ch, f) { (listeners[ch] = listeners[ch] || []).push(f); },
  pathOf: () => '',
  stats() { const t = performance.now() / 1000; return { cpu: Math.round(14 + 8 * Math.sin(t / 3) + Math.random() * 4), ramTotal: 17.1e9, ramFree: 8.8e9 + Math.sin(t / 7) * 3e8, uptime: 3 * 3600 + 1260 + t, disk: { total: 1e12, free: 5.2e11 }, model: 'Demo CPU 8-Core Processor', cores: 16 }; },
};
// la funzione "convert" usa 4 argomenti: l'invoke originale li passa tutti
api.invoke = ((orig) => function (ch, a, b, c) { if (ch === 'convert') { try { return Promise.resolve({ ok: true, ...calc.convert(+a, b, c) }); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); } } return orig.call(api, ch, a, b); })(api.invoke);
window.nApi = api;
document.documentElement.style.touchAction = 'pan-y'; // sul telefono lo scorrimento verticale va alla pagina del sito, non alla demo

// ---------------------------------------------------------------- mouse: il sito inoltra le coordinate, qui si decide quando "sei sopra l'isola"
let hit = null, inside = false, lastSent = 0;
function pointer(x, y) {
  emit('cursor', { x, y }); if (!hit) return;
  const nowInside = x >= hit.x - 2 && x <= hit.x + hit.w + 2 && y >= hit.y - 2 && y <= hit.y + hit.h + 2;
  if (pinned) { if (!inside) { inside = true; emit('hover', true); } return; }
  if (nowInside !== inside || (nowInside && Date.now() - lastSent > 600)) { inside = nowInside; lastSent = Date.now(); emit('hover', nowInside); }
}
window.addEventListener('message', (e) => {
  const m = e.data; if (!m || m.src !== 'notch-site') return;
  if (m.type === 'pointer') pointer(m.x, m.y);
  else if (m.type === 'leave') { if (!pinned) { inside = false; emit('hover', false); } }
  else if (m.type === 'tab') { emit('ui:tab', m.tab); }
  else if (m.type === 'set') { settings = merge(settings, m.patch); emit('settings', settings); }
  else if (m.type === 'sim') sim(m.what);
});
document.addEventListener('mousemove', (e) => pointer(e.clientX, e.clientY));
document.addEventListener('mouseleave', () => { if (!pinned) { inside = false; emit('hover', false); } });
setInterval(() => { if (hit) toParent({ type: 'rect', rect: hit, pinned }); }, 100);
setInterval(() => { if (hit && inside) pointer(-9999, -9999); }, 100000);

// ---------------------------------------------------------------- scenari richiamabili dal sito
let simT = [];
function sim(what) {
  simT.forEach(clearTimeout); simT = [];
  const later = (ms, f) => simT.push(setTimeout(f, ms));
  if (what === 'claude') {
    sessions = []; const s = upd('c1', 'web-app', { status: 'working', prompt: L('Aggiungi la modalità scura', 'Add dark mode'), tool: 'Edit', detail: 'src/theme.css' }); claudeEvent(s, 'UserPromptSubmit');
    later(2200, () => { upd('c1', 'web-app', { tool: 'Bash', detail: 'npm test' }); claudeEvent(sessions[0], 'PreToolUse'); });
    later(4600, () => { upd('c1', 'web-app', { status: 'waiting', message: L('Claude vuole eseguire: npm run build', 'Claude wants to run: npm run build'), tool: '' }); claudeEvent(sessions[0], 'Notification'); });
    later(9000, () => { upd('c1', 'web-app', { status: 'working', tool: 'Edit', detail: 'src/app.js', message: '' }); claudeEvent(sessions[0], 'PreToolUse'); });
    later(11500, () => { upd('c1', 'web-app', { status: 'done', tool: '' }); claudeEvent(sessions[0], 'Stop'); });
  } else if (what === 'reminder') emit('reminder', { text: L('Chiamare il dentista', 'Call the dentist') });
  else if (what === 'timer') emit('timer:start', { seconds: 12, label: '' });
  else if (what === 'play') { playing = !playing; posBase = curPos(); posAt = performance.now(); }
}

// ---------------------------------------------------------------- avvio dell'interfaccia vera
import('../island/island.js').then(() => {
  if (pinned) setTimeout(() => { if (window.__notch) { window.__notch.setOpen(true); if (startTab) window.__notch.tab(startTab); } }, 900);
  toParent({ type: 'ready' });
});
