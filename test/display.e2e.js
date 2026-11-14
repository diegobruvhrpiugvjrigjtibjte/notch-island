// Scelta dello schermo: la finestra dell'isola deve spostarsi sul monitor scelto e tornare sul principale.
const { spawn, execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path'); const { connect } = require('./cdp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const ok = (n, c, x) => { console.log((c ? 'OK   ' : 'FAIL ') + n + (!c && x !== undefined ? '  -> ' + JSON.stringify(x) : '')); if (!c) failed++; };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-disp-')); const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const p = spawn(require('electron'), ['.', '--remote-debugging-port=9333', '--user-data-dir=' + path.join(tmp, 'ud')], { cwd: path.join(__dirname, '..'), env, stdio: 'ignore' });
  const c = await connect(9333); await sleep(3500); const E = c.eval;
  try {
    const d = JSON.parse(await E('window.nApi.invoke("displays").then(JSON.stringify)')); ok('elenco schermi letto (' + d.list.length + ')', d.list.length >= 1, d);
    const x0 = await E('window.screenX'); ok('di default sullo schermo principale', x0 >= 0 && x0 < 1920, x0);
    if (d.list.length > 1) {
      const other = d.list.find((x) => !x.primary);
      await E('__notch.setOpen(true)'); await sleep(600); await E('__notch.tab("set")'); await sleep(900);
      ok('impostazioni: scelta dello schermo visibile', (await E('document.querySelector("#p-set").textContent')).includes('Schermo'));
      await E(`document.querySelector('[data-seg=display] [data-v="${other.id}"]').click()`); await sleep(1500);
      const x1 = await E('window.screenX'); ok('la pillola si e\' spostata sull\'altro schermo (x=' + x1 + ')', x1 < 0, x1);
      await E(`document.querySelector('[data-seg=display] [data-v="primary"]').click()`); await sleep(1500);
      const x2 = await E('window.screenX'); ok('torna sullo schermo principale', x2 >= 0, x2);
    } else console.log('SKIP un solo schermo');
  } catch (e) { console.log('ERRORE', e.stack); failed++; }
  c.close(); p.kill(); try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`); } catch {}
  console.log(failed === 0 ? 'SCHERMO: TUTTO OK' : `SCHERMO: ${failed} PROVE FALLITE`); process.exit(failed ? 1 : 0);
})();
