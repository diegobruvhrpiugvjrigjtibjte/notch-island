const { spawn, execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path'); const { connect } = require('./cdp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-desk-')); const p = spawn(process.env.CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9446', '--user-data-dir=' + path.join(tmp, 'p'), '--no-first-run', 'https://notch-island.pages.dev/'], { stdio: 'ignore' });
  const c = await connect(9446, 'notch-island.pages.dev'); const E = c.eval;
  await c.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await c.call('Page.reload'); await sleep(5000);
  await E('window.scrollTo(0,0)'); await sleep(800); await c.shot(path.join(out, 'd0-top.png'));
  const top = await E('document.querySelector("#deskwrap").getBoundingClientRect().top + scrollY'); const h = await E('document.querySelector("#deskwrap").offsetHeight');
  for (const [i, f] of [[1, .05], [2, .2], [3, .42], [4, .62], [5, .83]]) { await E(`window.scrollTo(0, ${top} - 76 + ${f} * (${h} - innerHeight + 76))`); await sleep(2600); await c.shot(path.join(out, 'd' + i + '.png')); }
  console.log('errori:', c.logs.filter((l) => /^(error|EXC)/.test(l)).join('\n') || 'nessuno');
  c.close(); p.kill(); try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`); } catch {} process.exit(0);
})();
