// Prova reale degli agenti PowerShell (volume reale: viene ripristinato alla fine).
const { Agent } = require('../src/agents');
let failed = 0; const ok = (n, c, x) => { console.log((c ? 'OK   ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
(async () => {
  const ctl = new Agent('control.ps1'), info = new Agent('info.ps1');
  const v0 = await ctl.send('vol'); ok('volume letto', v0.v >= 0 && v0.v <= 100, JSON.stringify(v0));
  const target = v0.v >= 50 ? v0.v - 7 : v0.v + 7;
  const r = await ctl.send('volset', String(target)); ok('volume impostato e riletto', r.v === target, JSON.stringify(r));
  await ctl.send('volset', String(v0.v)); const back = await ctl.send('vol'); ok('volume ripristinato', back.v === v0.v);
  const mic = await ctl.send('mic'); ok('microfono: stato letto', typeof mic.m === 'boolean', JSON.stringify(mic));
  const br = await ctl.send('br'); ok('luminosita: risposta (valore o -1 se non supportata)', typeof br.v === 'number', JSON.stringify(br));
  const wifi = await ctl.send('radio', 'WiFi'); ok('radio WiFi: risposta', 'ok' in wifi, JSON.stringify(wifi));
  const now = await info.send('now', '', 20000); ok('brano in riproduzione: risposta (anche vuota)', !now.error, JSON.stringify(now).slice(0, 160));
  const nx = await info.send('media', 'next', 20000); ok('comando "next" alla sessione multimediale: risposta', 'ok' in nx, JSON.stringify(nx));
  const sk = await info.send('seek', '30', 20000); ok('comando "seek": risposta', 'ok' in sk, JSON.stringify(sk));
  const apps = await info.send('apps', '', 60000); ok('app installate trovate', apps.apps && apps.apps.length > 5, (apps.apps || []).length + ' app');
  ctl.stop(); info.stop(); setTimeout(() => { console.log(failed === 0 ? 'AGENTI: TUTTO OK' : `AGENTI: ${failed} PROVE FALLITE`); process.exit(failed ? 1 : 0); }, 800);
})();
