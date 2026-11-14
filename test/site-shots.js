// Screenshot del sito con Chrome vero: node test/site-shots.js <url> <cartella>
const { spawn, execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path'); const { connect } = require('./cdp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const url = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-site-'));
  const p = spawn(process.env.CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9444', '--user-data-dir=' + path.join(tmp, 'p'), '--window-size=1440,900', '--no-first-run', url], { stdio: 'ignore' });
  const c = await connect(9444, new URL(url).host); const E = c.eval;
  await c.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await c.call('Page.reload'); await sleep(5000);
  const shot = async (n) => { await sleep(1200); await c.shot(path.join(out, n + '.png')); };
  await shot('01-hero');
  const go = async (sel, n, extra) => { await E(`document.querySelector('${sel}').scrollIntoView({block:'start'})`); await sleep(1800); if (extra) await extra(); await shot(n); };
  await go('#demo', '02-demo'); await go('#face', '03-face'); await go('#talk', '04-talk'); await go('#claude', '05-claude'); await go('#widgets', '06-widgets'); await go('#install', '07-install'); await go('#links', '08-links');
  console.log('errori:', c.logs.filter((l) => /^(error|EXC)/.test(l)).slice(0, 8).join('\n') || 'nessuno');
  console.log(await E('JSON.stringify({d1: !!document.querySelector("#demo1").contentWindow.__notch, d2: !!document.querySelector("#demo2").contentWindow.__notch})'));
  c.close(); p.kill(); try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`); } catch {} process.exit(0);
})();
