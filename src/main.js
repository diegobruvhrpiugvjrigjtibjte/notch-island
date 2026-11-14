const { app, BrowserWindow, ipcMain, globalShortcut, screen, clipboard, shell, Tray, Menu, nativeImage, nativeTheme, Notification, dialog, net, session } = require('electron');
const path = require('path'), os = require('os'), http = require('http'), fs = require('fs');
const { execFile, spawn } = require('child_process');
let _qr; const QRCode = { toDataURL: (...a) => (_qr = _qr || require('qrcode')).toDataURL(...a) }; // caricato solo quando serve
const { Agent } = require('./agents');
const { Store } = require('./store');
const { Hub } = require('./hub');
const { Voice } = require('./voice');
const { Executor } = require('./executor');
const claude = require('./claude');
let T = (x) => x, uiLangNow = 'it';
const loadI18n = async () => { const core = await import(require('url').pathToFileURL(path.join(__dirname, 'i18n', 'core.js')).href); uiLangNow = core.resolveLang(store.settings.lang, app.getLocale()); const dict = uiLangNow === 'it' ? null : (await import(require('url').pathToFileURL(path.join(__dirname, 'i18n', uiLangNow + '.js')).href)).default; T = dict ? core.makeTr(dict) : (x) => x; };
const { evaluate, convert } = require('./calc');

const T0 = Date.now(); const trace = (m) => { if (process.env.NOTCH_TRACE) console.log('[trace] +' + (Date.now() - T0) + 'ms ' + m); };
trace('main.js caricato');
app.setName('NotchIsland');
// Il sandbox di Chromium impedisce l'avvio su alcuni PC Windows: lo disattiviamo (app locale, nessun contenuto remoto nelle finestre dell'app).
app.commandLine.appendSwitch('no-sandbox');
const userData = app.getPath('userData');
const noGpuFlag = path.join(userData, 'nogpu');
if (fs.existsSync(noGpuFlag)) app.commandLine.appendSwitch('disable-gpu');
app.on('child-process-gone', (_, d) => {
  // Se la GPU non funziona, riavvia in modalita' software e ricordalo.
  if (d.type === 'GPU' && !fs.existsSync(noGpuFlag)) { try { fs.writeFileSync(noGpuFlag, '1'); } catch { /* sola lettura */ } app.relaunch(); app.exit(0); }
});
if (!app.requestSingleInstanceLock()) app.quit();

const IW = 820, IH = 470;
let store, hub, voice, executor, ctl, info, island, tray, hidden = false, islandOpen = false;
let clips = [], shelf = [], iconCache = new Map();
const send = (ch, ...a) => { if (island && !island.isDestroyed()) island.webContents.send(ch, ...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assistantDir = path.join(userData, 'assistant');

// ---------------- Finestra ----------------
// schermo scelto nelle impostazioni ("primary" = principale); se non c'e' piu' si torna al principale
const pickDisplay = () => { const id = store && store.settings.display; return (id && id !== 'primary' && screen.getAllDisplays().find((x) => String(x.id) === String(id))) || screen.getPrimaryDisplay(); };
const displayList = () => screen.getAllDisplays().map((x, i) => ({ id: String(x.id), primary: x.id === screen.getPrimaryDisplay().id, label: (i + 1) + ' · ' + x.bounds.width + '×' + x.bounds.height }));
const geom = () => { const d = pickDisplay().bounds; return { x: Math.round(d.x + d.width / 2 - IW / 2), y: d.y, width: IW, height: IH }; };
function mkWindow() {
  const w = new BrowserWindow({ ...geom(), frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: true, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'shared', 'preload.js'), contextIsolation: true, backgroundThrottling: false, webviewTag: true } });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setIgnoreMouseEvents(true, { forward: true });
  w.loadFile(path.join(__dirname, 'island', 'index.html'));
  w.once('ready-to-show', () => {
    trace('ready-to-show'); if (!hidden) w.showInactive();
    // gli agenti e il hub partono dopo la comparsa della pillola, cosi' non rallentano l'avvio
    setTimeout(() => { ctl.start(); info.start(); startHub(); trace('agenti avviati'); }, 300);
  });
  return w;
}
const applyVisibility = () => { if (island && !island.isDestroyed()) (hidden ? island.hide() : island.showInactive()); };

