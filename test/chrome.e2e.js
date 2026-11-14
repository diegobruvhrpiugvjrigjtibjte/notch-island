// Prova reale con Chrome (profilo temporaneo isolato). Chrome recente non carica piu' le estensioni da riga di comando,
// quindi l'estensione viene caricata con il protocollo di debug via pipe (Extensions.loadUnpacked).
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawn, execSync } = require('child_process');
const { Hub } = require('../src/hub');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const ok = (n, c) => { console.log((c ? 'OK   ' : 'FAIL ') + n); if (!c) failed++; };
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const NUL = String.fromCharCode(0);

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-chr-'));
  const hub = new Hub(path.join(tmp, 'hub')); const port = await hub.start();
  const extDir = path.join(__dirname, '..', 'integrations', 'chrome');
  const child = spawn(CHROME, ['--headless=new', '--disable-gpu', `--user-data-dir=${path.join(tmp, 'profile')}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', `http://127.0.0.1:${port}/health`], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  child.stdio[3].write(JSON.stringify({ id: 1, method: 'Extensions.loadUnpacked', params: { path: extDir } }) + NUL);
  let pipeOut = ''; child.stdio[4].on('data', (d) => { pipeOut += d; });
  const connected = await new Promise((res) => { const t = setTimeout(() => res(false), 40000); hub.once('client', (c) => { clearTimeout(t); res(c.connected); }); });
  if (!connected) console.log('risposta di Chrome:', pipeOut.split(NUL).join('\n').slice(0, 600));
  try {
    ok('Chrome collegato all\'isola (pairing automatico con il token)', connected && hub.connected('chrome'));
    if (connected) {
      ok('pairing: senza l\'origine dell\'estensione il token non viene dato', (await fetch(`http://127.0.0.1:${port}/pair`)).status === 403);
      const pong = await hub.command('chrome', 'ping'); ok('ping', pong.pong === true);
      const t1 = await hub.command('chrome', 'newTab', { url: `http://127.0.0.1:${port}/health` }); ok('comando: nuova scheda', !!t1.id);
      await sleep(1200);
      const tabs = await hub.command('chrome', 'listTabs'); ok('comando: elenco schede', tabs.length >= 2);
      const sw = await hub.command('chrome', 'switchTab', { query: '127.0.0.1' }); ok('comando: passa alla scheda per testo', typeof sw.title === 'string');
      const pi = await hub.command('chrome', 'pageInfo'); ok('comando: lettura della pagina', /NotchIsland|ok/i.test(pi.text || ''));
      const mt = await hub.command('chrome', 'muteTabs', { mute: true, all: false }); ok('comando: silenzia scheda', mt.count === 1);
      const pm = await hub.command('chrome', 'pauseMedia'); ok('comando: pausa media (nessun video: 0)', pm.affected === 0);
      const rl = await hub.command('chrome', 'reload'); ok('comando: ricarica', 'reloaded' in rl);
      await sleep(800); ok('stato: numero di schede aggiornato', (hub.info('chrome') || {}).tabCount >= 2);
      const op = await hub.command('chrome', 'openUrl', { url: 'javascript:alert(1)' }).then(() => false, () => true); ok('indirizzo non http rifiutato', op);
      const cl = await hub.command('chrome', 'closeTab', {}); ok('comando: chiudi scheda', 'closed' in cl);
    }
  } catch (e) { console.log('ERRORE', e.message); failed++; }
  finally {
    try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { timeout: 30000 }); } catch { /* già chiuso */ }
    hub.stop();
  }
  console.log(failed === 0 ? 'CHROME: TUTTO OK' : `CHROME: ${failed} PROVE FALLITE`); process.exit(failed ? 1 : 0);
})();
