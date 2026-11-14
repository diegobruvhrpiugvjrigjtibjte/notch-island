// Raccoglie i testi italiani non ancora tradotti visitando tutta l'interfaccia in inglese: node test/i18n-collect.js
const { spawn, execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path'); const { connect } = require('./cdp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-i18n-')); const ud = path.join(tmp, 'ud'); fs.mkdirSync(ud);
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ settings: { lang: process.argv[2] || 'en', widgets: { order: ['clock', 'weather', 'timer', 'system', 'todo', 'notes', 'calendar', 'stopwatch', 'calc', 'reminders', 'links', 'world', 'convert', 'breathe', 'dice'], off: [] }, assistant: { tts: false } } }));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const p = spawn(require('electron'), ['.', '--remote-debugging-port=9333', '--user-data-dir=' + ud], { cwd: path.join(__dirname, '..'), env, stdio: 'ignore' });
  const c = await connect(9333); await sleep(3500); const E = c.eval;
  await E('__notch.setOpen(true)'); await sleep(800);
  const hubj = JSON.parse(fs.readFileSync(path.join(ud, 'hub.json'), 'utf8')); const hook = (o) => fetch(`http://127.0.0.1:${hubj.port}/claude/hook?token=${hubj.token}`, { method: 'POST', body: JSON.stringify({ session_id: 's1', cwd: '/x/demo', ...o }) });
  for (const t of ['media', 'assistant', 'claude', 'widgets', 'clip', 'shelf', 'ctrl', 'apps', 'web', 'set']) { await E(`__notch.tab("${t}")`); await sleep(1500); if (t === 'widgets') { await E('document.querySelector("#w-edit").click()'); await sleep(500); await E('document.querySelector("#w-edit").click()'); await sleep(800); } }
  await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'x' }); await hook({ hook_event_name: 'Notification', message: 'needs permission' }); await sleep(800); await E('__notch.tab("claude")'); await sleep(800);
  await E('__notch.tab("assistant")'); await sleep(300); await E('document.querySelector("#p-assistant [data-mic]").click()'); await sleep(1500);
  for (const q of ['aiuto', 'che ore sono', 'stato di claude', 'salva tutto', 'schede aperte', 'timer 1 minuto']) { await E(`(()=>{const i=document.querySelector("#p-assistant [data-text]");i.value=${JSON.stringify(q)};document.querySelector("#p-assistant [data-form]").requestSubmit();})()`); await sleep(1200); }
  await E('document.querySelector("#p-assistant [data-newchat]").click()'); await sleep(300);
  await hook({ hook_event_name: 'Stop' }); await E('__notch.setOpen(false)'); await sleep(1500);
  await E('__notch.timer.start(65,"")'); await sleep(1200); await E('__notch.timer.stop()');
  await E('__notch.setOpen(true)'); await sleep(900); await E('__notch.tab("set")'); await sleep(900); await E('__notch.tab("widgets")'); await sleep(900);
  const m = await E('JSON.stringify(__notch.missing())'); const dictFile = path.join(__dirname, '..', 'src', 'i18n', (process.argv[2] || 'en') + '.js'); const dict = (await import(require('url').pathToFileURL(dictFile).href)).default; const values = new Set(Object.values(dict.exact)); const patOut = dict.patterns.map(([r]) => new RegExp(r.replace(/\\d\+/g, '\d+')));
  console.log(JSON.stringify(JSON.parse(m).filter((x) => !values.has(x)), null, 1)); console.error('lang', await E('__notch.lang'));
  c.close(); p.kill(); try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`); } catch {}
  process.exit(0);
})();