async function iconFor(p) {
  if (!p) return '';
  if (iconCache.has(p)) return iconCache.get(p);
  try { const i = await app.getFileIcon(p, { size: 'large' }); const u = i.isEmpty() ? '' : i.toDataURL(); iconCache.set(p, u); return u; } catch { return ''; }
}

// ---------------- Appunti ----------------
function startClipboard() {
  let last = '';
  setInterval(() => {
    const img = clipboard.readImage(); let item = null;
    if (!img.isEmpty()) { const url = img.resize({ height: 90 }).toDataURL(); if (url !== last) item = { type: 'image', data: url }; last = url; }
    else { const t = clipboard.readText(); if (t && t !== last) item = { type: /^https?:\/\//i.test(t.trim()) ? 'link' : 'text', data: t }; if (t) last = t; }
    if (item) { item.id = Date.now(); clips.unshift(item); clips = clips.filter((c) => c.pin).concat(clips.filter((c) => !c.pin)).slice(0, 60); send('clips', clips); }
  }, 800);
}

// ---------------- Trasferimento verso il telefono (solo LAN) ----------------
let server;
const lanIp = () => { for (const l of Object.values(os.networkInterfaces())) for (const i of l) if (i.family === 'IPv4' && !i.internal) return i.address; return '127.0.0.1'; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function startServer() {
  if (server) return;
  server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<meta name=viewport content="width=device-width"><body style="font-family:system-ui;background:#101114;color:#fff;padding:24px"><h2>' + T('File dal PC') + '</h2>' + (shelf.map((f, i) => '<p><a style="color:#7cc4ff;font-size:18px" href="/f/' + i + '">' + esc(f.name) + '</a></p>').join('') || T('Nessun file')) + '</body>');
    } else if (/^\/f\/\d+$/.test(req.url)) {
      const f = shelf[+req.url.split('/')[2]]; if (!f) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(f.name) + '"'); fs.createReadStream(f.path).pipe(res);
    } else { res.statusCode = 404; res.end(); }
  }).listen(0, '0.0.0.0');
}

// ---------------- Hit-test: la finestra e' trasparente al mouse tranne sopra l'isola ----------------
let hitRect = null, ignoring = null, lastCur = '', lastHoverSent = 0;
function hitLoop() {
  if (!island || island.isDestroyed() || !island.isVisible()) return;
  const p = screen.getCursorScreenPoint(), b = island.getBounds();
  const cx = p.x - b.x, cy = p.y - b.y, key = cx + ',' + cy;
  if (key !== lastCur) { lastCur = key; send('cursor', { x: cx, y: cy }); } // la faccina segue il mouse ovunque sia
  if (!hitRect) return;
  const r = hitRect, inside = cx >= r.x - 2 && cx <= r.x + r.w + 2 && cy >= r.y - 2 && cy <= r.y + r.h + 2;
  if (ignoring !== !inside) { ignoring = !inside; island.setIgnoreMouseEvents(!inside, { forward: true }); send('hover', inside); lastHoverSent = Date.now(); }
  else if (inside && Date.now() - lastHoverSent > 600) { send('hover', true); lastHoverSent = Date.now(); } // ripete "sei sopra": nessun evento perso
}

