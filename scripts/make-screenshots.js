// Genera gli screenshot della documentazione con dati finti (brano demo, sessioni di Claude inventate, profilo vuoto).
// Uso: node scripts/make-screenshots.js docs/screenshots
const { spawn, execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
const { connect } = require('../test/cdp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = path.resolve(process.argv[2] || 'docs/screenshots'); fs.mkdirSync(out, { recursive: true });
const BG = 'radial-gradient(1200px 500px at 20% 0%, #2a3a6b 0%, transparent 60%), radial-gradient(900px 500px at 90% 100%, #5b2a6b 0%, transparent 60%), #0e1424';

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-docs-')); const ud = path.join(tmp, 'ud'); fs.mkdirSync(ud);
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ settings: { lang: 'en', assistant: { tts: false, whisperLang: 'en' }, widgets: { order: ['clock', 'weather', 'timer', 'system', 'todo', 'notes', 'calendar', 'stopwatch', 'calc', 'reminders', 'links', 'world', 'convert', 'breathe', 'dice'], off: ['breathe', 'dice', 'world'] } }, data: { todos: [{ id: 1, s: 'Review the pull request', d: false }, { id: 2, s: 'Book the train tickets', d: true }, { id: 3, s: 'Reply to the design team', d: false }], notes: [{ id: 1, t: 'Idea: add a pomodoro stats page', at: 1 }, { id: 2, t: 'Call the dentist on Monday', at: 2 }], reminders: [], links: [{ name: 'GitHub', url: 'https://github.com' }, { name: 'Docs', url: 'https://developer.mozilla.org' }, { name: 'Maps', url: 'https://maps.google.com' }] } }));
  const env = { ...process.env, NOTCH_DEMO: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const p = spawn(require('electron'), ['.', '--remote-debugging-port=9333', '--user-data-dir=' + ud], { cwd: path.join(__dirname, '..'), env, stdio: 'ignore' });
  const c = await connect(9333); await sleep(3500); const E = c.eval;
  await c.call('Emulation.setDeviceMetricsOverride', { width: 820, height: 470, deviceScaleFactor: 2, mobile: false });
  await E(`document.documentElement.style.background = ${JSON.stringify(BG)}; document.body.style.background = 'transparent'`);
  const shot = async (name, clip) => { await sleep(900); await c.shot(path.join(out, name + '.png'), clip || { x: 0, y: 0, width: 820, height: 470 }); };
  const pill = async (name) => { await sleep(1400); const r = JSON.parse(await E('JSON.stringify(document.querySelector("#island").getBoundingClientRect())')); await c.shot(path.join(out, name + '.png'), { x: Math.max(0, r.x - 30), y: 0, width: r.width + 60, height: r.height + 34 }); };
  const hubj = JSON.parse(fs.readFileSync(path.join(ud, 'hub.json'), 'utf8')); const hook = (o) => fetch(`http://127.0.0.1:${hubj.port}/claude/hook?token=${hubj.token}`, { method: 'POST', body: JSON.stringify({ session_id: 's1', cwd: '/work/web-app', ...o }) });
  const say = async (t) => { const n = await E('document.querySelectorAll("#p-assistant .msg.bot:not(.live)").length'); await E(`(()=>{const i=document.querySelector("#p-assistant [data-text]");i.value=${JSON.stringify(t)};document.querySelector("#p-assistant [data-form]").requestSubmit();})()`); for (let i = 0; i < 40; i++) { await sleep(300); if ((await E('document.querySelectorAll("#p-assistant .msg.bot:not(.live)").length')) > n) break; } };

  // pillola chiusa: musica, Claude, timer, orologio
  await pill('pill-music');
  await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'Add dark mode' }); await hook({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'src/theme.css' } }); await pill('pill-claude-working');
  await hook({ hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' }); await pill('pill-claude-waiting');
  await hook({ hook_event_name: 'Stop' }); await pill('pill-claude-done'); await sleep(500);
  await E('window.nApi.send("set",{compact:"clock"})'); await E('__notch.timer.start(1500,"")'); await pill('pill-timer'); await E('__notch.timer.stop()'); await pill('pill-clock'); await E('window.nApi.send("set",{compact:"auto"})');
  // sessioni per la scheda Claude
  await hook({ hook_event_name: 'SessionEnd' });
  const h2 = (sid, cwd, o) => fetch(`http://127.0.0.1:${hubj.port}/claude/hook?token=${hubj.token}`, { method: 'POST', body: JSON.stringify({ session_id: sid, cwd, ...o }) });
  await h2('a', '/work/web-app', { hook_event_name: 'UserPromptSubmit', prompt: 'Add dark mode to the settings page' }); await h2('a', '/work/web-app', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'src/theme.css' } });
  await h2('b', '/work/api-server', { hook_event_name: 'UserPromptSubmit', prompt: 'Fix the failing login test' }); await h2('b', '/work/api-server', { hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' });

  await E('__notch.setOpen(true)'); await sleep(1000);
  await E('__notch.tab("media")'); await shot('music');
  await E('__notch.tab("assistant")'); await sleep(500);
  for (const t of ['what time is it', 'what is 15 times 7', 'convert 10 km to miles', 'set a timer for 10 minutes']) await say(t);
  await shot('assistant');
  await E('__notch.tab("claude")'); await sleep(800); await shot('claude');
  await E('__notch.tab("widgets")'); await sleep(2500); await shot('widgets');
  await E('document.querySelector("#wgrid").scrollTop = 330'); await shot('widgets-2');
  await E('__notch.tab("ctrl")'); await shot('controls');
  await E('__notch.tab("set")'); await sleep(600); await shot('settings');
  await E('window.nApi.send("set",{theme:"light",accent:"#ff7a90"})'); await sleep(700); await E('__notch.tab("widgets")'); await E('document.querySelector("#wgrid").scrollTop = 0'); await shot('theme-light');
  await E('window.nApi.send("set",{theme:"midnight",accent:"#c39bff"})'); await sleep(700); await E('__notch.tab("music")'.replace('music', 'media')); await shot('theme-midnight');
  await E('window.nApi.send("set",{theme:"black",accent:"#8ab4ff"})'); await sleep(500);
  // facce
  await h2('a', '/work/web-app', { hook_event_name: 'SessionEnd' }); await h2('b', '/work/api-server', { hook_event_name: 'SessionEnd' });
  await E('__notch.setOpen(false)'); await sleep(1500); fs.mkdirSync(path.join(out, '_faces'), { recursive: true });
  for (const m of ['idle', 'happy', 'sleepy', 'thinking', 'alert', 'listening', 'talking', 'surprised', 'love']) { await E(`__notch.flash("${m}", 60000)`); await sleep(450); const r = JSON.parse(await E('JSON.stringify(document.querySelector("#face-c").getBoundingClientRect())')); await c.shot(path.join(out, '_faces', m + '.png'), { x: r.x - 5, y: r.y - 4, width: r.width + 14, height: r.height + 8 }); }
  c.close(); p.kill(); try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`); } catch { /* gia' chiuso */ }
  console.log('screenshot in', out); process.exit(0);
})();
