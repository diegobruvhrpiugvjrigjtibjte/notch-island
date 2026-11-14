// Il sito su un telefono simulato: nessuno scorrimento orizzontale, screenshot di ogni sezione. node test/site-mobile.js <url> <cartella>
const { spawn, execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path'); const { connect } = require('./cdp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const url = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-mob-'));
  const p = spawn(process.env.CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9445', '--user-data-dir=' + path.join(tmp, 'p'), '--no-first-run', url], { stdio: 'ignore' });
  const c = await connect(9445, new URL(url).host); const E = c.eval; const W = +(process.argv[4] || 390), H = 844;
  await c.call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true, screenWidth: W, screenHeight: H });
  await c.call('Emulation.setTouchEmulationEnabled', { enabled: true }); await c.call('Page.reload'); await sleep(5000);
  const info = async (n) => console.log(n, await E('JSON.stringify({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, over: [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > innerWidth + 2 && getComputedStyle(e).position !== "fixed" && !e.closest("iframe,.marquee,.stage,#aurora")).slice(0,5).map(e => e.tagName + "." + e.className + ":" + Math.round(e.getBoundingClientRect().right))})'));
  await info('top'); await sleep(500); await c.shot(path.join(out, 'm01-hero.png'));
  for (const [sel, n] of [['#demo', 'm02-demo'], ['#face', 'm03-face'], ['#talk', 'm04-talk'], ['#claude', 'm05-claude'], ['#widgets', 'm06-widgets'], ['#privacy', 'm07-privacy'], ['#install', 'm08-install'], ['#links', 'm09-links'], ['#faq', 'm10-faq']]) { await E(`document.querySelector('${sel}').scrollIntoView({block:'start'})`); await sleep(1500); await c.shot(path.join(out, n + '.png')); await info(n); }
  c.close(); p.kill(); try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`); } catch {} process.exit(0);
})();
