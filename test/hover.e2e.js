// Prova con il cursore VERO di Windows: la pillola deve aprirsi al passaggio e chiudersi quando il mouse esce, anche con Claude al lavoro.
const { spawn, execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path'); const { connect } = require('./cdp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const ok = (n, c, x) => { console.log((c ? 'OK   ' : 'FAIL ') + n + (!c && x !== undefined ? '  -> ' + JSON.stringify(x) : '')); if (!c) failed++; };
const mouse = (x, y) => execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.Cursor]::Position = New-Object Drawing.Point ${x}, ${y}"`);
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-hover-')); const ud = path.join(tmp, 'ud'); const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const p = spawn(require('electron'), ['.', '--remote-debugging-port=9333', '--user-data-dir=' + ud], { cwd: path.join(__dirname, '..'), env, stdio: 'ignore' });
  const c = await connect(9333); await sleep(3500); const E = c.eval;
  await E('window.nApi.send("set",{assistant:{tts:false}})');
  const hubj = JSON.parse(fs.readFileSync(path.join(ud, 'hub.json'), 'utf8')); const hook = (o) => fetch(`http://127.0.0.1:${hubj.port}/claude/hook?token=${hubj.token}`, { method: 'POST', body: JSON.stringify({ session_id: 'h1', cwd: '/x/progetto', ...o }) });
  const display = JSON.parse(execSync('powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $b=[Windows.Forms.Screen]::PrimaryScreen.Bounds; @{x=$b.X;y=$b.Y;width=$b.Width;height=$b.Height}|ConvertTo-Json -Compress"').toString());
  const px = Math.round(display.x + display.width / 2), py = display.y + 28; const awayY = display.y + Math.min(700, display.height - 80); const open = () => E('__notch.open');
  const enter = async () => {
    // Forza una vera transizione fuori/dentro. Evita falsi negativi quando il
    // test parte con il cursore gia' sopra la finestra o il renderer e' appena nato.
    mouse(px, awayY); await sleep(750);
    mouse(px, py); return (async () => { const t = Date.now(); while (Date.now() - t < 3500) { if (await open()) return true; await sleep(100); } return false; })();
  };
  try {
    ok('senza Claude: si apre al passaggio', await enter());
    mouse(px, awayY); await sleep(2200); ok('senza Claude: si chiude quando il mouse esce', !(await open()));
    for (const t of ['assistant', 'claude']) { await enter(); await E(`__notch.tab("${t}")`); await sleep(600); mouse(px, awayY); await sleep(2600); ok('scheda ' + t + ': si chiude quando il mouse esce', !(await open())); }
    // Claude al lavoro
    await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'fai qualcosa' }); await hook({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'a.js' } }); await sleep(1500);
    ok('Claude al lavoro: la pillola lo mostra', /progetto/.test(await E('__notch.compactText')));
    ok('Claude al lavoro: si apre al passaggio (senza clic)', await enter());
    mouse(px, awayY); await sleep(2200); ok('Claude al lavoro: si chiude quando il mouse esce', !(await open()));
    // mentre lavora arrivano eventi di continuo
    for (let i = 0; i < 6; i++) { await hook({ hook_event_name: 'PreToolUse', tool_name: ['Read', 'Bash', 'Edit'][i % 3], tool_input: { command: 'ls' + i } }); await sleep(300); }
    ok('Claude che manda eventi: si apre al passaggio', await enter());
    for (let i = 0; i < 6; i++) { await hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit' }); await sleep(250); }
    ok('resta aperta con il mouse sopra mentre arrivano eventi', await open());
    mouse(px, awayY); await sleep(2200); ok('Claude che manda eventi: si chiude quando il mouse esce', !(await open()));
    // Claude ti aspetta
    await hook({ hook_event_name: 'Notification', message: 'needs permission' }); await sleep(1200);
    ok('Claude ti aspetta: si apre al passaggio', await enter()); mouse(px, awayY); await sleep(2200); ok('Claude ti aspetta: si chiude', !(await open()));
    // clic fuori con campo di testo attivo
    await enter(); await E('__notch.tab("assistant")'); await sleep(600); ok('campo di testo attivo dopo l\'apertura', await E('document.activeElement && document.activeElement.tagName === "INPUT"'));
    mouse(px, awayY); await sleep(3000); ok('con il campo di testo attivo si chiude comunque quando il mouse esce', !(await open()));
  } catch (e) { console.log('ERRORE', e.stack); failed++; }
  c.close(); p.kill(); try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`); } catch { /* gia' chiuso */ }
  console.log(failed === 0 ? 'HOVER: TUTTO OK' : `HOVER: ${failed} PROVE FALLITE`); process.exit(failed ? 1 : 0);
})();
