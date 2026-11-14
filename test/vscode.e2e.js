// Prova reale con VS Code (profilo e estensioni isolati in una cartella temporanea: il tuo VS Code non viene toccato).
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawn, spawnSync, execSync } = require('child_process');
const { Hub } = require('../src/hub');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const ok = (n, c) => { console.log((c ? 'OK   ' : 'FAIL ') + n); if (!c) failed++; };
const CODE = process.env.CODE_CMD || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-vsc-'));
  const ud = path.join(tmp, 'user'), ext = path.join(tmp, 'ext'), proj = path.join(tmp, 'progetto'); fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 'ciao.js'), 'const x = 1\nconsole.log(x)\n'); fs.writeFileSync(path.join(proj, 'errore.ts'), 'const a: number = "stringa";\n');
  const hub = new Hub(path.join(tmp, 'hub')); await hub.start();
  const vsix = path.join(__dirname, '..', 'integrations', 'vscode', 'notch-island-1.0.0.vsix');
  const inst = spawnSync(`"${CODE}"`, ['--user-data-dir', `"${ud}"`, '--extensions-dir', `"${ext}"`, '--install-extension', `"${vsix}"`, '--force'], { shell: true, encoding: 'utf8', timeout: 120000 });
  ok('estensione installata in VS Code', /successfully installed/i.test(inst.stdout + inst.stderr));
  const env = { ...process.env, NOTCH_HUB_FILE: path.join(tmp, 'hub', 'hub.json') }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(`"${CODE}"`, ['--user-data-dir', `"${ud}"`, '--extensions-dir', `"${ext}"`, '--new-window', '--disable-workspace-trust', '--disable-gpu', `"${proj}"`], { shell: true, env, stdio: 'ignore', detached: false });
  const connected = await new Promise((res) => { const t = setTimeout(() => res(false), 90000); hub.once('client', (c) => { clearTimeout(t); res(c.connected); }); });
  try {
    ok('VS Code collegato all\'isola', connected && hub.connected('vscode'));
    if (connected) {
      await sleep(2500);
      const pong = await hub.command('vscode', 'ping');
      ok('ping: versione di VS Code ricevuta', !!pong.version);
      const info = hub.info('vscode');
      ok('stato: nome del progetto', info.workspace === 'progetto' || info.name === 'VS Code');
      const opened = await hub.command('vscode', 'openFile', { path: path.join(proj, 'ciao.js'), line: 2 });
      ok('comando: apri file', opened.opened === 'ciao.js');
      await sleep(1500);
      ok('stato aggiornato: file attivo', hub.info('vscode').file === 'ciao.js' && hub.info('vscode').language === 'javascript');
      const ex = await hub.command('vscode', 'exec', { command: 'workbench.action.files.saveAll' });
      ok('comando: salva tutto', ex.done === 'workbench.action.files.saveAll');
      const nt = await hub.command('vscode', 'exec', { command: 'workbench.action.terminal.new' });
      await sleep(1800);
      ok('comando: nuovo terminale (stato terminali)', nt.done && hub.info('vscode').terminals >= 1);
      const denied = await hub.command('vscode', 'exec', { command: 'process.exit' }).then(() => false, () => true);
      ok('comando non consentito respinto', denied);
      const msg = await hub.command('vscode', 'message', { text: 'Prova NotchIsland' });
      ok('comando: messaggio in VS Code', msg.shown === true);
    }
  } catch (e) { console.log('ERRORE', e.message); failed++; }
  finally {
    // chiude solo le finestre di VS Code avviate con il nostro profilo temporaneo
    try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { timeout: 30000 }); } catch { /* già chiuso */ }
    hub.stop();
  }
  console.log(failed === 0 ? 'VSCODE: TUTTO OK' : `VSCODE: ${failed} PROVE FALLITE`); process.exit(failed ? 1 : 0);
})();
