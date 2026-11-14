// Prova dell'app intera (Electron vero, profilo temporaneo) pilotata via CDP: interfaccia, assistente, widget, Claude Code, voce con microfono simulato.
const { spawn, execSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
const { connect } = require('./cdp'); const claude = require('../src/claude');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const ok = (n, c, x) => { console.log((c ? 'OK   ' : 'FAIL ') + n + (!c && x !== undefined ? '  -> ' + JSON.stringify(x) : '')); if (!c) failed++; };
const SHOTS = process.env.SHOTS || '';
const NODE = process.execPath;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-e2e-')); const env = { ...process.env, NOTCH_WHISPER_BIN: NODE, NOTCH_WHISPER_SCRIPT: path.join(__dirname, 'fixtures', 'whisper-stub.js'), NOTCH_WHISPER_MODEL: path.join(tmp, 'dummy.bin') }; delete env.ELECTRON_RUN_AS_NODE;
  fs.writeFileSync(env.NOTCH_WHISPER_MODEL, 'x');
  const ud = path.join(tmp, 'userdata'); const wavFile = path.join(__dirname, 'fixtures', 'che-ore-sono.wav');
  const p = spawn(require('electron'), ['.', '--remote-debugging-port=9333', '--user-data-dir=' + ud, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + wavFile], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let mainLog = ''; p.stdout.on('data', (d) => { mainLog += d; }); p.stderr.on('data', (d) => { mainLog += d; });
  const c = await connect(9333);
  const E = (x) => c.eval(x); const wait = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await E(expr)) return true; } catch { /* non ancora pronto */ } await sleep(150); } return false; };
  const shot = async (name, clip) => { if (SHOTS) await c.shot(path.join(SHOTS, name + '.png'), clip || { x: 10, y: 0, width: 800, height: 450 }); };
  try {
    ok('l\'app parte e carica l\'interfaccia', await wait('typeof __notch !== "undefined"', 20000));
    await sleep(2500); await E('window.nApi.send("set", {assistant:{tts:false}})'); await sleep(500); // niente voce ad alta voce durante i test
    ok('voci di sintesi vocale disponibili (italiano)', await wait('speechSynthesis.getVoices().some(v => v.lang.toLowerCase().startsWith("it"))', 8000));
    ok('nessun vetro: tema pieno nero di default', (await E('document.body.dataset.theme')) === 'black' && !(await E('!!document.querySelector("canvas")')));
    ok('faccina nella pillola', await E('!!document.querySelector("#face-c svg .eye")'));
    ok('10 schede', (await E('document.querySelectorAll("#tabs button").length')) === 10);
    const w0 = await E('parseFloat(document.querySelector("#island").style.width)'); ok('pillola con larghezza adatta al contenuto', w0 > 80 && w0 < 361, w0);
    ok('testo della pillola', (await E('__notch.compactText')).length > 0);
    await shot('01-chiusa', { x: 150, y: 0, width: 520, height: 70 });

    // ---- faccina: segue il mouse
    await E('__notch.cursor(5, 5)'); await sleep(200); const lxL = parseFloat(await E('document.querySelector("#face-c svg").style.getPropertyValue("--lx")'));
    await E('__notch.cursor(815, 5)'); await sleep(200); const lxR = parseFloat(await E('document.querySelector("#face-c svg").style.getPropertyValue("--lx")'));
    ok('gli occhi seguono il cursore (sinistra/destra)', lxL < -0.5 && lxR > 0.5, [lxL, lxR]);
    for (const m of ['happy', 'sleepy', 'thinking', 'alert', 'listening', 'talking', 'surprised', 'love']) { await E(`__notch.flash("${m}", 60000)`); await sleep(350); if (SHOTS) await c.shot(path.join(SHOTS, 'faccia-' + m + '.png'), { x: 390, y: 8, width: 44, height: 44 }); ok('umore "' + m + '" applicato', (await E('document.querySelector("#face-c").dataset.mood')) === m); }
    await E('__notch.flash("idle", 10)'); await sleep(200);
    await E('document.querySelector("#face-c").click()'); await sleep(150); ok('clic sulla faccina: sorpresa', (await E('document.querySelector("#face-c").dataset.mood')) === 'surprised');

    // ---- apertura e tutte le schede
    await E('__notch.setOpen(true)'); await sleep(900); ok('si apre', await E('__notch.open'));
    for (const t of ['media', 'assistant', 'claude', 'widgets', 'clip', 'shelf', 'ctrl', 'apps', 'web', 'set']) { await E(`__notch.tab("${t}")`); await sleep(700); ok('scheda ' + t + ' visibile', await E(`document.querySelector("#p-${t}").classList.contains("on")`)); await shot('tab-' + t); }
    const errs = c.logs.filter((l) => /^(error|EXC)/.test(l) && !/Autofill|favicon/.test(l)); ok('nessun errore nella console dell\'interfaccia', errs.length === 0, errs.slice(0, 3));

    // ---- assistente (testo)
    await E('__notch.tab("assistant")'); await sleep(400);
    const say = async (text) => { const n = await E('document.querySelectorAll("#p-assistant .msg.bot:not(.live)").length'); await E(`(()=>{const i=document.querySelector("#p-assistant [data-text]");i.value=${JSON.stringify(text)};document.querySelector("#p-assistant [data-form]").requestSubmit();})()`); await wait(`document.querySelectorAll("#p-assistant .msg.bot:not(.live)").length > ${n}`, 150000); await sleep(150); return E('document.querySelector("#p-assistant .msg.bot:not(.live):last-child .bub").textContent'); };
    ok('calcolo: "quanto fa 12 per 12"', /144/.test(await say('quanto fa 12 per 12')));
    ok('conversione: "converti 10 km in miglia"', /6,2137/.test(await say('converti 10 km in miglia')));
    ok('ora: "che ore sono"', /Sono le \d\d:\d\d/.test(await say('che ore sono')));
    ok('data', /Oggi è/.test(await say('che giorno è')));
    ok('dado', /uscito [1-6]/.test(await say('tira un dado')));
    ok('moneta', /Testa|Croce/.test(await say('testa o croce')));
    ok('barzelletta', (await say('dimmi una barzelletta')).length > 20);
    ok('meteo reale (Roma)', /gradi/.test(await say('che tempo fa a Roma')), null);
    ok('stato del PC', /CPU al \d+%/.test(await say('come sta il pc')));
    ok('nota salvata', /Nota salvata/.test(await say('prendi nota: prova dell\'assistente')));
    ok('attività salvata', /Aggiunto alle attività/.test(await say('aggiungi attività: comprare il latte')));
    ok('promemoria', /ti ricordo/.test(await say('ricordami di bere acqua tra 30 minuti')));
    const dataNow = await E('window.nApi.invoke("boot").then(b => JSON.stringify({n: b.data.notes.map(x=>x.t), t: b.data.todos.map(x=>x.s), r: b.data.reminders.map(x=>x.text)}))'); const dn = JSON.parse(dataNow);
    ok('dati scritti dal assistente: nota con maiuscole/apostrofo originali', dn.n.includes('prova dell\'assistente'), dn);
    ok('dati: attività', dn.t.includes('comprare il latte'), dn); ok('dati: promemoria', dn.r.includes('bere acqua'), dn);
    ok('timer: "timer 1 minuto" parte', /Timer di 1 minuto/.test(await say('timer 1 minuto')) && await E('__notch.timer.running'));
    await E('document.querySelector("#face-c").dataset.mood'); await E('__notch.setOpen(false)'); await sleep(1200);
    ok('pillola chiusa mostra il conto alla rovescia', /^\d:\d\d$/.test(await E('__notch.compactText')), await E('__notch.compactText'));
    await shot('02-timer-pillola', { x: 150, y: 0, width: 520, height: 70 });
    await E('__notch.setOpen(true)'); await sleep(700); await E('__notch.tab("assistant")');
    ok('timer fermato a voce', /Timer fermato/.test(await say('ferma il timer')) && !(await E('__notch.timer.running')));
    const vol0 = JSON.parse(await E('window.nApi.invoke("ctl","vol").then(JSON.stringify)')).v;
    const target = vol0 > 50 ? vol0 - 11 : vol0 + 11; ok('volume a voce', new RegExp('' + target).test(await say('volume al ' + target)));
    const vol1 = JSON.parse(await E('window.nApi.invoke("ctl","vol").then(JSON.stringify)')).v; ok('volume realmente cambiato nel sistema', vol1 === target, [vol0, vol1]);
    await E(`window.nApi.invoke("ctl","volset","${vol0}")`);
    ok('cambio scheda a voce', /Ecco la musica/.test(await say('mostra la scheda musica')) && await wait('document.querySelector("#p-media").classList.contains("on")', 3000)); await E('__notch.tab("assistant")');
    ok('tema a voce: chiaro', /Tema cambiato/.test(await say('cambia tema in chiaro')) && await wait('document.body.dataset.theme === "light"', 3000)); await shot('03-tema-chiaro');
    await say('cambia tema in nero'); ok('tema a voce: nero', await wait('document.body.dataset.theme === "black"', 3000));
    ok('"aiuto" elenca le funzioni', /Posso/.test(await say('aiuto')));
    ok('VS Code non collegato: messaggio chiaro', /non è collegato/.test(await say('salva tutto'))); await E('__notch.tab("assistant")');
    ok('Chrome non collegato: messaggio chiaro', /non è collegato/.test(await say('schede aperte'))); await E('__notch.tab("assistant")');
    ok('stato Claude senza sessioni', /sessione|collegato/i.test(await say('stato di claude')));
    ok('app: "apri la calcolatrice"', /Apro calcolatrice/i.test(await say('apri la calcolatrice')));
    await sleep(1500); try { execSync('taskkill /IM CalculatorApp.exe /F', { stdio: 'ignore' }); } catch { /* gia' chiusa o app di Store */ } try { execSync('taskkill /IM calc.exe /F', { stdio: 'ignore' }); } catch { /* non aperta */ }
    ok('frase libera: Claude risponde (se disponibile)', await (async () => { const r = await say('quanto è alta la torre Eiffel? rispondi in una frase'); return /\d/.test(r); })());
    await shot('04-assistente');

    // ---- voce: microfono simulato con una frase vera pronunciata dalla voce italiana di Windows
    await E('__notch.tab("assistant")'); await sleep(300);
    const nb = await E('document.querySelectorAll("#p-assistant .msg.bot:not(.live)").length');
    await E('document.querySelector("#p-assistant [data-mic]").click()');
    ok('microfono: stato "Ti ascolto"', await wait('document.querySelector("#p-assistant [data-status]").textContent.includes("ascolto")', 8000)); ok('faccina in ascolto', (await E('document.querySelector("#face-c").dataset.mood')) === 'listening');
    await shot('05-ascolto');
    ok('voce -> testo -> risposta (stub di whisper)', await wait(`document.querySelectorAll("#p-assistant .msg.bot:not(.live)").length > ${nb}`, 40000));
    ok('trascrizione mostrata come messaggio tuo', /che ore sono/i.test(await E('[...document.querySelectorAll("#p-assistant .msg.me .bub")].pop().textContent')));
    ok('risposta all\'audio: ora', /Sono le/.test(await E('document.querySelector("#p-assistant .msg.bot:not(.live):last-child .bub").textContent')));

    // ---- Claude Code: eventi simulati (stessi hook che installa l'app) e sessione vera
    const hubj = JSON.parse(fs.readFileSync(path.join(ud, 'hub.json'), 'utf8')); const hook = (o) => fetch(`http://127.0.0.1:${hubj.port}/claude/hook?token=${hubj.token}`, { method: 'POST', body: JSON.stringify({ session_id: 's-sim', cwd: 'C:\\progetti\\sito-demo', ...o }) });
    await E('__notch.setOpen(false)'); await sleep(900);
    await hook({ hook_event_name: 'SessionStart' }); await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'sistema il bug del login' }); await hook({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'src/login.js' } });
    ok('Claude lavora: pillola e faccina', await wait('__notch.compactText.includes("sito-demo")', 4000) && (await E('document.querySelector("#face-c").dataset.mood')) === 'thinking', await E('__notch.compactText'));
    await shot('06-claude-lavora', { x: 150, y: 0, width: 520, height: 70 });
    await hook({ hook_event_name: 'Notification', message: 'Claude vuole modificare src/login.js' });
    ok('Claude ti aspetta: pillola e faccina in allerta', await wait('__notch.compactText.includes("Claude ti aspetta")', 4000) && (await E('document.querySelector("#face-c").dataset.mood')) === 'alert');
    await shot('07-claude-aspetta', { x: 150, y: 0, width: 520, height: 70 });
    await E('__notch.setOpen(true)'); await sleep(700); await E('__notch.tab("claude")'); await sleep(600);
    ok('scheda Claude mostra la sessione', (await E('document.querySelector("#p-claude").textContent')).includes('sito-demo'));
    ok('scheda Claude: Accetta/Rifiuta solo con VS Code collegato', !(await E('!!document.querySelector("#p-claude [data-vs=\\"claude-vscode.acceptProposedDiff\\"]")')));
    await shot('08-claude-tab');
    const stt = await (async () => { await E('__notch.tab("assistant")'); return say('stato di claude'); })(); ok('"stato di claude" a voce descrive la sessione', /ti aspetta su sito-demo/.test(stt), stt);
    await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'continua' }); await hook({ hook_event_name: 'Stop' }); await sleep(800); await E('__notch.setOpen(false)'); await sleep(900);
    ok('Claude ha finito: pillola', /Claude ha finito/.test(await E('__notch.compactText')), await E('__notch.compactText'));
    // sessione vera di Claude Code con gli hook installati in un file temporaneo (le tue impostazioni non vengono toccate)
    const bin = claude.findClaude();
    if (bin) {
      const home = path.join(tmp, 'home'); claude.install(hubj.port, hubj.token, home); const proj = path.join(tmp, 'progetto-reale'); fs.mkdirSync(proj);
      const cp = spawn(bin, ['-p', 'Rispondi soltanto con la parola: ok', '--output-format', 'text', '--permission-mode', 'plan', '--settings', path.join(home, '.claude', 'settings.json')], { cwd: proj, stdio: ['ignore', 'pipe', 'pipe'] });
      let cout = ''; cp.stdout.on('data', (d) => { cout += d; });
      const seen = await (async () => { const t = Date.now(); while (Date.now() - t < 90000) { const s = JSON.parse(await E('window.nApi.invoke("integration").then(i => JSON.stringify(i.claude.sessions))')); if (s.some((x) => x.project === 'progetto-reale')) return s.find((x) => x.project === 'progetto-reale'); await sleep(500); } return null; })();
      ok('Claude Code reale: la sessione compare nell\'isola tramite gli hook', !!seen, seen);
      await new Promise((r) => cp.on('close', r)); ok('Claude Code reale ha risposto', /ok/i.test(cout), cout.slice(0, 80));
      await sleep(800); const fin = JSON.parse(await E('window.nApi.invoke("integration").then(i => JSON.stringify(i.claude.sessions))')).find((x) => x.project === 'progetto-reale');
      ok('Claude Code reale: a sessione chiusa (SessionEnd) sparisce dall elenco', !fin, fin);
    } else console.log('SKIP Claude Code non trovato');

    // ---- widget
    await E('__notch.setOpen(true)'); await sleep(600); await E('__notch.tab("widgets")'); await sleep(900);
    const have = JSON.parse(await E('JSON.stringify([...document.querySelectorAll("#wgrid .wcard")].map(x => x.dataset.w))'));
    ok('widget predefiniti presenti', ['clock', 'weather', 'timer', 'system', 'todo', 'notes', 'calendar', 'stopwatch', 'calc', 'reminders'].every((w) => have.includes(w)), have);
    ok('widget notes mostra la nota dell\'assistente', (await E('document.querySelector("[data-w=notes]").textContent')).includes('prova dell\'assistente'));
    ok('widget todo mostra l\'attività dell\'assistente', (await E('document.querySelector("[data-w=todo]").textContent')).includes('comprare il latte'));
    ok('widget promemoria mostra il promemoria', (await E('document.querySelector("[data-w=reminders]").textContent')).includes('bere acqua'));
    ok('widget calendario: oggi evidenziato', await E('!!document.querySelector("[data-w=calendar] .today")'));
    ok('widget orologio', /\d\d:\d\d/.test(await E('document.querySelector("[data-w=clock] [data-t]").textContent')));
    ok('widget meteo carica i dati', await wait('document.querySelector("[data-w=weather] .wxnow") !== null', 15000));
    await E('document.querySelector("#wgrid").scrollTop = 0');
    // todo: aggiungi e spunta
    await E('(()=>{const i=document.querySelector("[data-w=todo] [data-in]");i.value="chiamare Anna";i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}));})()'); await sleep(500);
    ok('todo: aggiunta da widget', (await E('document.querySelector("[data-w=todo]").textContent')).includes('chiamare Anna'));
    await E('document.querySelector("[data-w=todo] .todo").click()'); await sleep(400); ok('todo: spunta', await E('!!document.querySelector("[data-w=todo] .todo.done")'));
    // calcolatrice
    for (const k of ['1', '2', '×', '3', '=']) { await E(`document.querySelector('[data-w=calc] [data-k="${k}"]').click()`); await sleep(120); } await sleep(300);
    ok('calcolatrice: 12×3 = 36', (await E('document.querySelector("[data-w=calc] [data-r]").textContent')) === '36');
    // timer e cronometro
    await E('document.querySelector("[data-w=timer] [data-m=\\"5\\"]").click()'); await E('document.querySelector("[data-w=timer] [data-go]").click()'); await sleep(2300);
    ok('timer widget: parte e scende', await E('__notch.timer.running') && /^4:5\d$/.test(await E('document.querySelector("[data-w=timer] [data-d]").textContent')), await E('document.querySelector("[data-w=timer] [data-d]").textContent'));
    await E('document.querySelector("[data-w=timer] [data-rs]").click()'); ok('timer widget: azzera', !(await E('__notch.timer.running')));
    await E('document.querySelector("[data-w=stopwatch] [data-go]").click()'); await sleep(1300); ok('cronometro: conta', await E('__notch.stopwatch.elapsed() > 1'));
    await E('document.querySelector("[data-w=stopwatch] [data-lap]").click()'); await sleep(200); ok('cronometro: giro', await E('__notch.stopwatch.laps.length === 1')); await E('document.querySelector("[data-w=stopwatch] [data-rs]").click()');
    // personalizzazione: attiva gli altri widget e riordina
    await E('document.querySelector("#w-edit").click()'); await sleep(500);
    ok('personalizza: elenco di 15 widget', (await E('document.querySelectorAll("#wedit .wi").length')) === 15);
    for (const w of ['dice', 'breathe', 'convert', 'world', 'links']) await E(`(()=>{const c=document.querySelector('#wedit [data-w="${w}"]'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await sleep(500); await E('document.querySelector("#wedit [data-dn=\\"0\\"]").click()'); await sleep(300);
    ok('personalizza: riordino (orologio spostato giù)', JSON.parse(await E('JSON.stringify(__notch.st.widgets.order.slice(0,2))'))[0] !== 'clock');
    await E('document.querySelector("#w-edit").click()'); await sleep(1500);
    const have2 = JSON.parse(await E('JSON.stringify([...document.querySelectorAll("#wgrid .wcard")].map(x => x.dataset.w))')); ok('personalizza: nuovi widget attivi', ['dice', 'breathe', 'convert', 'world', 'links'].every((w) => have2.includes(w)), have2);
    await E('document.querySelector("[data-w=dice] [data-d=\\"20\\"]").click()'); await sleep(300); ok('widget dado', /^\d+$/.test(await E('document.querySelector("[data-w=dice] [data-r]").textContent')));
    await sleep(800); ok('widget convertitore: 1 km in miglia', /0\.6214/.test(await E('document.querySelector("[data-w=convert] [data-r]").textContent')), await E('document.querySelector("[data-w=convert] [data-r]").textContent'));
    await E('document.querySelector("[data-w=breathe] [data-go]").click()'); await sleep(600); ok('widget respira: parte', /Inspira/.test(await E('document.querySelector("[data-w=breathe] [data-t]").textContent'))); await E('document.querySelector("[data-w=breathe] [data-go]").click()');
    await E('(()=>{document.querySelector("[data-w=links] [data-n]").value="Prova";document.querySelector("[data-w=links] [data-u]").value="example.com";document.querySelector("[data-w=links] [data-add]").click();})()'); await sleep(500);
    ok('widget collegamenti: aggiunta', (await E('document.querySelector("[data-w=links]").textContent')).includes('Prova'));
    ok('widget orari nel mondo', /\d\d:\d\d/.test(await E('document.querySelector("[data-w=world]").textContent')) || (await E('document.querySelectorAll("[data-w=world] select").length')) === 4);
    await E('document.querySelector("#wgrid").scrollTop = 600'); await shot('09-widget-altri');
    await E('document.querySelector("#wgrid").scrollTop = 0'); await shot('09b-widget');

    // ---- impostazioni
    await E('__notch.tab("set")'); await sleep(900);
    await E('document.querySelector("[data-accent=\\"#ff7a90\\"]").click()'); await sleep(300); ok('colore d\'accento', (await E('document.body.style.getPropertyValue("--acc")')) === '#ff7a90');
    await sleep(400); await E('document.querySelector("[data-seg=theme] [data-v=\\"midnight\\"]").click()'); await sleep(300); ok('tema Mezzanotte', (await E('document.body.dataset.theme')) === 'midnight'); await shot('10-mezzanotte');
    await sleep(300); await E('document.querySelector("[data-seg=theme] [data-v=\\"graphite\\"]").click()'); await sleep(300); ok('tema Grafite', (await E('document.body.dataset.theme')) === 'graphite');
    await sleep(300); await E('document.querySelector("[data-seg=theme] [data-v=\\"black\\"]").click()'); await sleep(300);
    await E('document.querySelector("[data-seg=mode] [data-v=\\"notch\\"]").click()'); await sleep(500); ok('modalità Notch', await E('document.body.classList.contains("notch")')); await E('document.querySelector("[data-seg=mode] [data-v=\\"floating\\"]").click()'); await sleep(400);
    await E('document.querySelector("[data-seg=scale] [data-v=\\"1.12\\"]").click()'); await sleep(400); ok('dimensione pillola', (await E('__notch.st.scale')) === 1.12); await E('document.querySelector("[data-seg=scale] [data-v=\\"1\\"]").click()'); await sleep(300);
    await E('document.querySelector("[data-seg=compact] [data-v=\\"clock\\"]").click()'); await sleep(300); await E('document.querySelector("[data-seg=compact] [data-v=\\"auto\\"]").click()'); await sleep(300);
    await E('(()=>{const c=document.querySelector("[data-sw=\\"face.on\\"]");c.checked=false;c.dispatchEvent(new Event("change"));})()'); await sleep(400); ok('faccina nascosta dalle impostazioni', await E('document.body.classList.contains("noface") && getComputedStyle(document.querySelector("#face-c")).display === "none"'));
    await E('(()=>{const c=document.querySelector("[data-sw=\\"face.on\\"]");c.checked=true;c.dispatchEvent(new Event("change"));})()'); await sleep(400);
    await E('(()=>{const c=document.querySelector("#p-set [data-tab=\\"web\\"]");c.checked=false;c.dispatchEvent(new Event("change"));})()'); await sleep(500); ok('scheda Web nascosta', (await E('document.querySelectorAll("#tabs button").length')) === 9 && !(await E('!!document.querySelector("#tabs [data-tab=web]")')));
    await E('(()=>{const c=document.querySelector("#p-set [data-tab=\\"web\\"]");c.checked=true;c.dispatchEvent(new Event("change"));})()'); await sleep(500); ok('scheda Web di nuovo visibile', (await E('document.querySelectorAll("#tabs button").length')) === 10);
    await E('document.querySelector("[data-key=\\"toggle\\"]").click()'); await sleep(200); await c.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F', code: 'KeyF', modifiers: 3, windowsVirtualKeyCode: 70 }); await sleep(600);
    ok('scorciatoia cambiata (Ctrl+Alt+F)', (await E('__notch.st.shortcuts.toggle')) === 'Control+Alt+F', await E('__notch.st.shortcuts.toggle')); await E('window.nApi.send("set", {shortcuts:{toggle:"Control+Alt+N"}})');
    await shot('11-impostazioni');
    ok('impostazioni salvate su disco', await (async () => { await sleep(600); const j = JSON.parse(fs.readFileSync(path.join(ud, 'settings.json'), 'utf8')); return j.settings.accent === '#ff7a90' && j.data.notes.length >= 1 && j.data.todos.length >= 2; })());

    // ---- lingua: pulsante IT/EN (ricarica l'interfaccia), tutto tradotto, assistente nella lingua scelta
    await E('__notch.setOpen(true)'); await sleep(500);
    await E('document.querySelector("#lang-btn").click()'); await sleep(3500); await wait('typeof __notch !== "undefined"', 15000); await sleep(1500);
    ok('lingua: ora inglese (html lang e pulsante EN)', (await E('document.documentElement.lang')) === 'en' && (await E('document.querySelector("#lang-btn").textContent')) === 'EN');
    await E('__notch.setOpen(true)'); await sleep(800);
    ok('lingua: schede tradotte', JSON.stringify(JSON.parse(await E('JSON.stringify([...document.querySelectorAll("#tabs button")].map(b => b.title))')).slice(0, 4)) === JSON.stringify(['Music', 'Assistant', 'Claude', 'Widgets']));
    await E('__notch.tab("set")'); await sleep(900); ok('lingua: impostazioni tradotte', (await E('document.querySelector("#p-set").textContent')).includes('Appearance') && !(await E('document.querySelector("#p-set").textContent')).includes('Aspetto'));
    await shot('13-english'); await E('__notch.tab("assistant")'); await sleep(500);
    ok('lingua: il riconoscimento vocale segue la lingua', (await E('__notch.st.assistant.whisperLang')) === 'en');
    const say2 = async (text) => { const n = await E('document.querySelectorAll("#p-assistant .msg.bot:not(.live)").length'); await E(`(()=>{const i=document.querySelector("#p-assistant [data-text]");i.value=${JSON.stringify(text)};document.querySelector("#p-assistant [data-form]").requestSubmit();})()`); await wait(`document.querySelectorAll("#p-assistant .msg.bot:not(.live)").length > ${n}`, 150000); await sleep(150); return E('document.querySelector("#p-assistant .msg.bot:not(.live):last-child .bub").textContent'); };
    ok('assistente in inglese: frase ambigua "pomodoro" risponde in inglese', /minutes timer started/.test(await say2('pomodoro'))); await E('window.nApi.send("set", {assistant:{tts:false}})'); await say2('stop the timer');
    ok('assistente in inglese: "what time is it"', /It is \d/.test(await say2('what time is it')));
    await shot('14-assistant-english');
    await E('document.querySelector("#lang-btn").click()'); await sleep(3500); await wait('typeof __notch !== "undefined"', 15000); await sleep(1000);
    ok('lingua: si torna all italiano', (await E('document.documentElement.lang')) === 'it');
    // ---- musica reale (controlli sicuri: pausa/ripresa e riposizionamento allo stesso punto)
    await E('__notch.tab("media")'); await sleep(1500);
    const hasTrack = await E('document.querySelector("#m-title").textContent !== "Nessun brano in riproduzione"');
    if (hasTrack) {
      const before = await E('window.nApi.invoke("now").then(JSON.stringify)'); const n0 = JSON.parse(before);
      ok('musica: brano rilevato con titolo, durata e posizione', !!n0.title && n0.dur > 0 && n0.pos >= 0, n0);
      await E('document.querySelector("#m-pp").click()'); await sleep(1800); const n1 = JSON.parse(await E('window.nApi.invoke("now").then(JSON.stringify)')); ok('musica: il pulsante play/pausa cambia lo stato', n1.playing !== n0.playing, [n0.playing, n1.playing]);
      await E('document.querySelector("#m-pp").click()'); await sleep(1800); const n2 = JSON.parse(await E('window.nApi.invoke("now").then(JSON.stringify)')); ok('musica: ripristinato lo stato iniziale', n2.playing === n0.playing);
      const sk = JSON.parse(await E(`window.nApi.invoke("seek", ${n2.pos}).then(JSON.stringify)`)); ok('musica: riposizionamento (seek) accettato', sk.ok === true, sk);
    } else console.log('SKIP nessun brano in riproduzione');
    await shot('12-musica');
  } catch (e) { console.log('ERRORE NEL TEST', e.stack); failed++; }
  finally {
    const late = c.logs.filter((l) => /^(error|EXC)/.test(l) && !/Autofill|favicon/.test(l)); ok('nessun errore finale nella console', late.length === 0, late.slice(0, 4));
    if (/Error|Uncaught/.test(mainLog.replace(/DevTools listening.*/g, ''))) console.log('[main]', mainLog.slice(0, 800));
    c.close(); p.kill();
    try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { timeout: 30000 }); } catch { /* gia' chiusi */ }
    console.log(failed === 0 ? 'APP: TUTTO OK' : `APP: ${failed} PROVE FALLITE`); process.exit(failed ? 1 : 0);
  }
})();