// ---------------- Sistema ----------------
let prevCpu = os.cpus();
function sysStats() {
  const cur = os.cpus(); let idle = 0, total = 0;
  cur.forEach((c, i) => { for (const k in c.times) total += c.times[k] - prevCpu[i].times[k]; idle += c.times.idle - prevCpu[i].times.idle; });
  prevCpu = cur;
  let disk = null; try { const d = fs.statfsSync(process.env.SystemDrive ? process.env.SystemDrive + '\\' : 'C:\\'); disk = { total: d.blocks * d.bsize, free: d.bavail * d.bsize }; } catch { /* unita non leggibile */ }
  const cpus = os.cpus(), GB = (b) => Math.round(b / 107374182.4) / 10;
  return { cpu: total ? Math.round(100 * (1 - idle / total)) : 0, ramTotal: os.totalmem(), ramFree: os.freemem(), ramPct: Math.round(100 * (1 - os.freemem() / os.totalmem())), ramUsedGB: GB(os.totalmem() - os.freemem()), ramTotalGB: GB(os.totalmem()),
    uptime: os.uptime(), disk, diskFreeGB: disk ? GB(disk.free) : null, model: (cpus[0] && cpus[0].model || '').replace(/\(R\)|\(TM\)|CPU|\s+/g, ' ').trim(), cores: cpus.length };
}
ipcMain.on('stats', (e) => { e.returnValue = sysStats(); });
const battery = () => new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress'], { windowsHide: true, timeout: 8000 }, (err, out) => {
  try { const j = JSON.parse(String(out).trim()); const b = Array.isArray(j) ? j[0] : j; res(b ? { pct: b.EstimatedChargeRemaining, charging: [2, 6, 7, 8, 9].includes(b.BatteryStatus) } : null); } catch { res(null); }
}));

// ---------------- Copertina (solo titolo/artista del brano in ascolto) ----------------
const coverCache = new Map();
async function cover(artist, title) {
  const key = artist + '|' + title; if (coverCache.has(key)) return coverCache.get(key);
  let url = '';
  try {
    const q = encodeURIComponent((artist + ' ' + title).replace(/slowed|ultra|reverb|sped up/gi, '').trim());
    const j = await (await net.fetch('https://itunes.apple.com/search?media=music&entity=song&limit=1&term=' + q)).json();
    if (j.results && j.results[0]) url = j.results[0].artworkUrl100.replace('100x100bb', '400x400bb');
  } catch { /* offline */ }
  coverCache.set(key, url); return url;
}

// ---------------- Azioni ----------------
const micToggle = async () => { const r = await ctl.send('micmute'); send('toast', r.m ? 'Microfono disattivato' : 'Microfono attivo'); send('mic', !!r.m); };
async function screenshot() {
  const r = await ctl.send('shot', '', 20000);
  send('toast', r.file ? 'Screenshot salvato in Immagini' : 'Screenshot non riuscito'); if (r.file) shell.showItemInFolder(r.file);
  return r.file || '';
}
const CTL_OK = new Set(['vol', 'volset', 'volmute', 'mic', 'micmute', 'br', 'brset', 'radio', 'radioset', 'key']);
/** Tasti multimediali "veri": prima la sessione multimediale di Windows, poi il tasto fisico come ripiego. */
async function mediaCmd(action) {
  const r = await info.send('media', action, 8000);
  if (!r.ok) { const key = { pause: 'playpause', play: 'playpause', toggle: 'playpause', next: 'next', prev: 'prev' }[action]; if (key) await ctl.send('key', key); }
  return { ok: true, viaSession: !!r.ok };
}
function addFiles(paths) {
  for (const p of paths) if (p && fs.existsSync(p) && !shelf.find((f) => f.path === p)) shelf.push({ path: p, name: path.basename(p) });
  send('shelf', shelf);
}
let appsCache = null, appsPromise = null, appsAt = 0;
function scanApps() {
  if (!appsPromise) appsPromise = info.send('apps', '', 60000).then((r) => { appsPromise = null; if (r.apps && r.apps.length) { appsCache = r.apps; appsAt = Date.now(); } return appsCache || []; });
  return appsPromise;
}
const getApps = (fresh) => (appsCache && !(fresh && Date.now() - appsAt > 20000) ? Promise.resolve(appsCache) : scanApps());

