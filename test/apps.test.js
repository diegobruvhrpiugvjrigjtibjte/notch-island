// Frasi naturali -> applicazione giusta, usando l'elenco REALE delle app installate su questo PC (nessuna app viene aperta).
const { Agent } = require('../src/agents'); const { parse } = require('../src/brain'); const { findApp } = require('../src/executor'); const { norm } = require('../src/brain');
let failed = 0; const ok = (n, c, x) => { console.log((c ? 'OK   ' : 'FAIL ') + n + (!c && x !== undefined ? '  -> ' + JSON.stringify(x) : '')); if (!c) failed++; };
const CASES = [
  ['apri discord', /^Discord$/], ['puoi aprirmi discord per favore', /^Discord$/], ['apri l\'app di Spotify', /^Spotify$/], ['apri whatsapp', /^WhatsApp$/], ['aprimi chrome', /^Google Chrome$/], ['apri google chrome sul pc', /^Google Chrome$/],
  ['avvia visual studio code', /^Visual Studio Code$/], ['apri vs code', /^Visual Studio Code$/], ['apri opera', /Opera GX/], ['apri edge', /^Microsoft Edge$/], ['apri word', /^Word$/], ['apri excel', /^Excel$/], ['apri powerpoint', /PowerPoint/],
  ['apri disord', /^Discord$/], ['apri steem', /^Steam$/], ['apri davinci', /^DaVinci Resolve$/], ['apri blender', /^Blender/], ['apri canva', /^Canva$/], ['apri cura', /Cura/], ['apri il programma obs', null], ['open the app Discord please', /^Discord$/], ['can you open Steam', /^Steam$/],
  ['apri teams', /Teams/], ['apri netflix', /^Netflix$/], ['apri impostazioni', 'direct'], ['apri la calcolatrice', 'direct'], ['apri task manager', 'direct'],
];
(async () => {
  const info = new Agent('info.ps1'); const apps = (await info.send('apps', '', 60000)).apps; ok('elenco app letto (' + apps.length + ')', apps.length > 20);
  for (const [phrase, want] of CASES) {
    const r = parse(phrase, 'it'); if (!r || r.intent !== 'app.open') { ok(phrase + ' -> app.open', false, r); continue; }
    const name = norm(r.args.name); const direct = ['calcolatrice', 'calculator', 'task manager', 'impostazioni', 'settings', 'terminale', 'paint', 'blocco note'].includes(name);
    if (want === 'direct') { ok(phrase + ' -> comando diretto di Windows', direct, name); continue; }
    const app = findApp(apps, name);
    if (want === null) { ok(phrase + ' -> non installata: l\'agente la cercherà (nessun falso positivo)', !app, app && app.name); continue; }
    ok(phrase + ' -> ' + (app ? app.name : 'NON TROVATA'), !!app && want.test(app.name), app && app.name);
  }
  info.stop(); setTimeout(() => { console.log(failed === 0 ? 'APP: TUTTO OK' : `APP: ${failed} PROVE FALLITE`); process.exit(failed ? 1 : 0); }, 600);
})();