function findCode() {
  const c = [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'), path.join(process.env.ProgramFiles || '', 'Microsoft VS Code', 'bin', 'code.cmd')];
  return c.find((f) => f && fs.existsSync(f)) || null;
}
const cmdRun = (line, opts = {}) => spawn('cmd.exe', ['/d', '/s', '/c', line], { windowsHide: true, windowsVerbatimArguments: true, ...opts });
function launch(x) {
  if (x.exe) { if (/^ms-settings:/.test(x.exe)) return shell.openExternal(x.exe); cmdRun(`start "" "${x.exe}"`, { detached: true, stdio: 'ignore' }).unref(); return; }
  const a = x.app; if (a.appid) execFile('explorer.exe', ['shell:AppsFolder\\' + a.appid], () => {}); else if (a.lnk) shell.openPath(a.lnk);
}
async function openWithCode(p) { const code = findCode(); if (!code) throw new Error('VS Code non trovato'); cmdRun(`"${code}" "${p}"`, { detached: true, stdio: 'ignore' }).unref(); }
const fetchJson = async (u) => (await net.fetch(u)).json();

// ---------------- Integrazioni (VS Code, Chrome, Claude Code) ----------------
const resPath = (...p) => path.join(app.getAppPath(), ...p);
function integrationState() {
  const st = claude.status();
  return {
    claude: { found: !!claude.findClaude(), hooks: st, sessions: hub ? hub.claudeSessions() : [] },
    vscode: { connected: !!hub && hub.connected('vscode'), info: hub && hub.connected('vscode') ? hub.info('vscode') : null, codeFound: !!findCode() },
    chrome: { connected: !!hub && hub.connected('chrome'), info: hub && hub.connected('chrome') ? hub.info('chrome') : null },
    hub: { port: hub ? hub.port : 0 },
  };
}
function installVsix() {
  return new Promise((res) => {
    const code = findCode(), vsix = resPath('integrations', 'vscode', 'notch-island-1.0.0.vsix');
    if (!code) return res({ ok: false, error: 'VS Code non trovato' }); if (!fs.existsSync(vsix)) return res({ ok: false, error: 'Estensione non trovata nell\'app' });
    const p = cmdRun(`"${code}" --install-extension "${vsix}" --force`); let out = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => res(/successfully installed/i.test(out) ? { ok: true } : { ok: false, error: out.trim().slice(0, 200) || 'Installazione non riuscita' })); p.on('error', (e) => res({ ok: false, error: e.message }));
  });
}
function prepareChrome() {
  const src = resPath('integrations', 'chrome'), dest = path.join(userData, 'chrome-extension');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src)) { if (f === 'key.json') continue; fs.copyFileSync(path.join(src, f), path.join(dest, f)); }
  const chrome = [path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')].find((f) => f && fs.existsSync(f));
  clipboard.writeText(dest); shell.openPath(dest);
  if (chrome) spawn(chrome, ['chrome://extensions'], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true, path: dest, chrome: !!chrome };
}

function startHub() {
  hub = new Hub(userData); hub.ignoreCwd = path.resolve(assistantDir).toLowerCase();
  hub.start().then((port) => {
    trace('hub sulla porta ' + port);
    const ip = claude.installedPort(); if (ip && ip !== port) { try { claude.install(port, hub.token); } catch { /* settings non scrivibile */ } } // allinea gli hook se la porta e' cambiata
    send('integration', integrationState());
  }).catch((e) => console.error('hub non avviato:', e.message));
  const prev = new Map();
  hub.on('claude', (ev) => {
    send('claude:event', { event: ev.event, session: ev.session, sessions: ev.sessions });
    const s = ev.session, before = prev.get(s.id); prev.set(s.id, s.status);
    if (s.status === 'waiting' && before !== 'waiting' && store.settings.claude.notify && !islandOpen) { try { new Notification({ title: T('Claude ti aspetta'), body: `${s.project}${s.message ? ': ' + s.message : ''}` }).show(); } catch { /* notifiche non disponibili */ } }
  });
  hub.on('client', () => send('integration', integrationState()));
  hub.on('state', () => send('integration', integrationState()));
}

// ---------------- IPC ----------------
function setupIpc() {
  ipcMain.on('hit-rect', (_, r) => { hitRect = r; });
  ipcMain.on('open-state', (_, v) => { islandOpen = v; });
  ipcMain.on('mic', micToggle);
  ipcMain.on('shot', screenshot);
  ipcMain.handle('ctl', (_, cmd, arg) => (CTL_OK.has(cmd) ? ctl.send(cmd, arg == null ? '' : String(arg)) : { error: 'denied' }));
  ipcMain.handle('media', (_, action) => (['next', 'prev', 'play', 'pause', 'toggle'].includes(action) ? mediaCmd(action) : { error: 'denied' }));
  ipcMain.handle('seek', async (_, sec) => (Number.isFinite(+sec) ? info.send('seek', String(Math.max(0, +sec)), 8000) : { error: 'denied' }));
  ipcMain.on('nightlight', () => shell.openExternal('ms-settings:nightlight'));
  ipcMain.on('open-settings', (_, uri) => { if (/^ms-settings:/.test(uri)) shell.openExternal(uri); });
  ipcMain.on('copy', (_, t) => clipboard.writeText(String(t)));
  ipcMain.on('pin', (_, id) => { const c = clips.find((c) => c.id === id); if (c) c.pin = !c.pin; send('clips', clips); store.mutate((d) => { d.pins = clips.filter((c) => c.pin); }); });
  ipcMain.on('open', (_, p) => shell.openPath(p));
  ipcMain.on('url', (_, u) => { if (/^https?:\/\//.test(u)) shell.openExternal(u); });
  // NOTCH_DEMO=1: brano finto per gli screenshot pubblici (non mostra cosa ascolti davvero)
  const DEMO_COVER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b8cff"/><stop offset="1" stop-color="#c06bff"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="100" cy="100" r="46" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="6"/><circle cx="100" cy="100" r="12" fill="#fff" fill-opacity=".8"/></svg>');
  ipcMain.handle('now', () => (process.env.NOTCH_DEMO ? { title: 'Midnight Drive', artist: 'Neon Harbor', album: '', playing: true, pos: 84 + (Date.now() / 1000) % 60, dur: 213, canNext: true, canPrev: true, canSeek: true } : info.send('now', '', 6000)));
  ipcMain.handle('cover', (_, a, t) => (process.env.NOTCH_DEMO ? DEMO_COVER : cover(a, t)));
  ipcMain.on('mon', (_, on) => info.send('mon', on ? 'on' : 'off'));
  ipcMain.handle('apps', (_, fresh) => getApps(!!fresh));
  ipcMain.handle('icon', (_, a) => iconFor(a.target && fs.existsSync(a.target) ? a.target : a.lnk));
  ipcMain.on('open-app', (_, a) => launch({ app: a }));
  // impostazioni e dati
  ipcMain.handle('boot', () => ({ locale: app.getLocale(), settings: store.settings, data: store.data, clips, shelf, voice: voice.status(), integration: integrationState(), dark: nativeTheme.shouldUseDarkColors, examples: require('./brain').EXAMPLES }));
  ipcMain.handle('displays', () => ({ list: displayList(), current: store.settings.display }));
  ipcMain.on('set', (_, p) => { if (p && typeof p === 'object') store.patch(p); });
  ipcMain.on('settings-reset', () => store.reset());
  ipcMain.on('data-set', (_, key, value) => { if (['todos', 'notes', 'reminders', 'links'].includes(key) && Array.isArray(value)) store.mutate((d) => { d[key] = value.slice(0, 500); }); });
  // file shelf
  ipcMain.on('shelf-add', (_, paths) => addFiles(paths));
  ipcMain.on('shelf-pick', async () => { const r = await dialog.showOpenDialog(island, { properties: ['openFile', 'multiSelections'] }); if (!r.canceled) addFiles(r.filePaths); });
  ipcMain.on('shelf-remove', (_, i) => { shelf.splice(i, 1); send('shelf', shelf); });
  ipcMain.on('shelf-drag', async (e, p) => {
    let icon = await app.getFileIcon(p, { size: 'normal' }).catch(() => null);
    if (!icon || icon.isEmpty()) icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR42mNkYPhfz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC');
    try { e.sender.startDrag({ file: p, icon }); } catch { /* trascinamento annullato */ }
  });
  ipcMain.handle('qr', async () => { startServer(); await new Promise((r) => (server.listening ? r() : server.once('listening', r))); return QRCode.toDataURL('http://' + lanIp() + ':' + server.address().port + '/', { margin: 1, width: 220, color: { dark: '#0b0c10', light: '#ffffff' } }); });
  ipcMain.on('notify', (_, t) => new Notification({ title: 'NotchIsland', body: String(t) }).show());
  // calcoli
  ipcMain.handle('calc', (_, expr) => { try { return { ok: true, value: evaluate(expr) }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('convert', (_, v, f, t) => { try { return { ok: true, ...convert(+v, f, t) }; } catch (e) { return { ok: false, error: e.message }; } });
  // assistente
  ipcMain.handle('assistant', async (_, text) => executor.handle(String(text || '').slice(0, 2000)));
  ipcMain.on('assistant:stop', () => executor.abort());
  ipcMain.on('assistant:reset', () => executor.reset());
  ipcMain.handle('voice:status', () => voice.status());
  ipcMain.handle('voice:install', async () => { try { return { ok: true, status: await voice.install((p) => send('voice:progress', p)) }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('voice:transcribe', async (_, buf, lang) => {
    try { return { ok: true, text: await voice.transcribe(Buffer.from(buf), { lang, prompt: 'Assistente NotchIsland. Comandi: volume, timer, promemoria, musica, Claude, VS Code, Chrome, scheda, apri, cerca.' }) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  // Claude Code, VS Code, Chrome
  ipcMain.handle('integration', () => integrationState());
  ipcMain.handle('claude:install', () => { try { return { ok: true, status: claude.install(hub.port, hub.token) }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('claude:uninstall', () => { try { return { ok: true, status: claude.uninstall() }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('claude:ask', async (_, prompt) => { try { return { ok: true, text: await claude.ask(String(prompt).slice(0, 6000), { cwd: assistantDir, timeout: 180000 }) }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('vscode:exec', async (_, command) => { try { return { ok: true, r: await hub.command('vscode', 'exec', { command: String(command) }) }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('vscode:install', () => installVsix());
  ipcMain.handle('chrome:prepare', () => { try { return prepareChrome(); } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('chrome:cmd', async (_, cmd, args) => { try { return { ok: true, r: await hub.command('chrome', String(cmd), args || {}) }; } catch (e) { return { ok: false, error: e.message }; } });
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const s = store.settings.shortcuts, reg = (k, f) => { try { if (k) globalShortcut.register(k, f); } catch { /* combinazione non valida o occupata */ } };
  reg(s.toggle, () => send('toggle'));
  reg(s.playpause, () => mediaCmd('toggle'));
  reg(s.mic, micToggle);
  reg(s.hide, () => { hidden = !hidden; applyVisibility(); });
  reg(s.shot, screenshot);
  reg(s.color, () => send('eyedropper'));
  reg(s.assistant, () => { if (hidden) { hidden = false; applyVisibility(); } send('assistant:listen'); });
}

function registerAutostart() {
  if (!app.isPackaged) return;
  const exe = process.execPath, KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  if (store.settings.autostart === false) execFile('reg', ['delete', KEY, '/v', 'NotchIsland', '/f'], () => {});
  else execFile('reg', ['add', KEY, '/v', 'NotchIsland', '/t', 'REG_SZ', '/d', '"' + exe + '"', '/f'], () => {});
  execFile('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'electron.app.Electron', '/f'], () => {});
}

// Web Drawer: i contenuti web girano isolati, senza accesso a Node e senza preload.
app.on('web-contents-created', (_, wc) => {
  wc.on('will-attach-webview', (e, prefs) => { delete prefs.preload; delete prefs.preloadURL; prefs.nodeIntegration = false; prefs.contextIsolation = true; prefs.sandbox = true; });
  if (wc.getType() === 'webview') wc.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
});

app.whenReady().then(() => {
  trace('app ready');
  // microfono: solo per le pagine dell'app (file://), mai per i contenuti web del Web Drawer
  const okMedia = (wc, perm) => perm === 'media' && !!wc && /^file:/.test(wc.getURL());
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(okMedia(wc, perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => okMedia(wc, perm));
  try { fs.mkdirSync(assistantDir, { recursive: true }); } catch { /* gia' presente */ }
  store = new Store(path.join(userData, 'settings.json')); clips = (store.data.pins || []).slice();
  voice = new Voice(userData);
  registerAutostart();
  ctl = new Agent('control.ps1', null, true);
  info = new Agent('info.ps1', (ev) => { if (ev.ev === 'mon') send('mon', ev); }, true);
  const ui = { emit: (ch, ...a) => send(ch, ...a) };
  const uiLang = () => uiLangNow;
  executor = new Executor({
    get hub() { return hub || { connected: () => false, claudeSessions: () => [], info: () => null, command: () => Promise.reject(new Error('hub non pronto')) }; },
    ctl, info, claude: { findClaude: claude.findClaude, status: claude.status, ask: (p, o) => claude.ask(p, { cwd: assistantDir, ...o }), agent: (p, o) => claude.agent(p, { cwd: assistantDir, ...o }) }, store, ui, sleep, uiLang, now: () => new Date(),
    clipboard: { read: () => clipboard.readText(), write: (t) => clipboard.writeText(String(t)) }, screenshot, lockPc: async () => execFile('rundll32.exe', ['user32.dll,LockWorkStation'], () => {}), sysStats, battery,
    fetchJson, openExternal: (u) => { if (/^https?:\/\//.test(u)) shell.openExternal(u); }, openPath: (p) => shell.openPath(p), launch, getApps, openWithCode,
  });
  loadI18n().catch(() => { /* resta italiano */ });
  island = mkWindow(); trace('finestra creata');
  setupIpc(); registerShortcuts(); startClipboard(); setInterval(hitLoop, 40);
  store.on('settings', (s) => { if (island && !island.isDestroyed()) { island.setBounds(geom()); hitRect = null; ignoring = null; } send('settings', s); registerAutostart(); registerShortcuts(); loadI18n().catch(() => { /* resta la lingua precedente */ }); });
  store.on('data', (d) => send('data', d));
  nativeTheme.on('updated', () => send('native-theme', nativeTheme.shouldUseDarkColors));
  // promemoria in scadenza
  setInterval(() => { for (const r of store.dueReminders()) { send('reminder', r); try { new Notification({ title: T('Promemoria'), body: r.text }).show(); } catch { /* notifiche non disponibili */ } } }, 4000);
  setTimeout(() => getApps(), 5000); // precarica l'elenco applicazioni in background
  let lastDisp = JSON.stringify(pickDisplay().bounds) + pickDisplay().scaleFactor;
  screen.on('display-added', () => { island.setBounds(geom()); send('displays-changed'); });
  screen.on('display-removed', () => { island.setBounds(geom()); send('displays-changed'); });
  screen.on('display-metrics-changed', () => {
    const now = JSON.stringify(pickDisplay().bounds) + pickDisplay().scaleFactor;
    island.setBounds(geom()); if (now !== lastDisp) { lastDisp = now; setTimeout(() => island.reload(), 300); }
  });
  tray = new Tray(nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR42mNkYPhfz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC'));
  tray.setToolTip('NotchIsland');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: T('Mostra / nascondi'), click: () => { hidden = !hidden; applyVisibility(); } },
    { label: T('Parla con l\'assistente'), click: () => { hidden = false; applyVisibility(); send('assistant:listen'); } },
    { label: T('Esci'), click: () => app.quit() }]));
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); try { store.flush(); ctl.stop(); info.stop(); hub && hub.stop(); } catch { /* chiusura */ } });
app.on('window-all-closed', () => app.quit());
